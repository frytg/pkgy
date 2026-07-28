import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mastodonProvider } from './mastodon.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HANDLE_ERROR = /user@host/

describe('mastodonProvider (integration, hits beoriginal.social)', () => {
	it('fetches real posting activity for frytg@beoriginal.social', async () => {
		const days = await mastodonProvider.fetchStats('frytg@beoriginal.social')

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

	it('throws for a malformed handle without host', async () => {
		await assert.rejects(() => mastodonProvider.fetchStats('frytg'), HANDLE_ERROR)
	})

	it('throws for a nonexistent account', async () => {
		await assert.rejects(() => mastodonProvider.fetchStats('this-user-does-not-exist-zzz123@beoriginal.social'))
	})
})
