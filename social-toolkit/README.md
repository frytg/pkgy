# FRYTG socials

Dark-mode tools for social image overlays. Geist type, forest-green field, electric yellow interaction.

- site: [www.frytg.digital](https://www.frytg.digital)
- live: [social-toolkit.frytg.deno.net](https://social-toolkit.frytg.deno.net)
- repo: [tangled.org/frytg.digital/pkgy](https://tangled.org/frytg.digital/pkgy) (mirror: [github.com/frytg/pkgy](https://github.com/frytg/pkgy/tree/main/social-toolkit))

## Tools

- **Halftone** — upload an image, tune motif density/shape, export PNG/SVG
- **GPX Overlay** — drop a `.gpx`, toggle GPS track / elevation / heart rate, export transparent PNG or SVG

## Run

Toolchain is pinned in [`mise.toml`](./mise.toml) (node + [aube](https://aube.jdx.dev)); `just install` provisions both via mise and installs npm deps. Lint is `vue-tsc` + [biome](https://biomejs.dev) (root [`biome.json`](../biome.json)).

```bash
just install
just fonts   # once — downloads Geist woff2 into src/style/
just dev
just lint
```

Or `deno task fonts && npm run dev`.

## Deno Deploy

Static SPA. In the [Deno Deploy](https://console.deno.com) app settings:

1. Link the GitHub repo
2. Set **App directory** to `halftone` (monorepo root is dashy)
3. Config is read from [`deno.json`](./deno.json) (`deploy` key) — install `npm ci`, build `deno task build`, serve `dist` with SPA mode

Fonts are gitignored and downloaded during the build task.

The deploy build task runs `vite build` only — no `vue-tsc`. Everything on the Deno Deploy build
image executes under Deno (there is no Node binary; `npm`/`npx` are Deno-backed), and `vue-tsc`
needs Node: it teaches `tsc` about `.vue` by patching `fs.readFileSync` as `tsc.js` loads, which
never takes effect under Deno. The result is not a crash but silence — every `.vue` import fails
with TS2307 and the `.vue` files themselves go unchecked. See
[denoland/deno#30977](https://github.com/denoland/deno/issues/30977).

Type checking therefore has to happen on Node, before pushing: `just lint` (or `just build`, whose
`npm run build` script still runs `vue-tsc -b && vite build`).
