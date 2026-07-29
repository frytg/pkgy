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
const year = Array.from({ length: 365 }, (_, i) => ({
	date: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
	level: (i % 5) as 0 | 1 | 2 | 3 | 4,
}))

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

	it('lets the query theme override the path segment', async () => {
		const res = await stubApp(async () => oneDay).request('/stub/alice/dark?theme=default')
		assert.equal(res.status, 200)
		const svg = await res.text()
		assert.ok(svg.includes('#39C651')) // default level-2 cell
		assert.ok(!svg.includes('#0D5926')) // dark level-2 cell, must not be present
	})

	it('accepts theme via query with no path segment', async () => {
		const res = await stubApp(async () => oneDay).request('/stub/alice?theme=dark')
		assert.equal(res.status, 200)
	})

	it('rejects unknown style with 400', async () => {
		const res = await stubApp(async () => oneDay).request('/stub/alice?style=diamond')
		assert.equal(res.status, 400)
	})

	it('applies style=round to the rects', async () => {
		const res = await stubApp(async () => oneDay).request('/stub/alice?style=round')
		assert.equal(res.status, 200)
		assert.ok((await res.text()).includes('rx="5" ry="5"'))
	})

	it('slices the activity window to the last N weeks', async () => {
		const res = await stubApp(async () => year).request('/stub/alice?weeks=4')
		assert.equal(res.status, 200)
		// 4 weeks = 28 days -> 4 columns
		assert.equal((await res.text()).match(/<rect /g)?.length, 28)
	})

	it('rejects weeks out of range with 400', async () => {
		const res = await stubApp(async () => year).request('/stub/alice?weeks=0')
		assert.equal(res.status, 400)
	})

	it('rejects non-integer weeks with 400', async () => {
		const res = await stubApp(async () => year).request('/stub/alice?weeks=abc')
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
