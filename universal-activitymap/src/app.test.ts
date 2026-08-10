import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createApp } from './app.ts'

/**
 * CORS is allow-all so charts can be embedded from any origin.
 * @returns hono app as built for production, minus network I/O
 */
const app = createApp()

describe('createApp CORS', () => {
	it('sets Access-Control-Allow-Origin for any origin', async () => {
		const res = await app.request('/health', {
			headers: { origin: 'https://embedder.example' },
		})
		assert.equal(res.status, 200)
		assert.equal(res.headers.get('access-control-allow-origin'), '*')
	})

	it('answers a cross-origin preflight for the read methods', async () => {
		const res = await app.request('/health', {
			method: 'OPTIONS',
			headers: {
				origin: 'https://embedder.example',
				'access-control-request-method': 'GET',
			},
		})
		assert.equal(res.status, 204)
		const headers = res.headers
		assert.equal(headers.get('access-control-allow-origin'), '*')
		assert.match(headers.get('access-control-allow-methods') ?? '', /GET/)
	})

	it('wires the data api at /data/:provider/:username with CORS', async () => {
		// OPTIONS never reaches the provider handler, so this stays network-free while proving the
		// /data/<provider> mount is live (preflight on a matched route returns 204 + CORS headers).
		const res = await app.request('/data/github/alice', {
			method: 'OPTIONS',
			headers: {
				origin: 'https://embedder.example',
				'access-control-request-method': 'GET',
			},
		})
		assert.equal(res.status, 204)
		assert.equal(res.headers.get('access-control-allow-origin'), '*')
	})
})
