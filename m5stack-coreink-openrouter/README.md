# m5stack-coreink-openrouter

Minimal OpenRouter activity display for the **M5Stack CoreInk** (ESP32-PICO-D4 with a 200×200 1-bit e-ink display).

Fetches a JSON activity endpoint and renders the essentials:

- token volume (large headline)
- total cost
- top 5 models by tokens

Light-sleeps between updates. Wakes on the front joystick or every `REFRESH_MINUTES` minutes.

Built on [M5Unified](https://github.com/m5stack/M5Unified). The display is accessed via `M5.Display` (an LGFX instance) and rendered into an offscreen `LGFX_Sprite` before a single partial refresh.

## Hardware

- M5Stack CoreInk (ESP32-PICO-D4, GDEW0154 e-ink panel)
- USB-C cable for flashing + serial monitor
- 2.4 GHz WiFi network

### Controls

| Input          | GPIO | Action                                         |
| -------------- | ---- | ---------------------------------------------- |
| Joystick up    | G37  | previous org (`all` → `work` → `personal` → …) |
| Joystick down  | G39  | next org (`all` → `personal` → `work` → …)     |
| Joystick press | G38  | force network refresh                          |
| Timer          | —    | auto-refresh every `REFRESH_MINUTES`           |

Org toggles re-render from the last fetched payload (always requested as `org=all`) so switching views doesn’t hit the network. A press or timer wake re-fetches.

## Setup

```bash
# install PlatformIO (https://platformio.org/install/cli)
brew install platformio

cp src/secrets.h.example src/secrets.h
$EDITOR src/secrets.h
# fill in WIFI_SSID, WIFI_PASSWORD, API_BASE_URL
#
# API_BASE_URL should be a plain HTTP URL on the backend's LAN or
# Tailscale IP — the firmware uses WiFiClient (not WiFiClientSecure), so
# HTTPS endpoints need a working mbedTLS CA chain. e.g.:
#   http://10.0.0.10:8080

pio run -t upload
pio device monitor  # optional — useful for debugging
```

Or via the justfile:

```bash
just flash
just monitor
```

The CoreInk appears as a USB serial device; on macOS it's usually `/dev/cu.usbserial-*`. The first upload will trigger a one-time driver handshake — if it fails, hold the reset button (top of device) for ~1s and retry.

## Endpoint

The device calls:

```
GET {API_BASE_URL}/ext-api/openrouter/activity?days={ACTIVITY_DAYS}&org=all
```

Expected JSON shape (trimmed — the firmware filters to just these fields):

```json
{
  "generatedAt": "2026-07-25T14:22:37.748Z",
  "orgs": {
    "personal": {
      "cost": 11.62,
      "requests": 1325,
      "tokensTotal": 51891314,
      "tokensPrompt": 51163162,
      "tokensCompletion": 728152,
      "cachedTokens": 43080466,
      "cacheHitRate": 0.84,
      "topModels": [{ "model": "provider/model-name", "tokens": 36524919 }]
    },
    "work": {
      "cost": 0,
      "requests": 0,
      "tokensTotal": 0,
      "tokensPrompt": 0,
      "tokensCompletion": 0,
      "cachedTokens": 0,
      "cacheHitRate": 0,
      "topModels": []
    }
  }
}
```

`org` query values accepted by a matching backend: `personal`, `work`, `all`. The firmware always requests `all` and switches the rendered view locally.

## TLS

The firmware is configured for plain HTTP (e.g. `http://10.0.0.10:8080` on a private LAN or Tailscale address). Pointing `API_BASE_URL` at `https://` needs a working CA chain on-device; keep it HTTP on a private network if you can.

## Sleep

`REFRESH_MINUTES=15` is a sensible default — e-ink doesn’t need frequent updates. Light sleep keeps the last payload in DRAM so org toggles stay instant; power draw is still low between wakes. Bump it up if you want longer battery life (USB-powered devices are unaffected).

## Layout

```
 7d · all       upd 14:22Z
──────────────────────────
         51.9M              ← size 4 tokens
        tokens
        $12.34              ← size 2
──────────────────────────
 #1  1.2M  claude-sonnet-4
 #2  320K  gpt-4o
 #3  80.0K gemini-2-flash
 #4  40.0K deepseek-v4
 #5  12.0K grok-4.5          ← names share one column
```
