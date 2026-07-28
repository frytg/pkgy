import { Hono } from 'hono'
import type { ActivityProvider } from './providers/types.ts'
import { renderChart } from './svg.ts'
import { DEFAULT_THEME, THEMES } from './themes.ts'

/**
 * Builds the hono sub-router for one activity provider.
 * Mounted at `/<provider.name>` in `src/index.ts`, so the routes here are relative to that prefix.
 * Providers with extra endpoints can extend the returned router before it gets mounted.
 * @param provider - activity provider to expose
 * @returns hono router serving `GET /:username/:theme?`
 */
export const createProviderRouter = (provider: ActivityProvider): Hono => {
	const router = new Hono()

	router.get('/:username/:theme?', async (c) => {
		const username = c.req.param('username')
		const themeName = c.req.param('theme') ?? DEFAULT_THEME

		const theme = THEMES[themeName]
		if (!theme) {
			return c.json({ error: `unknown theme '${themeName}', available: ${Object.keys(THEMES).join(', ')}` }, 400)
		}

		try {
			const days = await provider.fetchStats(username)
			if (days.length === 0) {
				return c.json({ error: `no activity data found for '${username}' on ${provider.name}` }, 404)
			}

			return c.body(renderChart(days, theme), 200, {
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
