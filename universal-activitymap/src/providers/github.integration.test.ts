import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { githubProvider } from './github.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const NOT_FOUND = /404/

describe('githubProvider (integration, hits github.com)', () => {
	it('fetches real contribution data for frytg', async () => {
		const days = await githubProvider.fetchStats('frytg')

		// the contributions endpoint returns roughly a year of daily cells
		assert.ok(days.length > 300, `expected >300 days, got ${days.length}`)

		for (const day of days) {
			assert.match(day.date, ISO_DATE)
			assert.ok(day.level >= 0 && day.level <= 4, `level out of range: ${day.level}`)
		}

		const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
		assert.deepEqual(days, sorted, 'days are not sorted ascending')

		// frytg is an active account, so at least some days must have contributions
		assert.ok(
			days.some((d) => d.level > 0),
			'expected at least one active day',
		)
	})

	it('throws for a nonexistent user', async () => {
		await assert.rejects(() => githubProvider.fetchStats('this-user-does-not-exist-zzz123'), NOT_FOUND)
	})
})
