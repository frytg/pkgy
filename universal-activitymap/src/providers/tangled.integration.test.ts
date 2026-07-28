import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tangledProvider } from './tangled.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('tangledProvider (integration, hits tangled.org)', () => {
	it('fetches real punchcard data for frytg.digital', async () => {
		const days = await tangledProvider.fetchStats('frytg.digital')

		// the punchcard covers the current year up to today
		assert.ok(days.length > 0, 'expected at least one day')

		const today = new Date().toISOString().slice(0, 10)
		for (const day of days) {
			assert.match(day.date, ISO_DATE)
			assert.ok(day.date <= today, `future date leaked into results: ${day.date}`)
			assert.ok(day.level >= 0 && day.level <= 4, `level out of range: ${day.level}`)
		}

		const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
		assert.deepEqual(days, sorted, 'days are not sorted ascending')

		// the profile has commits this year, so at least some days must be active
		assert.ok(
			days.some((d) => d.level > 0),
			'expected at least one active day',
		)
	})

	it('returns no days for a nonexistent handle (tangled answers 200 with an empty shell)', async () => {
		const days = await tangledProvider.fetchStats('this-handle-does-not-exist-zzz123.invalid')
		assert.deepEqual(days, [])
	})
})
