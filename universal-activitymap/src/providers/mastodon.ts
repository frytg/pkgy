import { httpFetch } from '../http.ts'
import { postsToActivityDays } from './posts.ts'
import type { ActivityDay, ActivityProvider } from './types.ts'

const USER_AGENT = 'universal-activitymap'
const MAX_POSTS = 200
const PAGE_SIZE = 40
const WINDOW_DAYS = 98 // mirrors posts.ts; the chart only renders this span
const DAY_MS = 86_400_000
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 10_000

const HOST_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i

interface MastodonStatus {
	id: string
	created_at: string
}

interface MastodonAccount {
	id: string
}

/**
 * Computes a retry delay (ms) from a 429 response, or `null` to give up.
 * Prefers `Retry-After` (seconds), then the time until `x-ratelimit-reset` (ISO timestamp),
 * then exponential backoff. If a header advertises a wait longer than the cap, returns `null`
 * so the caller fails fast instead of blocking on a window it can't out-wait.
 * @param headers - response headers from the 429
 * @param attempt - zero-based retry index, used for exponential backoff
 * @returns delay in milliseconds, or `null` to stop retrying
 */
const retryDelay = (headers: Headers, attempt: number): number | null => {
	const retryAfter = Number(headers.get('retry-after'))
	if (Number.isFinite(retryAfter) && retryAfter > 0) {
		const ms = retryAfter * 1000
		return ms <= MAX_BACKOFF_MS ? ms : null
	}
	const reset = headers.get('x-ratelimit-reset')
	if (reset) {
		const msUntilReset = new Date(reset).getTime() - Date.now()
		if (Number.isFinite(msUntilReset) && msUntilReset > 0) {
			return msUntilReset <= MAX_BACKOFF_MS ? msUntilReset : null
		}
	}
	return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
}

/**
 * Fetches a URL, retrying on 429 with backoff driven by the upstream rate-limit headers.
 * Stops retrying (and returns the 429) when the headers advertise a wait longer than the cap.
 * Other non-2xx statuses are returned for the caller to handle.
 * @param url - URL to fetch
 * @returns the fetch response (may be non-ok after exhausting retries)
 */
const fetchWithRetry = async (url: URL | string): Promise<Response> => {
	for (let attempt = 0; ; attempt++) {
		const response = await httpFetch(url, { headers: { 'user-agent': USER_AGENT } })
		if (response.status !== 429 || attempt >= MAX_RETRIES) return response
		const delay = retryDelay(response.headers, attempt)
		if (delay === null) return response
		await new Promise((resolve) => setTimeout(resolve, delay))
	}
}

/**
 * Splits a `user@host` mastodon handle and validates the host part.
 * @param handle - full mastodon handle, e.g. `frytg@beoriginal.social`
 * @returns user and host parts
 * @throws when the handle is malformed
 */
const parseHandle = (handle: string): { user: string; host: string } => {
	const at = handle.indexOf('@')
	const user = handle.slice(0, at)
	const host = handle.slice(at + 1)
	if (at < 1 || !host || !HOST_PATTERN.test(host)) {
		throw new Error(`mastodon handle must be in user@host form, got '${handle}'`)
	}
	return { user, host }
}

/**
 * Resolves a local account name to its numeric id via the public lookup endpoint.
 * @param host - mastodon instance host
 * @param user - account name on that instance
 * @returns account id
 * @throws when the lookup fails
 */
const lookupAccountId = async (host: string, user: string): Promise<string> => {
	const url = `https://${host}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`
	const response = await fetchWithRetry(url)
	if (!response.ok) {
		throw new Error(`failed looking up mastodon account: ${url} -> ${response.status}`)
	}
	const account = (await response.json()) as MastodonAccount
	return account.id
}

/**
 * Fetches the newest statuses of an account, up to {@link MAX_POSTS}, paginating 40 at a time.
 * Stops early once a page falls entirely before the 14-week window so active accounts don't
 * page through hundreds of posts (and trip rate limits); the rendered chart is unchanged because
 * {@link postsToActivityDays} only buckets posts inside the window anyway.
 * @param host - mastodon instance host
 * @param accountId - numeric account id
 * @returns statuses newest first
 * @throws when a page request fails
 */
const fetchStatuses = async (host: string, accountId: string): Promise<MastodonStatus[]> => {
	const statuses: MastodonStatus[] = []
	let maxId: string | undefined
	let cutoff: number | undefined

	while (statuses.length < MAX_POSTS) {
		const url = new URL(`https://${host}/api/v1/accounts/${accountId}/statuses`)
		url.searchParams.set('limit', String(PAGE_SIZE))
		if (maxId) url.searchParams.set('max_id', maxId)

		const response = await fetchWithRetry(url)
		if (!response.ok) {
			throw new Error(`failed loading mastodon statuses: ${url} -> ${response.status}`)
		}

		const page = (await response.json()) as MastodonStatus[]
		if (page.length === 0) break
		statuses.push(...page)

		// anchor the 14-week window at the newest post, then stop paging once a page crosses it
		const first = page[0]
		const last = page[page.length - 1]
		if (!first || !last) break
		if (cutoff === undefined) cutoff = new Date(first.created_at).getTime() - WINDOW_DAYS * DAY_MS
		if (new Date(last.created_at).getTime() <= cutoff) break
		if (page.length < PAGE_SIZE) break
		maxId = last.id
	}

	return statuses.slice(0, MAX_POSTS)
}

/**
 * Fetches posting activity for a mastodon account via the instance's public API.
 * @param handle - full mastodon handle in `user@host` form
 * @returns days sorted ascending by date
 */
const fetchMastodonStats = async (handle: string): Promise<ActivityDay[]> => {
	const { user, host } = parseHandle(handle)
	const accountId = await lookupAccountId(host, user)
	const statuses = await fetchStatuses(host, accountId)
	return postsToActivityDays(statuses)
}

export const mastodonProvider: ActivityProvider = {
	name: 'mastodon',
	fetchStats: fetchMastodonStats,
}
