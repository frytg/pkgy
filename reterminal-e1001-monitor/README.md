# reterminal-e1001-monitor

ESPHome firmware for the **Seeed reTerminal E1001** (7.3″ monochrome ePaper, 800×480) that shows a server-rendered status frame (OpenRouter + Cursor + activity maps).

The device is a **dumb image client**. It joins Wi‑Fi, downloads an 800×480 1-bit PNG from your backend, paints the panel, and deep-sleeps. Layout lives on the server — not on the ESP32.

## Expected backend

Any HTTP origin that serves:

| Path                                    | Role                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| `GET /ext-api/e-ink-monitor/frame.png` | 800×480 monochrome PNG, **always fresh** (~5–8s, no cache)   |

Point `substitutions.frame_base_url` at that origin (no trailing slash). Prefer plain HTTP on LAN/VPN.

Matching Vue preview (for eyeballing): `GET /e-ink/monitor`.

## Why ESPHome

| Path                         | Fit                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------- |
| **ESPHome + `online_image`** | Mono panel via `waveshare_epaper` `7.50inv2`, deep sleep, button wake, HA optional. |
| SenseCraft HMI               | Fine for static galleries; weaker for live URL + sleep cycles.                    |
| Custom Arduino/IDF           | You’d re-implement image download and panel bring-up for little gain.             |

## Hardware

- Seeed reTerminal E1001 (ESP32-S3, 8MB PSRAM, B&W panel)
- USB-C for flash / charge
- 2.4 GHz Wi‑Fi that can reach your backend host

### Controls

| Input                        | Effect                               |
| ---------------------------- | ------------------------------------ |
| Timer wake (default **20min**) | `GET …/e-ink-monitor/frame.png`    |
| Green refresh button (GPIO3) | same URL — new render                |
| HA button (if API enabled)   | “Refresh Frame” — same               |

## Flow

```text
┌──────────────┐   GET frame.png   ┌──────────────────┐
│  E1001       │ ────────────────► │ your backend     │
│  ESPHome     │                   │  always render   │
│  deep sleep  │ ◄──────────────── │  Vue + 1-bit PNG │
└──────────────┘     PNG (~6s)     └──────────────────┘
```

## Setup

```bash
brew install esphome
# or: pipx install esphome

cp secrets.yaml.example secrets.yaml
$EDITOR secrets.yaml
# wifi_ssid, wifi_password
# optional: api_key, ota_password (uncomment those blocks in the yaml)

$EDITOR monitor-frame.yaml
# set substitutions.frame_base_url, e.g. http://192.168.1.50:8080

# USB-C to the E1001, then:
just run
# or: esphome run monitor-frame.yaml
```

First flash needs USB. Later OTA works only while the node is awake (prevent deep sleep via HA, press green button, then OTA).

### Validate backend before flashing

```bash
export FRAME_BASE="http://192.168.1.50:8080"
# expect ~5–8s
curl -fsS -o /tmp/monitor.png "$FRAME_BASE/ext-api/e-ink-monitor/frame.png"
file /tmp/monitor.png   # expect PNG image data, 800 x 480
```

## Config knobs (`substitutions`)

- `frame_base_url` — backend origin, **no trailing slash**
- `sleep_duration` — default `20min` (raise if battery-first)
- `run_duration` — max awake window (default `90s`)
- `panel_refresh_wait` — delay after `component.update` before sleep (default `20s`; B&W is quicker than Spectra 6)
- `device_name` / `friendly_name` — mDNS / HA

## Display notes

- Panel is **1-bit**. Backend must ship monochrome (this stack greyscales + `-monochrome` before crop).
- `online_image.type: BINARY` matches the panel; don’t pull Spectra-6 color frames onto E1001.
- Invert at draw time if the panel is black-on-white wrong-way:
  `it.image(0, 0, id(monitor_frame), COLOR_OFF, COLOR_ON)` (there is no `invert_alpha` on `online_image`).
- ESPHome has no `Seeed-reTerminal-E1001` board preset (only E1002/E1004/Sticky on `epaper_spi`). Mono path is Seeed’s cookbook:
  - `platform: waveshare_epaper`
  - `model: 7.50inv2` (try `7.50inv2alt` if complex frames look muddy)
  - pins `cs=10 dc=11 reset=12 busy=13` (busy inverted), SPI `clk=7 mosi=9`

## Sleep / battery

Continuous Wi‑Fi drains the pack quickly. Deep sleep + timed wakes is the intended mode. Every wake asks the server to render (~5–8s) — `http_request.timeout` is 90s for headroom.

**Do not sleep immediately from `on_download_finished`.** Sleep mid-refresh looks like “download worked, screen never changed.” This config:

1. paints on download (`show_and_sleep`)
2. waits `panel_refresh_wait` (default 20s)
3. then `deep_sleep.enter`
4. `run_duration` (default 90s) is a deadman if that path never runs

Pull starts on `wifi.on_connect`, not bare `on_boot`.

Debug awake: raise `run_duration`, comment out `deep_sleep:`, press green button, then:

```bash
just logs
```

## Network tips

- Device cannot use `localhost` — use a LAN or VPN address the E1001 can route to.
- `verify_ssl: false` keeps HTTP simple; HTTPS needs a trust store on device.

## Layout

```text
monitor-frame.yaml     ESPHome config
secrets.yaml.example   copy → secrets.yaml
justfile               config / build / run / logs
README.md
```

## Related

- Color Discogs sibling: [`../reterminal-e1002-discogs`](../reterminal-e1002-discogs)
- Backend endpoints (dashy): `/e-ink/monitor`, `/ext-api/e-ink-monitor/frame.png`
