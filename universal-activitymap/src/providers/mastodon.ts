import { httpFetch } from '../http.ts'
import { postsToActivityDays } from './posts.ts'
import type { ActivityDay, ActivityProvider } from './types.ts'

const USER_AGENT = 'universal-activitymap'
const MAX_POSTS = 300
const PAGE_SIZE = 40

const HOST_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i

interface MastodonStatus {
	id: string
	created_at: string
}

interface MastodonAccount {
	id: string
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
	const response = await httpFetch(url, { headers: { 'user-agent': USER_AGENT } })
	if (!response.ok) {
		throw new Error(`failed looking up mastodon account: ${url} -> ${response.status}`)
	}
	const account = (await response.json()) as MastodonAccount
	return account.id
}

/**
 * Fetches the newest statuses of an account, up to {@link MAX_POSTS}, paginating 40 at a time.
 * @param host - mastodon instance host
 * @param accountId - numeric account id
 * @returns statuses newest first
 * @throws when a page request fails
 */
const fetchStatuses = async (host: string, accountId: string): Promise<MastodonStatus[]> => {
	const statuses: MastodonStatus[] = []
	let maxId: string | undefined

	while (statuses.length < MAX_POSTS) {
		const url = new URL(`https://${host}/api/v1/accounts/${accountId}/statuses`)
		url.searchParams.set('limit', String(PAGE_SIZE))
		if (maxId) url.searchParams.set('max_id', maxId)

		const response = await httpFetch(url, { headers: { 'user-agent': USER_AGENT } })
		if (!response.ok) {
			throw new Error(`failed loading mastodon statuses: ${url} -> ${response.status}`)
		}

		const page = (await response.json()) as MastodonStatus[]
		if (page.length === 0) break
		statuses.push(...page)
		const last = page[page.length - 1]
		if (!last || page.length < PAGE_SIZE) break
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
