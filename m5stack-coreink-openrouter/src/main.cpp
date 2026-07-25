// M5Stack CoreInk — minimal OpenRouter activity display.
//
// Fetches /ext-api/openrouter/activity from the backend, then renders the
// essentials: total cost, requests, tokens, cache hit rate, and the top
// model by tokens. Light sleep between idle ticks; wakes on the joystick
// (G37 up / G39 down cycle org, G38 centre refreshes) or the timer.
//
// Configuration lives in src/secrets.h — see secrets.h.example.

#include <Arduino.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <M5Unified.h>
#include <WiFi.h>
#include <esp_heap_caps.h>
#include <esp_sleep.h>

#include "secrets.h"

#ifndef WIFI_SSID
#error "Copy src/secrets.h.example to src/secrets.h and fill in your values."
#endif

// Prefer API_BASE_URL; fall back to the older DASHY_BASE_URL macro if present.
#if !defined(API_BASE_URL) && defined(DASHY_BASE_URL)
#define API_BASE_URL DASHY_BASE_URL
#endif
#ifndef API_BASE_URL
#error "Define API_BASE_URL (or legacy DASHY_BASE_URL) in src/secrets.h"
#endif

// Display geometry — CoreInk is 200x200 1-bit e-ink (GDEW0154*).
static const int W = 200;
static const int H = 200;

// CoreInk front joystick (active-low with internal pull-ups):
//   G37 = up, G38 = centre/press, G39 = down
static const gpio_num_t PIN_JOY_UP = GPIO_NUM_37;
static const gpio_num_t PIN_JOY_MID = GPIO_NUM_38;
static const gpio_num_t PIN_JOY_DOWN = GPIO_NUM_39;

// Temporary merge buffer for per-org top models (API returns up to 5 each).
static const int TOP_IN_CAP = 5;
// Final rendered top-N list — 5 compact size-1 rows fit below the cost band.
static const int TOP_OUT_CAP = 5;

// Org cycle order used by the joystick up/down toggle.
static const char *const ORG_CYCLE[] = {"all", "personal", "work"};
static const int ORG_CYCLE_N = 3;

// Draw into an offscreen LGFX sprite, then push once. This is the
// standard M5Unified pattern for e-ink — it keeps the slow partial
// refresh to a single operation.
LGFX_Sprite sprite(&M5.Display);

// Survives light sleep so the joystick can keep the selected org across wakes.
RTC_DATA_ATTR int gOrgIdx = -1;

struct Totals {
	double cost = 0;
	uint64_t requests = 0;
	uint64_t tokens = 0;
	uint64_t tokensPrompt = 0;
	uint64_t tokensCompletion = 0;
	uint64_t cachedTokens = 0;
	double cacheHitRate = 0;
};

struct TopModel {
	String model;
	uint64_t tokens = 0;
};

struct Activity {
	Totals personal;
	Totals work;
	// Per-org top-models kept so a local org toggle can re-merge without fetch.
	TopModel personalTop[TOP_IN_CAP];
	int personalTopN = 0;
	TopModel workTop[TOP_IN_CAP];
	int workTopN = 0;
	// View-selected top list (after merge / single-org pick).
	TopModel top[TOP_OUT_CAP];
	int topCount = 0;
	String generatedAt;
	bool ok = false;
	String error;
};

// Last fetched activity kept in DRAM between light-sleep wakes so an org
// toggle can re-render without a network round-trip.
static Activity gLast;
static bool gHaveLast = false;

/**
 * Log free heap (and largest free block) so RAM squeezes show up on serial.
 * @param tag short label for the log line
 */
static void logHeap(const char *tag) {
	Serial.printf(
		"[heap] %s: free=%u largest=%u\n",
		tag,
		(unsigned)ESP.getFreeHeap(),
		(unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)
	);
}

/**
 * Compact a large integer into a short display string (e.g. 1.5K / 2.3M).
 * @param n value to format
 * @returns compact string
 */
