/**
 * A single day of activity, normalized across providers.
 */
export interface ActivityDay {
	/** ISO date in `YYYY-MM-DD` format. */
	date: string
	/** Intensity bucket from 0 (none) to 4 (max), mapped onto the theme colors. */
	level: number
}

/**
 * A source of activity data (github, gitlab, strava, ...).
 * Providers are registered in `src/providers/index.ts` and get a router mounted at `/<name>`.
 */
export interface ActivityProvider {
	/** URL path segment and registry key, e.g. `github`. */
	name: string
	/**
	 * Fetches and normalizes activity stats for a user.
	 * @param username - provider-specific user identifier
	 * @returns days sorted ascending by date
	 */
	fetchStats: (username: string) => Promise<ActivityDay[]>
}
