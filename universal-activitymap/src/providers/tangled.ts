import { parse } from 'node-html-parser'
import { httpFetch } from '../http.ts'
import { type DayCount, toActivityDays } from './levels.ts'
import type { ActivityDay, ActivityProvider } from './types.ts'

const USER_AGENT = 'universal-activitymap'
const BASE_URL = 'https://tangled.org'

/** Matches the punchcard cell tooltips tangled renders, e.g. `2026-07-13: 83 commits`. */
const TITLE_PATTERN = /^(\d{4}-\d{2}-\d{2}): (\d+) commits?$/

/**
 * Fetches the punchcard from a tangled.org profile page and extracts daily commit counts.
 * The profile page server-renders one cell per day of the current year with a
 * `title="YYYY-MM-DD: N commits"` tooltip; cells in the future are dropped.
 * @param handle - tangled handle (e.g. `frytg.digital`) or DID
 * @returns days sorted ascending by date
 * @throws when tangled.org responds with a non-2xx status
 */
const fetchTangledStats = async (handle: string): Promise<ActivityDay[]> => {
	const url = `${BASE_URL}/${encodeURIComponent(handle)}/`
	const response = await httpFetch(url, { headers: { 'user-agent': USER_AGENT } })
	if (!response.ok) {
		throw new Error(`failed loading data from tangled: ${url} -> ${response.status}`)
	}

	const document = parse(await response.text())
	const today = new Date().toISOString().slice(0, 10)
	const days: DayCount[] = []

	for (const cell of document.querySelectorAll('[data-punchcard] [title]')) {
		const match = TITLE_PATTERN.exec(cell.getAttribute('title') ?? '')
		if (!match?.[1] || !match[2]) continue
		if (match[1] > today) continue
		days.push({ date: match[1], count: Number(match[2]) })
	}

	days.sort((a, b) => a.date.localeCompare(b.date))
	return toActivityDays(days)
}

export const tangledProvider: ActivityProvider = {
	name: 'tangled',
	fetchStats: fetchTangledStats,
}