static String formatCompact(uint64_t n) {
	if (n >= 1000000000ULL) return String((float)n / 1e9, 1) + "B";
	if (n >= 1000000ULL) return String((float)n / 1e6, 1) + "M";
	if (n >= 1000ULL) return String((float)n / 1e3, 1) + "K";
	return String((unsigned long)n);
}

/**
 * Shorten "anthropic/claude-sonnet-4" to "claude-sonnet-4".
 * @param full provider/model string
 * @returns model name without provider prefix
 */
static String shortModel(const String &full) {
	int slash = full.indexOf('/');
	if (slash < 0) return full;
	return full.substring(slash + 1);
}

/**
 * Resolve the display org from RTC state or the secrets.h default.
 * @returns org string: "all" | "personal" | "work"
 */
static const char *currentOrg() {
	if (gOrgIdx < 0 || gOrgIdx >= ORG_CYCLE_N) {
		// Seed from ACTIVITY_ORG the first time after a cold boot.
		String def = String(ACTIVITY_ORG);
		gOrgIdx = 0;
		for (int i = 0; i < ORG_CYCLE_N; i++) {
			if (def == ORG_CYCLE[i]) {
				gOrgIdx = i;
				break;
			}
		}
	}
	return ORG_CYCLE[gOrgIdx];
}

/**
 * Advance or reverse the org cycle. Wraps at both ends.
 * @param delta +1 = down / next, -1 = up / previous
 */
static void cycleOrg(int delta) {
	if (gOrgIdx < 0 || gOrgIdx >= ORG_CYCLE_N) (void)currentOrg();
	gOrgIdx = (gOrgIdx + delta + ORG_CYCLE_N) % ORG_CYCLE_N;
	Serial.printf("[ui] org -> %s\n", ORG_CYCLE[gOrgIdx]);
}

/**
 * Sum two org totals and recompute cache-hit rate from the merged prompts.
 * @param a first org totals
 * @param b second org totals
 * @returns merged totals
 */
static Totals sumTotals(const Totals &a, const Totals &b) {
	Totals out;
	out.cost = a.cost + b.cost;
	out.requests = a.requests + b.requests;
	out.tokens = a.tokens + b.tokens;
	out.tokensPrompt = a.tokensPrompt + b.tokensPrompt;
	out.tokensCompletion = a.tokensCompletion + b.tokensCompletion;
	out.cachedTokens = a.cachedTokens + b.cachedTokens;
	uint64_t promptTotal = out.tokensPrompt;
	out.cacheHitRate = promptTotal > 0 ? (double)out.cachedTokens / (double)promptTotal : 0.0;
	return out;
}

/**
 * Merge two top-model lists by name, sort by tokens desc, cap at outCap.
 * Writes only into [0, outCap). Never grows past outCap.
 * @param a first list
 * @param ac count of first list
 * @param b second list
 * @param bc count of second list
 * @param out destination buffer
 * @param outN set to number of entries written
 * @param outCap capacity of out
 */
static void mergeTop(
	const TopModel *a,
	int ac,
	const TopModel *b,
	int bc,
	TopModel *out,
	int &outN,
	int outCap
) {
	TopModel stage[TOP_IN_CAP * 2];
	int n = 0;

	for (int i = 0; i < ac && n < TOP_IN_CAP * 2; i++) stage[n++] = a[i];
	for (int i = 0; i < bc && n < TOP_IN_CAP * 2; i++) {
		bool merged = false;
		for (int j = 0; j < n; j++) {
			if (stage[j].model == b[i].model) {
				stage[j].tokens += b[i].tokens;
				merged = true;
				break;
			}
		}
		if (!merged) stage[n++] = b[i];
	}

	// selection-sort by tokens desc — n is tiny (≤10).
	for (int i = 0; i < n; i++) {
		int best = i;
		for (int j = i + 1; j < n; j++) {
			if (stage[j].tokens > stage[best].tokens) best = j;
		}
		if (best != i) {
			TopModel tmp = stage[i];
			stage[i] = stage[best];
			stage[best] = tmp;
		}
	}

	outN = n < outCap ? n : outCap;
	for (int i = 0; i < outN; i++) out[i] = stage[i];
}

