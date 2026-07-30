# reterminal-e1002-discogs

ESPHome firmware for the **Seeed reTerminal E1002** (7.3″ Spectra 6, 800×480) that shows one random Discogs album cover + metadata.

The device is a **dumb image client**. It joins Wi‑Fi, downloads an 800×480 PNG from your backend, paints the panel, and deep-sleeps. Layout, Discogs API, and Spectra-6 dither live on the server — not on the ESP32.

## Expected backend

Any HTTP origin that serves:

| Path                             | Role                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| `GET /ext-api/discogs/frame.png` | 800×480 PNG, **always fresh** screenshot (~5–6s, no cache) |

Point `substitutions.frame_base_url` at that origin (no trailing slash). Prefer plain HTTP on LAN/VPN; device TLS trust adds friction.

No `?force=` param — every GET is a new album.

## Why ESPHome

| Path                         | Fit                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------- |
| **ESPHome + `online_image`** | First-class `Seeed-reTerminal-E1002` model, deep sleep, button wake, HA optional. |
| SenseCraft HMI               | Fine for static galleries; weaker for live URL + 6h sleep.                       |
| Custom Arduino/IDF           | You’d re-implement image download and panel bring-up for little gain.            |

## Hardware

- Seeed reTerminal E1002 (ESP32-S3, 8MB PSRAM, Spectra 6 panel)
- USB-C for flash / charge
- 2.4 GHz Wi‑Fi that can reach your backend host

### Controls

| Input                        | Effect                                      |
| ---------------------------- | ------------------------------------------- |
| Timer wake (default **6h**)  | `GET …/frame.png` — new random album        |
| Green refresh button (GPIO3) | same URL — new random album                 |
| HA button (if API enabled)   | “Refresh Frame” — same                      |

## Flow

```text
┌──────────────┐   GET frame.png   ┌──────────────────┐
│  E1002       │ ────────────────► │ your backend     │
│  ESPHome     │                   │  always render   │
│  deep sleep  │ ◄──────────────── │  Discogs + PNG   │
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

$EDITOR discogs-frame.yaml
# set substitutions.frame_base_url, e.g. http://192.168.1.50:8080

# USB-C to the E1002, then:
just run
# or: esphome run discogs-frame.yaml
```

First flash needs USB. Later OTA works only while the node is awake (prevent deep sleep via HA, press green button, then OTA).

### Validate backend before flashing

```bash
export FRAME_BASE="http://192.168.1.50:8080"
# expect ~5–6s
curl -fsS -o /tmp/frame.png "$FRAME_BASE/ext-api/discogs/frame.png"
file /tmp/frame.png   # expect PNG image data, 800 x 480
```

## Config knobs (`substitutions`)

- `frame_base_url` — backend origin, **no trailing slash**
- `sleep_duration` — default `6h`
- `run_duration` — max awake window (default `120s`; must cover render + panel refresh)
- `panel_refresh_wait` — delay after `component.update` before sleep (default `50s`)
- `device_name` / `friendly_name` — mDNS / HA

## Display / color notes

- Panel is **6 inks** (black, white, red, yellow, blue, green), not full RGB. Quantize/dither on the server toward that palette.
- ESPHome may swap red/blue on some `online_image` paths ([esphome#15803](https://github.com/esphome/esphome/issues/15803)). If reds look blue, fix with a server-side channel swap.
- Pins use stock `Seeed-reTerminal-E1002` (`cs=10 dc=11 reset=12 busy=13`, SPI `clk=7 mosi=9`).

## Sleep / battery

Continuous Wi‑Fi drains the 2000 mAh pack in about a day. Deep sleep + 6h wakes is the intended mode. Every wake asks the server to render (~5–6s) — `http_request.timeout` is 90s for headroom.

**Do not sleep immediately from `on_download_finished`.** Spectra full refresh is slow; sleeping mid-refresh looks like “download worked, screen never changed.” This config:

1. paints on download (`show_and_sleep`)
2. waits `panel_refresh_wait` (default 50s)
3. then `deep_sleep.enter`
4. `run_duration` (default 120s) is a deadman if that path never runs

Pull starts on `wifi.on_connect`, not bare `on_boot`, so join finishes first.

Debug awake: raise `run_duration`, comment out `deep_sleep:`, or HA `deep_sleep.prevent`, press green button, then:

```bash
just logs
```

## Network tips

- Device cannot use `localhost` — use a LAN or VPN address the E1002 can route to.
- `verify_ssl: false` keeps HTTP simple; HTTPS needs a trust store on device.

## Layout

```text
discogs-frame.yaml     ESPHome config
secrets.yaml.example   copy → secrets.yaml
justfile               config / build / run / logs
README.md
```

## Related

- Sibling e-ink client (different panel/API): [`../m5stack-coreink-openrouter`](../m5stack-coreink-openrouter)
