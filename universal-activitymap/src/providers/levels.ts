import type { ActivityDay } from './types.ts'

/** Raw per-day activity count before intensity bucketing. */
export interface DayCount {
	date: string
	count: number
}

/**
 * Buckets raw daily counts into intensity levels 0–4 using quartiles of the max count,
 * mirroring how GitHub derives its contribution levels.
 * @param days - raw per-day counts
 * @returns normalized activity days
 */
export const toActivityDays = (days: DayCount[]): ActivityDay[] => {
	const max = Math.max(0, ...days.map((d) => d.count))
	const bucket = Math.max(1, Math.ceil(max / 4))

	return days.map(({ date, count }) => ({
		date,
		level: count === 0 ? 0 : Math.min(4, Math.ceil(count / bucket)),
	}))
}
