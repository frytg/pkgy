import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toActivityDays } from './levels.ts'

describe('toActivityDays', () => {
	it('maps zero commits to level 0', () => {
		const days = toActivityDays([
			{ date: '2026-01-01', count: 0 },
			{ date: '2026-01-02', count: 4 },
		])
		assert.equal(days[0]?.level, 0)
	})

	it('buckets counts into quartiles of the max', () => {
		// max 8 -> bucket size 2 -> levels at 2, 4, 6, 8
		const days = toActivityDays([
			{ date: '2026-01-01', count: 1 },
			{ date: '2026-01-02', count: 2 },
			{ date: '2026-01-03', count: 4 },
			{ date: '2026-01-04', count: 6 },
			{ date: '2026-01-05', count: 8 },
		])
		assert.deepEqual(
			days.map((d) => d.level),
			[1, 1, 2, 3, 4],
		)
	})

	it('clamps outliers to level 4', () => {
		const days = toActivityDays([
			{ date: '2026-01-01', count: 1 },
			{ date: '2026-01-02', count: 83 },
		])
		assert.equal(days[1]?.level, 4)
	})

	it('handles an empty input', () => {
		assert.deepEqual(toActivityDays([]), [])
	})
})