/**
 * Apply the active org view to fill Activity.top from the cached per-org lists.
 * @param a activity with personalTop/workTop already populated
 * @param org view: "all" | "personal" | "work"
 */
static void applyOrgView(Activity &a, const char *org) {
	if (strcmp(org, "personal") == 0) {
		a.topCount = a.personalTopN < TOP_OUT_CAP ? a.personalTopN : TOP_OUT_CAP;
		for (int i = 0; i < a.topCount; i++) a.top[i] = a.personalTop[i];
		return;
	}
	if (strcmp(org, "work") == 0) {
		a.topCount = a.workTopN < TOP_OUT_CAP ? a.workTopN : TOP_OUT_CAP;
		for (int i = 0; i < a.topCount; i++) a.top[i] = a.workTop[i];
		return;
	}
	mergeTop(a.personalTop, a.personalTopN, a.workTop, a.workTopN, a.top, a.topCount, TOP_OUT_CAP);
}

/**
 * Read org totals from a JSON object produced by the activity endpoint.
 * @param o org object (personal or work)
 * @returns filled Totals
 */
static Totals readTotals(JsonObjectConst o) {
	Totals t;
	if (o.isNull()) return t;
	t.cost = o["cost"].as<double>();
	t.requests = o["requests"].as<uint64_t>();
	t.tokens = o["tokensTotal"].as<uint64_t>();
	t.tokensPrompt = o["tokensPrompt"].as<uint64_t>();
	t.tokensCompletion = o["tokensCompletion"].as<uint64_t>();
	t.cachedTokens = o["cachedTokens"].as<uint64_t>();
	t.cacheHitRate = o["cacheHitRate"].as<double>();
	return t;
}

/**
 * Read up to TOP_IN_CAP top-models from an org object.
 * @param o org object
 * @param out destination buffer
 * @returns number of models written
 */
static int readTopModels(JsonObjectConst o, TopModel *out) {
	int n = 0;
	if (o.isNull()) return 0;
	JsonArrayConst arr = o["topModels"].as<JsonArrayConst>();
	if (arr.isNull()) return 0;
	for (JsonObjectConst m : arr) {
		if (n >= TOP_IN_CAP) break;
		out[n].model = m["model"].as<const char *>();
		out[n].tokens = m["tokens"].as<uint64_t>();
		n++;
	}
	return n;
}

// Parsed host/port from API_BASE_URL — filled once, reused on retries.
static String gApiHost;
static uint16_t gApiPort = 80;
static bool gApiUrlOk = false;

/**
 * Parse API_BASE_URL into host + port. Cached after the first call.
 * @returns true when the URL is usable
 */
static bool ensureApiUrl() {
	if (gApiUrlOk) return true;

	String baseUrl = String(API_BASE_URL);
	int protoEnd = baseUrl.indexOf("://");
	if (protoEnd < 0) return false;
	String hostPort = baseUrl.substring(protoEnd + 3);
	int basePathStart = hostPort.indexOf('/');
	if (basePathStart >= 0) hostPort = hostPort.substring(0, basePathStart);
	int colonPos = hostPort.indexOf(':');
	gApiHost = colonPos >= 0 ? hostPort.substring(0, colonPos) : hostPort;
	gApiPort = colonPos >= 0 ? (uint16_t)hostPort.substring(colonPos + 1).toInt() : 80;
	if (gApiPort == 0) gApiPort = 80;
	gApiUrlOk = gApiHost.length() > 0;
	return gApiUrlOk;
}

/**
 * One HTTP GET attempt against the activity endpoint.
 * @param a filled on success or with a.error on failure
 * @returns true on a successful parse
 */
