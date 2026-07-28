import { Hono } from 'hono'
import { providers } from './providers/index.ts'
import { createProviderRouter } from './router.ts'

/**
 * Builds the hono app: infra routes at the root, one sub-router per registered provider.
 * Runtime-agnostic — the node and deno entries only differ in how they serve it.
 * @returns configured hono app
 */
export const createApp = (): Hono => {
	const app = new Hono()

	app.get('/health', (c) => c.text('ok'))

	for (const [path, provider] of Object.entries(providers)) {
		app.route(`/${path}`, createProviderRouter(provider))
	}

	return app
}
