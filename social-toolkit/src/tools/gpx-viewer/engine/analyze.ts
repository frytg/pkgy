/** Derives rich activity stats from a parsed GPX track. */

import { cumulativeDistances, type GpxTrack } from '../../gpx-overlay/engine/parse-gpx.ts'
import { projectToWorld, worldBounds, type WorldBounds } from './geometry.ts'

/** Speed below which an interval counts as stopped (m/s ≈ 1.1 km/h). */
const MOVING_THRESHOLD_MS = 0.3
/** Time gap beyond which an interval is treated as a pause (ms). */
const PAUSE_GAP_MS = 60_000
/** Accumulated elevation change banked as gain/loss once exceeded (m). */
const ELE_THRESHOLD_M = 2
/** Assumed rider/hiker weight for the calorie estimate (kg). */
const ASSUMED_WEIGHT_KG = 70
/** Assumed age for the calorie estimate (years). */
const ASSUMED_AGE = 35

/** One enriched track sample. */
export type Sample = {
	lat: number
	lon: number
	ele: number | null
	hr: number | null
	timeMs: number | null
	/** Cumulative distance from start (m). */
	distanceM: number
	/** Smoothed instantaneous speed (m/s), null without time. */
	speedMs: number | null
	/** Smoothed elevation (m). */
	eleSmooth: number | null
	/** Gradient percent over the preceding segment. */
	gradePct: number | null
	/** World-space x (m). */
	x: number
	/** World-space y (m). */
	y: number
}

/** One heart-rate zone with time-in-zone. */
export type HrZone = {
	zone: number
	label: string
	minHr: number
	maxHr: number
	timeMs: number
	pct: number
}

/** One distance split (per km). */
export type Split = {
	index: number
	startM: number
	endM: number
	distanceM: number
	durationMs: number | null
	paceSecPerKm: number | null
	eleDeltaM: number | null
	avgHr: number | null
}

/** Fully analyzed activity ready for rendering. */
export type AnalyzedActivity = {
	name: string
	sportType: string
	samples: Sample[]
	bounds: WorldBounds
	distanceM: number
	hasTime: boolean
	hasElevation: boolean
	hasHeartRate: boolean
	startTimeMs: number | null
	durationMs: number | null
	movingMs: number | null
	stoppedMs: number | null
	eleGainM: number | null
	eleLossM: number | null
	minEle: number | null
	maxEle: number | null
	minHr: number | null
	maxHr: number | null
	avgHr: number | null
	maxSpeedMs: number | null
	avgSpeedMs: number | null
	avgPaceSecPerKm: number | null
	bestPaceSecPerKm: number | null
	maxGradePct: number | null
	calories: number | null
	hrZones: HrZone[] | null
	splits: Split[]
}

/**
 * Parses an ISO timestamp to epoch ms, or null.
 * @param time - ISO string or null
 * @returns Epoch ms or null
 */
const parseTime = (time: string | null): number | null => {
	if (!time) {
		return null
	}
	const ms = Date.parse(time)
	return Number.isFinite(ms) ? ms : null
}

/**
 * Moving-average smooths a nullable numeric series.
 * @param values - Raw values
 * @param window - Odd window size
 * @returns Smoothed series (null preserved)
 */
const smoothSeries = (values: Array<number | null>, window: number): Array<number | null> => {
	const half = Math.floor(window / 2)
	return values.map((_, index) => {
		let sum = 0
		let count = 0
		for (let offset = -half; offset <= half; offset += 1) {
			const value = values[index + offset]
			if (value !== null && value !== undefined) {
				sum += value
				count += 1
			}
		}
		return count > 0 ? sum / count : null
	})
}

/**
 * Computes 5 heart-rate zones with time-in-zone.
 * @param samples - Track samples
 * @param maxHr - Observed max heart rate
 * @returns Zone breakdown or null when no HR
 */
const computeHrZones = (samples: Sample[], maxHr: number): HrZone[] | null => {
	const bounds = [0.5, 0.6, 0.7, 0.8, 0.9].map((fraction) => Math.round(fraction * maxHr))
	const labels = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Max']
	const timeMs = [0, 0, 0, 0, 0]
	let total = 0

	for (let index = 1; index < samples.length; index += 1) {
		const hr = samples[index].hr
		const timePrev = samples[index - 1].timeMs
		const timeCur = samples[index].timeMs
		if (hr === null || timePrev === null || timeCur === null) {
			continue
		}
		const dt = Math.min(timeCur - timePrev, PAUSE_GAP_MS)
		if (dt <= 0) {
			continue
		}
		let zone = 0
		for (let boundary = 0; boundary < bounds.length; boundary += 1) {
			if (hr >= bounds[boundary]) {
				zone = boundary
			}
		}
		timeMs[zone] += dt
		total += dt
	}

	if (total === 0) {
		return null
	}

	return labels.map((label, index) => ({
		zone: index + 1,
		label,
		minHr: index === 0 ? 0 : bounds[index],
		maxHr: index === bounds.length - 1 ? maxHr : bounds[index + 1],
		timeMs: timeMs[index],
		pct: timeMs[index] / total,
	}))
}