static bool fetchActivityOnce(Activity &a) {
	if (!ensureApiUrl()) {
		a.error = "bad url";
		return false;
	}

	// Always fetch org=all so both buckets are present for local toggles.
	String path = String("/ext-api/openrouter/activity?days=") + ACTIVITY_DAYS + "&org=all";

	Serial.printf("[boot] fetch: %s:%d %s\n", gApiHost.c_str(), gApiPort, path.c_str());
	logHeap("pre-http");

	// Fresh client every attempt — light sleep leaves half-open TCP sockets
	// that return errno 113 (EHOSTUNREACH / connection abort).
	WiFiClient wifi;
	wifi.setTimeout(15000); // milliseconds — 15 was a near-instant fail

	HttpClient client(wifi, gApiHost.c_str(), gApiPort);
	client.setHttpResponseTimeout(20000);
	client.beginRequest();
	int getRc = client.get(path.c_str());
	if (getRc != 0) {
		Serial.printf("[boot] fetch: begin get rc=%d wifi=%d\n", getRc, (int)WiFi.status());
		a.error = "connect";
		client.stop();
		return false;
	}
	client.sendHeader("User-Agent", "m5stack-coreink-openrouter/1.0");
	client.sendHeader("Connection", "close");
	client.endRequest();

	int statusCode = client.responseStatusCode();
	Serial.printf("[boot] fetch: status %d\n", statusCode);

	if (statusCode <= 0) {
		a.error = "sock " + String(statusCode);
		client.stop();
		return false;
	}
	if (statusCode != 200) {
		a.error = "http " + String(statusCode);
		client.stop();
		return false;
	}

	// Stream body straight into ArduinoJson with a filter so
	// timeseries/credits never land in RAM (heap was the prior crash).
	(void)client.skipResponseHeaders();
	int contentLength = client.contentLength();
	Serial.printf("[boot] fetch: content-length %d\n", contentLength);
	logHeap("pre-json");

	JsonDocument filter;
	filter["generatedAt"] = true;
	filter["orgs"] = true;

	JsonDocument doc;

	Serial.println("[boot] fetch: parsing JSON (filtered stream)");
	DeserializationError err = deserializeJson(
		doc,
		client,
		DeserializationOption::Filter(filter),
		DeserializationOption::NestingLimit(8)
	);
	client.stop();
	logHeap("post-json");

	if (err) {
		Serial.printf("[boot] fetch: json err %s\n", err.c_str());
		a.error = "json ";
		a.error += err.c_str();
		return false;
	}

	Serial.println("[boot] fetch: mapping fields");
	const char *gen = doc["generatedAt"] | "";
	a.generatedAt = gen;

	JsonObjectConst orgs = doc["orgs"].as<JsonObjectConst>();
	JsonObjectConst p = orgs["personal"].as<JsonObjectConst>();
	// Accept both modern `work` and legacy `swr` keys during the rename window.
	JsonObjectConst w = orgs["work"].as<JsonObjectConst>();
	if (w.isNull()) w = orgs["swr"].as<JsonObjectConst>();

	a.personal = readTotals(p);
	a.work = readTotals(w);
	a.personalTopN = readTopModels(p, a.personalTop);
	a.workTopN = readTopModels(w, a.workTop);

	doc.clear();
	a.ok = true;
	a.error = "";
	Serial.printf("[boot] fetch: ok tokP=%llu tokW=%llu\n",
		(unsigned long long)a.personal.tokens,
		(unsigned long long)a.work.tokens);
	return true;
}

/**
 * Fetch and parse /ext-api/openrouter/activity with both orgs so local
 * joystick toggles can re-render without another round-trip.
 * Retries + WiFi revive cover post-light-sleep socket aborts (errno 113).
 * Sprite is deliberately NOT allocated yet so the parser has heap room.
 * @returns Activity with ok=true on success
 */
static Activity fetchActivity() {
	Activity a;
	const int maxAttempts = 3;
	for (int attempt = 1; attempt <= maxAttempts; attempt++) {
		Serial.printf("[boot] fetch attempt %d/%d\n", attempt, maxAttempts);
		Activity tryA;
		if (fetchActivityOnce(tryA)) return tryA;
		a = tryA;

		// Revive a half-open station association left over from light sleep.
		Serial.printf("[boot] fetch fail (%s), reviving wifi\n", a.error.c_str());
		WiFi.disconnect(false, false);
		delay(200);
		WiFi.mode(WIFI_STA);
		WiFi.setSleep(false);
		WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
		int tries = 0;
		while (WiFi.status() != WL_CONNECTED && tries < 30) {
			delay(200);
			tries++;
		}
		Serial.printf("[boot] wifi after revive: %s\n",
			WiFi.status() == WL_CONNECTED ? "ok" : "fail");
		if (WiFi.status() != WL_CONNECTED) break;
		delay(300); // let DHCP/ARP settle before the next TCP connect
	}
	return a;
}

