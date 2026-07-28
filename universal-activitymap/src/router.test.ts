import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'
import type { ActivityProvider } from './providers/types.ts'
import { createProviderRouter } from './router.ts'

/**
 * Mounts a stub provider on a test app, mirroring how `createApp` mounts real providers.
 * @param fetchStats - stubbed stats fetcher
 * @returns hono app with the stub provider at `/stub`
 */
const stubApp = (fetchStats: ActivityProvider['fetchStats']): Hono => {
	const app = new Hono()
	app.route('/stub', createProviderRouter({ name: 'stub', fetchStats }))
	return app
}

const oneDay = [{ date: '2025-01-06', level: 2 }]

const SVG_CONTENT_TYPE = /image\/svg\+xml/
const SVG_DOCUMENT = /^<svg.*<\/svg>$/

describe('createProviderRouter', () => {
	it('serves an svg for a known theme', async () => {
		const res = await stubApp(async () => oneDay).request('/stub/alice/dark')
		assert.equal(res.status, 200)
		assert.match(res.headers.get('content-type') ?? '', SVG_CONTENT_TYPE)
		assert.match(await res.text(), SVG_DOCUMENT)
	})

	it('falls back to the default theme when omitted', async () => {
		const res = await stubApp(async () => oneDay).request('/stub/alice')
		assert.equal(res.status, 200)
	})

	it('rejects unknown themes with 400', async () => {
		const res = await stubApp(async () => oneDay).request('/stub/alice/nope')
		assert.equal(res.status, 400)
	})

	it('returns 404 when the provider has no data', async () => {
		const res = await stubApp(async () => []).request('/stub/alice')
		assert.equal(res.status, 404)
	})

	it('returns 502 when the provider fetch fails', async () => {
		const res = await stubApp(async () => {
			throw new Error('upstream down')
		}).request('/stub/alice')
		assert.equal(res.status, 502)
		assert.deepEqual(await res.json(), { error: 'upstream down' })
	})
})
