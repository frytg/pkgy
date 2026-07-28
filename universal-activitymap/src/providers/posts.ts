import { type DayCount, toActivityDays } from './levels.ts'
import type { ActivityDay } from './types.ts'

/** A dated item from a post-based feed, normalized for windowing. */
export interface Post {
	id: string
	created_at: string
}

const WINDOW_DAYS = 98 // 14 weeks
const DAY_MS = 86_400_000

/**
 * Buckets posts into a fixed window of days ending at the newest post date.
 * Ending at the newest post (instead of today) keeps the chart meaningful for
 * infrequent posters and guarantees at least one active day.
 * @param posts - posts in any order
 * @param windowDays - number of days in the window, defaults to 14 weeks
 * @returns normalized activity days sorted ascending
 */
export const postsToActivityDays = (posts: Post[], windowDays = WINDOW_DAYS): ActivityDay[] => {
	if (posts.length === 0) return []

	const counts = new Map<string, number>()
	let newest = ''
	for (const post of posts) {
		const date = post.created_at.slice(0, 10)
		counts.set(date, (counts.get(date) ?? 0) + 1)
		if (date > newest) newest = date
	}

	const end = new Date(`${newest}T00:00:00Z`).getTime()
	const days: DayCount[] = []
	for (let i = windowDays - 1; i >= 0; i--) {
		const date = new Date(end - i * DAY_MS).toISOString().slice(0, 10)
		days.push({ date, count: counts.get(date) ?? 0 })
	}

	return toActivityDays(days)
}
