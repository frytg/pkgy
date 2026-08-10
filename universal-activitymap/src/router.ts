import { Hono } from 'hono'
import type { ActivityProvider } from './providers/types.ts'
import { isStyle, type RenderOptions, renderChart, type Style } from './svg.ts'
import { DEFAULT_THEME, THEMES } from './themes.ts'

/** Upper bound for `?weeks=` — a full year of ISO weeks. */
const MAX_WEEKS = 53
const WEEKS_PER_DAY = 7

/**
 * Builds the hono sub-router for one activity provider.
 * Mounted at `/<provider.name>` in `src/index.ts`, so the routes here are relative to that prefix.
 * Providers with extra endpoints can extend the returned router before it gets mounted.
 * Presentation is configurable via query params: `theme` (aliases the path segment, query wins),
 * `weeks` (tail-slice the activity window, 1–53), and `style` (cell shape preset).
 * @param provider - activity provider to expose
 * @returns hono router serving `GET /:username/:theme?`
 */
export const createProviderRouter = (provider: ActivityProvider): Hono => {
	const router = new Hono()

	router.get('/:username/:theme?', async (c) => {
		const username = c.req.param('username')
		// query `theme` overrides the path segment; both fall back to the default
		const themeName = c.req.query('theme') ?? c.req.param('theme') ?? DEFAULT_THEME
		const theme = THEMES[themeName]
		if (!theme) {
			return c.json({ error: `unknown theme '${themeName}', available: ${Object.keys(THEMES).join(', ')}` }, 400)
		}

		const styleQuery = c.req.query('style') ?? 'default'
		if (!isStyle(styleQuery)) {
			return c.json({ error: `unknown style '${styleQuery}', available: default, square, round` }, 400)
		}
		const style: Style = styleQuery

		const weeksQuery = c.req.query('weeks')
		let weeks: number | undefined
		if (weeksQuery !== undefined) {
			const parsed = Number.parseInt(weeksQuery, 10)
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_WEEKS) {
				return c.json(
					{ error: `weeks must be an integer between 1 and ${MAX_WEEKS}, got '${weeksQuery}'` },
					400,
				)
			}
			weeks = parsed
		}

		try {
			let days = await provider.fetchStats(username)
			if (days.length === 0) {
				return c.json({ error: `no activity data found for '${username}' on ${provider.name}` }, 404)
			}
			if (weeks) days = days.slice(-weeks * WEEKS_PER_DAY)

			const options: RenderOptions = { style }
			return c.body(renderChart(days, theme, options), 200, {
				'content-type': 'image/svg+xml; charset=utf-8',
				'cache-control': 'public, max-age=3600',
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return c.json({ error: message }, 502)
		}
	})

	return router
}

/**
 * Builds the JSON data sub-router for one activity provider, mounted at `/data/<name>` in `src/app.ts`.
 * Exposes the raw normalized activity data — the exact `ActivityDay[]` used to render the SVG charts —
 * so other sites can fetch and render the data themselves. No theme/weeks present here; that's
 * presentation, this is the underlying dataset.
 * @param provider - activity provider to expose
 * @returns hono router serving `GET /:username` as JSON
 */
export const createProviderDataRouter = (provider: ActivityProvider): Hono => {
	const router = new Hono()

	router.get('/:username', async (c) => {
		const username = c.req.param('username')
		try {
			const days = await provider.fetchStats(username)
			if (days.length === 0) {
				return c.json({ error: `no activity data found for '${username}' on ${provider.name}` }, 404)
			}
			return c.json(days, 200, { 'cache-control': 'public, max-age=3600' })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return c.json({ error: message }, 502)
		}
	})

	return router
}
