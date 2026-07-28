import { parse } from 'node-html-parser'
import { httpFetch } from '../http.ts'
import type { ActivityDay, ActivityProvider } from './types.ts'

const USER_AGENT = 'universal-activitymap'

/**
 * Fetches the public contribution graph HTML for a GitHub user and extracts daily intensity levels.
 * @param username - GitHub login
 * @returns days sorted ascending by date
 * @throws when GitHub responds with a non-2xx status
 */
const fetchGithubStats = async (username: string): Promise<ActivityDay[]> => {
	const url = `https://github.com/users/${encodeURIComponent(username)}/contributions`
	const response = await httpFetch(url, { headers: { 'user-agent': USER_AGENT } })
	if (!response.ok) {
		throw new Error(`failed loading data from GitHub: ${url} -> ${response.status}`)
	}

	const document = parse(await response.text())
	const days: ActivityDay[] = []

	for (const cell of document.querySelectorAll('td.ContributionCalendar-day')) {
		const date = cell.getAttribute('data-date')
		const level = Number(cell.getAttribute('data-level'))
		if (date && Number.isInteger(level)) {
			days.push({ date, level })
		}
	}

	days.sort((a, b) => a.date.localeCompare(b.date))
	return days
}

export const githubProvider: ActivityProvider = {
	name: 'github',
	fetchStats: fetchGithubStats,
}
