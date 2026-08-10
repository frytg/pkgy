import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { providers } from './providers/index.ts'
import { createProviderDataRouter, createProviderRouter } from './router.ts'

/**
 * Builds the hono app: infra routes at the root, one sub-router per registered provider.
 * Runtime-agnostic — the node and deno entries only differ in how they serve it.
 * CORS is allow-all so the charts can be embedded from any origin (e.g. in a cross-origin
 * `<iframe>`/fetch) and the preflight is honoured for the read-only endpoints.
 * @returns configured hono app
 */
export const createApp = (): Hono => {
	const app = new Hono()

	// Allow requests from any origin; the API only serves read-only GETs, so no credentials.
	app.use(
		'*',
		cors({
			origin: '*',
			allowMethods: ['GET', 'HEAD', 'OPTIONS'],
			maxAge: 86400,
		}),
	)

	app.get('/health', (c) => c.text('ok'))

	for (const [path, provider] of Object.entries(providers)) {
		// SVG chart: `/github/frytg/dark`
		app.route(`/${path}`, createProviderRouter(provider))
		// Raw JSON data API: `/data/github/frytg`
		app.route(`/data/${path}`, createProviderDataRouter(provider))
	}

	return app
}