/**
 * Builds per-kilometer splits.
 * @param samples - Track samples
 * @param totalDistanceM - Total distance
 * @returns Splits
 */
const computeSplits = (samples: Sample[], totalDistanceM: number): Split[] => {
	const splitLength = 1000
	const count = Math.max(1, Math.ceil(totalDistanceM / splitLength))
	const splits: Split[] = []

	/**
	 * Interpolates a value at a target distance between two samples.
	 * @param targetM - Target distance
	 * @param read - Value accessor
	 * @returns Interpolated value or null
	 */
	const atDistance = (targetM: number, read: (sample: Sample) => number | null): number | null => {
		for (let index = 1; index < samples.length; index += 1) {
			if (samples[index].distanceM >= targetM) {
				const prev = samples[index - 1]
				const cur = samples[index]
				const span = Math.max(cur.distanceM - prev.distanceM, 1e-9)
				const t = (targetM - prev.distanceM) / span
				const a = read(prev)
				const b = read(cur)
				if (a === null || b === null) {
					return b ?? a
				}
				return a + (b - a) * t
			}
		}
		return read(samples[samples.length - 1])
	}

	for (let index = 0; index < count; index += 1) {
		const startM = index * splitLength
		const endM = Math.min((index + 1) * splitLength, totalDistanceM)
		const startTime = atDistance(startM, (sample) => sample.timeMs)
		const endTime = atDistance(endM, (sample) => sample.timeMs)
		const startEle = atDistance(startM, (sample) => sample.eleSmooth)
		const endEle = atDistance(endM, (sample) => sample.eleSmooth)
		const distanceM = endM - startM
		const durationMs = startTime !== null && endTime !== null ? endTime - startTime : null
		const paceSecPerKm = durationMs !== null && distanceM > 0 ? durationMs / 1000 / (distanceM / 1000) : null

		let hrSum = 0
		let hrCount = 0
		for (const sample of samples) {
			if (sample.distanceM >= startM && sample.distanceM <= endM && sample.hr !== null) {
				hrSum += sample.hr
				hrCount += 1
			}
		}

		splits.push({
			index,
			startM,
			endM,
			distanceM,
			durationMs,
			paceSecPerKm,
			eleDeltaM: startEle !== null && endEle !== null ? endEle - startEle : null,
			avgHr: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
		})
	}
	return splits
}

/**
 * Estimates calories from heart rate (Keytel 2005, male reference).
 * @param samples - Track samples
 * @returns Estimated kcal or null when no HR/time
 */
const estimateCalories = (samples: Sample[]): number | null => {
	let kcal = 0
	let counted = false
	for (let index = 1; index < samples.length; index += 1) {
		const hr = samples[index].hr
		const timePrev = samples[index - 1].timeMs
		const timeCur = samples[index].timeMs
		if (hr === null || timePrev === null || timeCur === null) {
			continue
		}
		const minutes = Math.min(timeCur - timePrev, PAUSE_GAP_MS) / 60000
		if (minutes <= 0) {
			continue
		}
		const perMinute = (-55.0969 + 0.6309 * hr + 0.1988 * ASSUMED_WEIGHT_KG + 0.2017 * ASSUMED_AGE) / 4.184
		kcal += Math.max(0, perMinute) * minutes
		counted = true
	}
	return counted ? Math.round(kcal) : null
}

/**
 * Analyzes a parsed GPX track into a rich activity model.
 * @param track - Parsed track
 * @param sportType - Activity type label from the file
 * @returns Analyzed activity
 */
