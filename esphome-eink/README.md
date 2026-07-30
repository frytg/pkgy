# esphome-eink

ESPHome clients that pull an always-fresh 800×480 frame from dashy and paint e-paper. Layout lives on the server; devices only download + draw.

```bash
cp secrets.yaml.example secrets.yaml   # wifi_ssid / wifi_password
# edit frame_base_url in the matching yaml
just run frame      # TRMNL OG 7.5″ (ESP32-C3) → /ext-api/e-ink/frame.bmp
just run monitor    # reTerminal E1001 B&W → /ext-api/e-ink-monitor/frame.png
just run discogs    # reTerminal E1002 Spectra 6 → /ext-api/discogs/frame.png
```

| recipe    | hardware           | notes                                                       |
| --------- | ------------------ | ----------------------------------------------------------- |
| `frame`   | TRMNL OG 7.5″ (C3) | BMP only (no PSRAM); USB BOOT first flash; timer deep-sleep |
| `monitor` | Seeed E1001        | 1-bit PNG; waveshare `7.50inv2`                             |
| `discogs` | Seeed E1002        | Spectra-6 PNG                                               |

Also: `just build <target>`, `just logs <target>`, `just clean`.