/**
 * Pick the Totals for the active org view.
 * @param a activity payload
 * @param org view name
 * @returns totals for that view
 */
static Totals totalsForOrg(const Activity &a, const char *org) {
	if (strcmp(org, "personal") == 0) return a.personal;
	if (strcmp(org, "work") == 0) return a.work;
	return sumTotals(a.personal, a.work);
}

/**
 * Render activity into the offscreen sprite and push it to the panel.
 * Tokens are the primary headline; cost is secondary.
 * @param a activity payload (may be an error state)
 * @param org active view name
 */
static void renderActivity(const Activity &a, const char *org) {
	Totals t = totalsForOrg(a, org);

	// 1-bit sprite: 200x200/8 = 5 KB. Default (inherited grayscale_8bit)
	// would be 40 KB and was starving the JSON parser on the PICO-D4.
	sprite.setColorDepth(1);
	if (sprite.createSprite(W, H) == nullptr) {
		Serial.println("[boot] sprite: create failed");
		return;
	}
	logHeap("post-sprite");

	// 1-bit: 0 = black, 1 = white on CoreInk. No outer border — more room
	// for glyphs and cleaner e-ink edges.
	sprite.fillScreen(1);

	// header — period / org
	String header = String(ACTIVITY_DAYS) + "d · " + org;
	sprite.setTextSize(1);
	sprite.setTextColor(0, 1);
	sprite.setCursor(4, 4);
	sprite.print(header);

	// generated time, right-aligned. ISO timestamps from the API are UTC.
	String stamp = "upd ";
	if (a.generatedAt.length() >= 16) {
		stamp += a.generatedAt.substring(11, 16);
		stamp += "Z";
	}
	int stampW = stamp.length() * 6; // 6px per char at size 1
	sprite.setCursor(W - stampW - 4, 4);
	sprite.print(stamp);

	// horizontal divider
	sprite.drawLine(0, 18, W, 18, 0);

	// primary headline: token volume
	sprite.setTextSize(4);
	String tokStr = formatCompact(t.tokens);
	int tokW = tokStr.length() * 24; // size 4 ≈ 24px wide per char
	int tokX = (W - tokW) / 2;
	if (tokX < 0) tokX = 0;
	sprite.setCursor(tokX, 28);
	sprite.print(tokStr);

	// unit label under the number
	sprite.setTextSize(1);
	const char *tokUnit = "tokens";
	int unitW = 6 * 6; // "tokens"
	sprite.setCursor((W - unitW) / 2, 64);
	sprite.print(tokUnit);

	// secondary: cost only, size 2. Short enough that it always fits one line
	// ("$12.34" ≈ 72px) and clears the top-list band below.
	String costStr = String("$") + String(t.cost, 2);
	sprite.setTextSize(2);
	int costW = costStr.length() * 12;
	int costX = (W - costW) / 2;
	if (costX < 2) costX = 2;
	const int costY = 78;
	sprite.setCursor(costX, costY);
	sprite.print(costStr);

	// size-2 glyph is ~16px tall → bottom ≈ costY+16. Keep the list clear.
	const int listDividerY = 100;
	const int listRowY0 = listDividerY + 8;
	const int listRowH = 14; // compact size-1 rows

	// top models — equal rows with a fixed name column:
	//   #1  1.2M  claude-sonnet-4
	//   #2  320K  gpt-4o
	// size-1 mono is ~6px/char, so columns land on character boundaries.
	sprite.drawLine(0, listDividerY, W, listDividerY, 0);
	sprite.setTextSize(1);
	if (!a.ok) {
		sprite.setCursor(4, listRowY0);
		sprite.print("err: ");
		sprite.print(a.error);
	} else if (a.topCount > 0) {
		const int charW = 6;
		const int rankX = 4;
		const int tokColX = rankX + 3 * charW; // after "#N "
		// 5 chars for tokens ("12.3M") + 1 char spacer before the name column
		const int nameX = tokColX + 6 * charW;
		for (int i = 0; i < a.topCount && i < TOP_OUT_CAP; i++) {
			int y = listRowY0 + i * listRowH;
			sprite.setCursor(rankX, y);
			sprite.print('#');
			sprite.print(i + 1);

			String tok = formatCompact(a.top[i].tokens);
			sprite.setCursor(tokColX, y);
			sprite.print(tok);

			sprite.setCursor(nameX, y);
			sprite.print(shortModel(a.top[i].model));
		}
	} else {
		sprite.setCursor(4, listRowY0);
		sprite.print("(no usage in window)");
	}

	sprite.pushSprite(0, 0);
	M5.Display.display();
	sprite.deleteSprite();
}