export const analyzeActivity = (track: GpxTrack, sportType: string): AnalyzedActivity => {
	const points = track.points
	const world = projectToWorld(points)
	const distances = cumulativeDistances(points)
	const times = points.map((point) => parseTime(point.time))
	const hasTime = times.filter((time) => time !== null).length > points.length * 0.5

	const eles = points.map((point) => point.ele)
	const eleSmooth = smoothSeries(eles, 7)

	// Raw interval speeds, then smoothed.
	const rawSpeed: Array<number | null> = points.map((_, index) => {
		if (index === 0 || !hasTime) {
			return null
		}
		const dt = times[index]! - times[index - 1]!
		const dd = distances[index] - distances[index - 1]
		if (dt <= 0 || dt > PAUSE_GAP_MS) {
			return null
		}
		return dd / (dt / 1000)
	})
	const speedSmooth = smoothSeries(rawSpeed, 5)

	const samples: Sample[] = points.map((point, index) => {
		const prevEle = index > 0 ? eleSmooth[index - 1] : null
		const curEle = eleSmooth[index]
		const dd = index > 0 ? distances[index] - distances[index - 1] : 0
		let gradePct: number | null = null
		if (prevEle !== null && curEle !== null && dd > 2) {
			gradePct = ((curEle - prevEle) / dd) * 100
		}
		return {
			lat: point.lat,
			lon: point.lon,
			ele: point.ele,
			hr: point.hr,
			timeMs: times[index],
			distanceM: distances[index],
			speedMs: speedSmooth[index],
			eleSmooth: curEle,
			gradePct,
			x: world[index].x,
			y: world[index].y,
		}
	})

	// Time + moving time.
	const startTimeMs = times.find((time) => time !== null) ?? null
	let endTimeMs: number | null = null
	for (let index = times.length - 1; index >= 0; index -= 1) {
		const time = times[index]
		if (time !== null) {
			endTimeMs = time
			break
		}
	}
	const durationMs = startTimeMs !== null && endTimeMs !== null ? endTimeMs - startTimeMs : null

	let movingMs = 0
	for (let index = 1; index < samples.length; index += 1) {
		const timePrev = times[index - 1]
		const timeCur = times[index]
		if (timePrev === null || timeCur === null) {
			continue
		}
		const dt = timeCur - timePrev
		if (dt <= 0) {
			continue
		}
		const dd = distances[index] - distances[index - 1]
		const speed = dd / (dt / 1000)
		if (dt > PAUSE_GAP_MS) {
			continue
		}
		if (speed >= MOVING_THRESHOLD_MS) {
			movingMs += dt
		}
	}
	const hasMoving = hasTime && durationMs !== null
	const stoppedMs = hasMoving ? Math.max(0, durationMs - movingMs) : null

	// Elevation gain/loss — threshold accumulator over the smoothed series.
	// Per-step deltas after smoothing are smaller than any sane deadband, so we
	// accumulate and bank once the running change clears the threshold.
	let eleGain = 0
	let eleLoss = 0
	let hasEle = false
	let eleAccumulator = 0
	for (let index = 1; index < samples.length; index += 1) {
		const prev = eleSmooth[index - 1]
		const cur = eleSmooth[index]
		if (prev === null || cur === null) {
			continue
		}
		hasEle = true
		eleAccumulator += cur - prev
		if (eleAccumulator >= ELE_THRESHOLD_M) {
			eleGain += eleAccumulator
			eleAccumulator = 0
		} else if (eleAccumulator <= -ELE_THRESHOLD_M) {
			eleLoss += -eleAccumulator
			eleAccumulator = 0
		}
	}

	// Speed stats — the window-5 smoothing already de-spikes GPS jumps.
	let maxSpeedMs: number | null = null
	for (const sample of samples) {
		if (sample.speedMs !== null && (maxSpeedMs === null || sample.speedMs > maxSpeedMs)) {
			maxSpeedMs = sample.speedMs
		}
	}
	const distanceM = distances[distances.length - 1]
	const avgSpeedMs = hasMoving && movingMs > 0 ? distanceM / (movingMs / 1000) : null
	const avgPaceSecPerKm = avgSpeedMs !== null && avgSpeedMs > 0 ? 1000 / avgSpeedMs : null

	const grades = samples.map((sample) => sample.gradePct).filter((grade): grade is number => grade !== null)
	const maxGradePct = grades.length > 0 ? Math.max(...grades.map((grade) => Math.abs(grade))) : null

	const hrs = samples.map((sample) => sample.hr).filter((hr): hr is number => hr !== null)
	const avgHr = hrs.length > 0 ? Math.round(hrs.reduce((sum, hr) => sum + hr, 0) / hrs.length) : null

	const splits = hasTime ? computeSplits(samples, distanceM) : []
	const paces = splits.map((split) => split.paceSecPerKm).filter((pace): pace is number => pace !== null)
	const bestPaceSecPerKm = paces.length > 0 ? Math.min(...paces) : null

	return {
		name: track.name,
		sportType,
		samples,
		bounds: worldBounds(world),
		distanceM,
		hasTime,
		hasElevation: track.hasElevation && hasEle,
		hasHeartRate: track.hasHeartRate,
		startTimeMs,
		durationMs,
		movingMs: hasMoving ? movingMs : null,
		stoppedMs,
		eleGainM: hasEle ? eleGain : null,
		eleLossM: hasEle ? eleLoss : null,
		minEle: track.minEle,
		maxEle: track.maxEle,
		minHr: track.minHr,
		maxHr: track.maxHr,
		avgHr,
		maxSpeedMs,
		avgSpeedMs,
		avgPaceSecPerKm,
		bestPaceSecPerKm,
		maxGradePct,
		calories: estimateCalories(samples),
		hrZones: track.hasHeartRate && track.maxHr !== null ? computeHrZones(samples, track.maxHr) : null,
		splits,
	}
}
