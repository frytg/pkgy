/** Formatting helpers for activity stats. All metric. */

/**
 * Formats meters as km with one decimal (or m when short).
 * @param meters - Distance in meters
 * @returns Human distance
 */
export const formatDistance = (meters: number): string => {
	if (meters < 1000) {
		return `${Math.round(meters)} m`
	}
	return `${(meters / 1000).toFixed(2)} km`
}

/**
 * Formats meters as a short km value without unit.
 * @param meters - Distance in meters
 * @returns km value
 */
export const formatKm = (meters: number): string => (meters / 1000).toFixed(2)

/**
 * Formats a duration as h:mm:ss or m:ss.
 * @param ms - Duration in milliseconds
 * @returns Clock duration
 */
export const formatDuration = (ms: number): string => {
	const totalSeconds = Math.max(0, Math.round(ms / 1000))
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	const mm = String(minutes).padStart(2, '0')
	const ss = String(seconds).padStart(2, '0')
	if (hours > 0) {
		return `${hours}:${mm}:${ss}`
	}
	return `${minutes}:${ss}`
}

/**
 * Formats a duration compactly for cards (e.g. 1h 24m).
 * @param ms - Duration in milliseconds
 * @returns Compact duration
 */
export const formatDurationShort = (ms: number): string => {
	const totalSeconds = Math.max(0, Math.round(ms / 1000))
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	if (hours > 0) {
		return `${hours}h ${String(minutes).padStart(2, '0')}m`
	}
	const seconds = totalSeconds % 60
	if (minutes > 0) {
		return `${minutes}m ${String(seconds).padStart(2, '0')}s`
	}
	return `${seconds}s`
}

/**
 * Formats meters/second as km/h.
 * @param ms - Speed in m/s
 * @returns km/h string
 */
export const formatSpeed = (ms: number): string => (ms * 3.6).toFixed(1)

/**
 * Formats seconds-per-km as m:ss /km.
 * @param secPerKm - Pace in seconds per kilometer
 * @returns Pace string
 */
export const formatPace = (secPerKm: number): string => {
	if (!Number.isFinite(secPerKm) || secPerKm <= 0) {
		return '—'
	}
	const minutes = Math.floor(secPerKm / 60)
	const seconds = Math.round(secPerKm % 60)
	return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Formats an ISO timestamp as a local date + time.
 * @param ms - Epoch milliseconds
 * @returns Date label
 */
export const formatDateTime = (ms: number): string => {
	const date = new Date(ms)
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

/**
 * Formats an ISO timestamp as a local clock time.
 * @param ms - Epoch milliseconds
 * @returns Time label
 */
export const formatClock = (ms: number): string => {
	const date = new Date(ms)
	return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Formats a signed meter delta with +/− prefix.
 * @param meters - Delta in meters
 * @returns Signed label
 */
export const formatSignedMeters = (meters: number): string => {
	const rounded = Math.round(meters)
	if (rounded > 0) {
		return `+${rounded}`
	}
	return String(rounded)
}