/**
 * Connect to WiFi using secrets.h credentials. Blocks ~20s max.
 * @param force when true, disconnect and re-associate even if status looks up
 */
static void connectWifi(bool force = false) {
	// Modem sleep after light sleep often leaves WL_CONNECTED with a dead
	// radio → TCP connect fails with errno 113. Force a clean associate
	// whenever the caller asks (e.g. every network refresh).
	if (force || WiFi.status() != WL_CONNECTED) {
		WiFi.persistent(false);
		WiFi.mode(WIFI_STA);
		WiFi.setSleep(false); // WIFI_PS_NONE equivalent for Arduino
		if (force && WiFi.status() == WL_CONNECTED) {
			WiFi.disconnect(false, false);
			delay(100);
		}
		WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
	}
	int tries = 0;
	while (WiFi.status() != WL_CONNECTED && tries < 40) { // ~20s
		delay(500);
		tries++;
	}
	if (WiFi.status() == WL_CONNECTED) {
		// Completing association ≠ route is ready; brief settle helps ARP.
		delay(150);
	}
}

/**
 * Configure the three joystick GPIOs as inputs with pull-ups.
 */
static void initJoystick() {
	pinMode(PIN_JOY_UP, INPUT_PULLUP);
	pinMode(PIN_JOY_MID, INPUT_PULLUP);
	pinMode(PIN_JOY_DOWN, INPUT_PULLUP);
}

/**
 * True when a pin is held low (pressed). Active-low with pull-up.
 * @param pin GPIO number
 * @returns true if pressed
 */
static bool pinPressed(gpio_num_t pin) {
	return digitalRead(pin) == LOW;
}

/**
 * Wait until all joystick pins are released, with a small settle delay.
 */
static void waitJoystickRelease() {
	uint32_t start = millis();
	while (pinPressed(PIN_JOY_UP) || pinPressed(PIN_JOY_MID) || pinPressed(PIN_JOY_DOWN)) {
		if (millis() - start > 2000) break;
		delay(10);
	}
	delay(30);
}

/**
 * Enter light sleep until a joystick edge or the refresh timer fires.
 * Light sleep (not deep) keeps DRAM + the last activity cache intact while
 * still sipping power between taps / refreshes.
 */
static void sleepUntilInputOrTimer() {
	// gpio wakeup works from light sleep on classic ESP32; active-low so
	// wake when the pin is driven LOW.
	gpio_wakeup_enable(PIN_JOY_UP, GPIO_INTR_LOW_LEVEL);
	gpio_wakeup_enable(PIN_JOY_MID, GPIO_INTR_LOW_LEVEL);
	gpio_wakeup_enable(PIN_JOY_DOWN, GPIO_INTR_LOW_LEVEL);
	esp_sleep_enable_gpio_wakeup();

	uint64_t sleepUs = (uint64_t)REFRESH_MINUTES * 60ULL * 1000000ULL;
	esp_sleep_enable_timer_wakeup(sleepUs);

	Serial.printf("[boot] light-sleep up to %u min (joy wake)\n", (unsigned)REFRESH_MINUTES);
	Serial.flush();
	esp_light_sleep_start();

	// Clear wake sources so the next sleep reconfigures cleanly.
	esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
}

