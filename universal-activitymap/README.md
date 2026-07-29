# universal-activitymap

Hono server that renders activity charts as SVGs — like [githubchart-rust](../githubchart-rust/), but in TypeScript and extensible to multiple activity providers.

## Usage

Toolchain is pinned in [`mise.toml`](./mise.toml) (node + [aube](https://aube.jdx.dev)); `just install` provisions both via mise and installs dependencies into `aube-lock.yaml`.

```sh
just install
just dev
```

Then request a chart:

```
GET /:provider/:username/:theme?
```

- `:provider` — one of `github`, `tangled`, `mastodon`, `bluesky`
- `:username` — provider-specific identifier:
  - `github`: login, e.g. `frytg`
  - `tangled`: handle or DID, e.g. `frytg.digital`
  - `mastodon`: full handle in `user@host` form, e.g. `frytg@beoriginal.social`
  - `bluesky`: handle, e.g. `frytg.digital`
- `:theme` — optional path segment, one of `default` (fallback), `default-auto`, `dark`, `bluesky`, `bluesky-auto`, `mastodon`, `mastodon-auto`. The `-auto` variants flip to a dark palette via a `prefers-color-scheme` media query, so a single URL follows the viewer's system setting.

```sh
curl http://localhost:3000/github/frytg/dark > chart.svg
curl http://localhost:3000/tangled/frytg.digital > chart.svg
curl http://localhost:3000/mastodon/frytg@beoriginal.social > chart.svg
```

### Query params

Presentation is also configurable via query params, which override the path segment and compose freely:

- `theme` — same set as the `:theme` path segment; wins when both are present
- `weeks` — tail-slice the activity window to the last N weeks (integer 1–53); handy for shrinking the year-long `github`/`tangled` charts to a compact widget
- `style` — cell shape preset: `default` (rx=2), `square` (rx=0), `round` (rx=5)

```sh
curl 'http://localhost:3000/github/frytg?theme=bluesky-auto&weeks=14&style=round' > chart.svg
```

Unknown themes/styles or out-of-range `weeks` return `400` with the available options in the JSON body.

## Live examples

Deployed at <https://universal-activitymap.frytg.deno.net>. Each route returns an SVG you can drop straight into an `<img>` or markdown:

### GitHub — `GET /github/:user/:theme?`

[default-auto](https://universal-activitymap.frytg.deno.net/github/frytg/default-auto)

![github default-auto](https://universal-activitymap.frytg.deno.net/github/frytg/default-auto)

### tangled — `GET /tangled/:handle/:theme?`

[default-auto](https://universal-activitymap.frytg.deno.net/tangled/frytg.digital/default-auto)

![tangled default-auto](https://universal-activitymap.frytg.deno.net/tangled/frytg.digital/default-auto)

### Mastodon — `GET /mastodon/:user@:host/:theme?`

[default-auto](https://universal-activitymap.frytg.deno.net/mastodon/frytg@beoriginal.social/default-auto)

![mastodon default-auto](https://universal-activitymap.frytg.deno.net/mastodon/frytg@beoriginal.social/default-auto)

### Bluesky — `GET /bluesky/:handle/:theme?`

[default-auto](https://universal-activitymap.frytg.deno.net/bluesky/frytg.digital/default-auto)

![bluesky default-auto](https://universal-activitymap.frytg.deno.net/bluesky/frytg.digital/default-auto)

Data sources: GitHub's public contributions page, tangled.org's profile punchcard (current year), Mastodon's public statuses API, and Bluesky's public AppView feed (the post-based providers cover the last 14 weeks, ending at the newest post, capped at 200 posts for Mastodon and 300 for Bluesky). Unknown handles yield `404` (tangled answers unknown profiles with an empty 200 shell, so it surfaces as "no data" rather than an upstream error).

Returns `image/svg+xml` with a 1h cache header. Errors come back as JSON: `400` for unknown themes, styles, or out-of-range `weeks`, `404` when no activity data was found, `502` when the upstream provider request failed.

`PORT` env var overrides the default port (`3000` on node, `8000` on deno).

## Runtimes

The app is runtime-agnostic ([`src/app.ts`](./src/app.ts)); only the entry differs:

- node: [`src/index.ts`](./src/index.ts) via `@hono/node-server`, outbound HTTP via `undici`
- deno: [`src/deno.ts`](./src/deno.ts) via `Deno.serve`, outbound HTTP via native fetch

[`src/http.ts`](./src/http.ts) picks the fetch implementation at runtime; [`deno.json`](./deno.json) maps the bare `hono`/`node-html-parser` specifiers for Deno (JSR / npm).

## Deno Deploy

Smoke-test the exact Deploy setup locally:

```sh
just deno        # deno run --allow-net --allow-env=PORT src/deno.ts
just deno-check  # typecheck the deno entry
```

Deploy options:

1. **GitHub integration** — create a project on [dash.deno.com](https://dash.deno.com), point it at this repo with working directory `universal-activitymap` and entrypoint `src/deno.ts`. Every push to the linked branch deploys.
2. **deployctl** — `just deploy` (needs `deployctl` installed and `DENO_DEPLOY_TOKEN` set; adjust `--project` in the justfile).

## Adding a provider

1. Create `src/providers/<name>.ts` implementing the `ActivityProvider` interface from [`src/providers/types.ts`](./src/providers/types.ts) — normalize data into `ActivityDay[]` (`date` as `YYYY-MM-DD`, `level` 0–4).
2. Register it in the `providers` map in [`src/providers/index.ts`](./src/providers/index.ts). A sub-router with `GET /<name>/:username/:theme?` is mounted automatically. Shared helpers (quartile bucketing) live in [`src/providers/levels.ts`](./src/providers/levels.ts).

## Tasks

See the [justfile](./justfile): `just dev`, `just start`, `just lint`, `just test`.

## License

MIT — see [LICENSE](./LICENSE).
