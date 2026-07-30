# trmnl-og-frame

ESPHome **live PNG client** for the **official TRMNL OG 7.5″** (usetrmnl.com hardware, ESP32-C3).

Stock TRMNL firmware Alias plug-in times out before a server-side gowitness render finishes. This firmware keeps the HTTP client awake long enough (~90s) so the backend can always render on GET — no cron warm-up.

**ESP32-C3 has no PSRAM.** A full-frame BINARY buffer is 48KB. This config stays lean (no `web_server` / `captive_portal`) and pulls **BMP**, not PNG.

## Hardware

| Piece | Spec |
| ----- | ---- |
| Device | TRMNL OG 7.5″ (official) |
| MCU | ESP32-C3 |
| Panel | 800×480 mono e-paper (`waveshare_epaper` `7.50inv2`) |
| Board ref | [jesserockz/esphome-trmnl](https://github.com/jesserockz/esphome-trmnl) pinout |

**Not** the Seeed TRMNL 7.5″ DIY Kit (XIAO S3 Plus, different pins).  
**Not** reTerminal E1001 (`pkgy/reterminal-e1001-monitor`).

### Pinout (official OG)

| Function | GPIO |
| -------- | ---- |
| SPI CLK | 7 |
| SPI MOSI | 8 |
| CS | 6 |
| DC | 5 |
| RST | 10 |
| BUSY (inverted) | 4 |
| Front button | 9 (awake only — cannot deep-sleep wake) |
| Battery ADC | 3 (×2 filter) |

## Backend

Point `frame_base_url` + `frame_path` at a PNG that takes a few seconds to produce:

| Path | Content |
| ---- | ------- |
| `/ext-api/e-ink/frame.bmp` | rooms `/e-ink` as **1-bit BMP** (default — C3-safe) |
| `/ext-api/e-ink/frame.png` | same layout as 4-bit PNG (S3 boards with more RAM) |

Prefer plain HTTP on LAN/VPN. Device cannot use `localhost`.

## Flow

```text
sleep 20min → wake → Wi‑Fi
                 → GET frame_path  (timeout 90s)
                 → paint 7.5″ panel
                 → wait panel_refresh_wait
                 → deep sleep
```

Timer wake is the only deep-sleep exit (ESP32-C3 only allows EXT wake on GPIO **0–5**; OG button is **GPIO9**). Pressing the button while the node is still in `run_duration` re-pulls the frame.

## Setup

```bash
brew install esphome   # or pipx

cp secrets.yaml.example secrets.yaml
# wifi_ssid / wifi_password

$EDITOR frame.yaml
# substitutions.frame_base_url  e.g. http://10.0.17.17:8080

# Flash mode (official OG, first install):
#   power OFF → USB-C to PC → hold BOOT → power ON → release BOOT
just run
```

**First flash must be USB** (BOOT method). Later updates use **ESPHome OTA** only while thenode is still in `run_duration` (no web_server on C3 — heap).

Raise `run_duration` or comment out `deep_sleep:` for a longer OTA window.

Browser flash of blank ESPHome base (optional):  
https://jesserockz.github.io/esphome-trmnl/

### Validate backend

```bash
export FRAME_BASE="http://192.168.1.50:8080"
time curl -fsS -o /tmp/frame.bmp "$FRAME_BASE/ext-api/e-ink/frame.bmp"
file /tmp/frame.bmp   # PC bitmap data, 800 x 480
```

## Knobs (`substitutions`)

- `frame_base_url` — no trailing slash  
- `frame_path` — default `/ext-api/e-ink/frame.bmp`  
- `sleep_duration` — default `20min`  
- `run_duration` — deadman awake window (`120s`)  
- `panel_refresh_wait` — default `25s` after `component.update`  

## Polarity

If the panel paints white tool on black ground, swap the image color args in the display lambda:

```yaml
it.image(0, 0, id(remote_frame), COLOR_ON, COLOR_OFF);
```

## Sleep / flash notes

- Deep sleep → OTA/USB only while awake (catch the `run_duration` window, or USB flash mode).  
- Button does **not** wake from deep sleep on C3/OG.  
- If stuck in sleep during USB flash: BOOT-hold method above.  
- Continuous Wi‑Fi will murder battery; timed sleep is the intended mode.

## Layout

```text
frame.yaml             ESPHome config (OG C3 pinout)
secrets.yaml.example
justfile
README.md
```

## Related

- Seeed reTerminal E1001 client: [`../reterminal-e1001-monitor`](../reterminal-e1001-monitor)  
- ESPHome OG pin reference: [jesserockz/esphome-trmnl](https://github.com/jesserockz/esphome-trmnl)  
- Stock FW recovery: [usetrmnl/trmnl-firmware](https://github.com/usetrmnl/trmnl-firmware) (BOOT + power on)  
