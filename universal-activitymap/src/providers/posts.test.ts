import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { postsToActivityDays } from './posts.ts'

const post = (id: string, date: string) => ({ id, created_at: `${date}T12:00:00.000Z` })

describe('postsToActivityDays', () => {
	it('builds a full window ending at the newest post', () => {
		const days = postsToActivityDays([post('1', '2026-07-20')], 14)

		assert.equal(days.length, 14)
		assert.equal(days[0]?.date, '2026-07-07')
		assert.equal(days[13]?.date, '2026-07-20')
		assert.equal(days[13]?.level, 1) // max is 1, so bucket size is 1
		assert.ok(days.slice(0, 13).every((d) => d.level === 0))
	})

	it('aggregates multiple posts per day', () => {
		const days = postsToActivityDays([post('1', '2026-07-20'), post('2', '2026-07-20'), post('3', '2026-07-19')], 7)
		assert.equal(days[6]?.level, 2) // 2 posts, bucket size ceil(2/4) = 1
		assert.equal(days[5]?.level, 1) // 1 post
	})

	it('returns an empty array without posts', () => {
		assert.deepEqual(postsToActivityDays([]), [])
	})

	it('handles posts in any order', () => {
		const days = postsToActivityDays([post('2', '2026-07-10'), post('1', '2026-07-20')], 14)
		assert.equal(days[13]?.date, '2026-07-20')
		assert.ok(days.some((d) => d.date === '2026-07-10' && d.level > 0))
	})
})
