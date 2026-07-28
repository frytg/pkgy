import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blueskyProvider } from './bluesky.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('blueskyProvider (integration, hits public.api.bsky.app)', () => {
	it('fetches real posting activity for frytg.digital', async () => {
		const days = await blueskyProvider.fetchStats('frytg.digital')

		// fixed 14-week window ending at the newest post
		assert.equal(days.length, 98)

		for (const day of days) {
			assert.match(day.date, ISO_DATE)
			assert.ok(day.level >= 0 && day.level <= 4, `level out of range: ${day.level}`)
		}

		const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
		assert.deepEqual(days, sorted, 'days are not sorted ascending')

		// window ends at the newest post, so at least that day is active
		assert.ok((days[days.length - 1]?.level ?? 0) > 0, 'expected the last day to be active')
	})

	it('throws for a nonexistent handle', async () => {
		await assert.rejects(() => blueskyProvider.fetchStats('this-handle-does-not-exist-zzz123.bsky.social'))
	})
})
