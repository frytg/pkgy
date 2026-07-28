import { httpFetch } from '../http.ts'
import { postsToActivityDays } from './posts.ts'
import type { ActivityDay, ActivityProvider } from './types.ts'

const USER_AGENT = 'universal-activitymap'
const MAX_POSTS = 300
const PAGE_SIZE = 100
const FEED_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed'

interface FeedItem {
	reason?: unknown
	post: {
		uri: string
		record: {
			createdAt: string
		}
	}
}

interface FeedPage {
	feed: FeedItem[]
	cursor?: string
}

/**
 * Fetches a bluesky author's own posts via the public AppView, newest first.
 * Reposts (feed items with a `reason`) are dropped so only original posting counts.
 * @param handle - bluesky handle, e.g. `frytg.digital`
 * @returns posts newest first, capped at {@link MAX_POSTS}
 * @throws when a page request fails
 */
const fetchPosts = async (handle: string) => {
	const posts: { id: string; created_at: string }[] = []
	let cursor: string | undefined

	while (posts.length < MAX_POSTS) {
		const url = new URL(FEED_URL)
		url.searchParams.set('actor', handle)
		url.searchParams.set('limit', String(PAGE_SIZE))
		if (cursor) url.searchParams.set('cursor', cursor)

		const response = await httpFetch(url, { headers: { 'user-agent': USER_AGENT } })
		if (!response.ok) {
			throw new Error(`failed loading bluesky feed: ${url} -> ${response.status}`)
		}

		const page = (await response.json()) as FeedPage
		for (const item of page.feed) {
			if (item.reason) continue // skip reposts
			posts.push({ id: item.post.uri, created_at: item.post.record.createdAt })
		}

		cursor = page.cursor
		if (!cursor || page.feed.length < PAGE_SIZE) break
	}

	return posts.slice(0, MAX_POSTS)
}

/**
 * Fetches posting activity for a bluesky handle via the public AppView API.
 * @param handle - bluesky handle, e.g. `frytg.digital`
 * @returns days sorted ascending by date
 */
const fetchBlueskyStats = async (handle: string): Promise<ActivityDay[]> => {
	const posts = await fetchPosts(handle)
	return postsToActivityDays(posts)
}

export const blueskyProvider: ActivityProvider = {
	name: 'bluesky',
	fetchStats: fetchBlueskyStats,
}