/**
 * Pull fresh activity from the network and cache it.
 * On failure, keeps the previous good cache so org toggles still work and
 * the screen can show stale-ok data with the new error only if nothing
 * has ever loaded.
 * @returns true if the fetch succeeded
 */
static bool refreshFromNetwork() {
	// Force re-associate after light sleep — sticky WL_CONNECTED is a lie.
	connectWifi(true);
	Serial.printf("[boot] wifi: %s rssi=%d ip=%s\n",
		WiFi.status() == WL_CONNECTED ? "ok" : "fail",
		WiFi.RSSI(),
		WiFi.localIP().toString().c_str());
	logHeap("post-wifi");

	if (WiFi.status() != WL_CONNECTED) {
		if (!gHaveLast) {
			gLast = Activity();
			gLast.error = "wifi";
		}
		return false;
	}

	Activity a = fetchActivity();
	Serial.printf("[boot] fetch: ok=%d err=%s\n", a.ok, a.error.c_str());
	if (a.ok) {
		gLast = a;
		gHaveLast = true;
		return true;
	}
	// Keep last good payload; surface the error only when we have nothing.
	if (!gHaveLast) {
		gLast = a;
	}
	return false;
}

/**
 * Re-apply the current org view and redraw.
 */
static void renderCurrent() {
	const char *org = currentOrg();
	Activity view = gLast;
	if (gHaveLast) applyOrgView(view, org);
	else view.topCount = 0;
	renderActivity(view, org);
	logHeap("post-render");
}

void setup() {
	Serial.begin(115200);
	Serial.println("[boot] setup: enter");
	delay(50);

	Serial.println("[boot] before M5.begin");
	auto cfg = M5.config();
	// Keep internal speaker/mic/led quiet; we only need the panel + buttons.
	cfg.internal_imu = false;
	cfg.internal_rtc = false;
	cfg.internal_spk = false;
	cfg.internal_mic = false;
	M5.begin(cfg);
	Serial.println("[boot] after M5.begin");
	logHeap("post-begin");

	// e-ink text mode: faster partial refresh, less ghosting on
	// text-heavy pages.
	M5.Display.setEpdMode(epd_mode_t::epd_text);
	// Panel itself to 1-bit so its internal buffer stays tiny too.
	M5.Display.setColorDepth(1);
	Serial.println("[boot] after setEpdMode");
	logHeap("post-epd");

	initJoystick();
	(void)currentOrg(); // seed gOrgIdx from secrets on first boot

	// Initial fetch before any sprite allocation. Previous order locked
	// ~40 KB of grayscale sprite first, then OOM'd mid-ArduinoJson.
	refreshFromNetwork();
	renderCurrent();
}

void loop() {
	// Poll for a short window so a held/pressed joystick is noticed even
	// if light-sleep wake reports are flaky, then sleep until the next
	// interesting edge or the refresh timer.
	uint32_t pollUntil = millis() + 250;
	int action = 0; // 0 none, +1 org next, -1 org prev, 2 refresh
	while ((int32_t)(millis() - pollUntil) < 0) {
		if (pinPressed(PIN_JOY_UP)) {
			action = -1;
			break;
		}
		if (pinPressed(PIN_JOY_DOWN)) {
			action = +1;
			break;
		}
		if (pinPressed(PIN_JOY_MID)) {
			action = 2;
			break;
		}
		delay(10);
	}

	if (action == 0) {
		// Nothing pressed right now — sleep until joystick or timer.
		sleepUntilInputOrTimer();

		// On wake, re-sample. Timer wake with no press → timed refresh.
		if (pinPressed(PIN_JOY_UP)) action = -1;
		else if (pinPressed(PIN_JOY_DOWN)) action = +1;
		else if (pinPressed(PIN_JOY_MID)) action = 2;
		else action = 2; // timer (or unknown) → refresh
	}

	waitJoystickRelease();

	if (action == 2) {
		Serial.println("[ui] refresh");
		refreshFromNetwork();
		renderCurrent();
	} else {
		cycleOrg(action);
		// Org toggle is free if we already have both buckets cached.
		if (!gHaveLast) refreshFromNetwork();
		renderCurrent();
	}
}
