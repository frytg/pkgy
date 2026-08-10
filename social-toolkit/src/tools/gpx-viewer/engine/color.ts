/** Color palettes and interpolation for track + chart rendering. */

/** RGB triple. */
export type Rgb = { r: number; g: number; b: number }

/** A gradient stop: position 0..1 and color. */
export type GradientStop = { at: number; color: string }

/**
 * Parses #RRGGBB into an RGB triple.
 * @param hex - Hex color
 * @returns RGB triple
 */
export const parseHex = (hex: string): Rgb => {
	const value = hex.replace('#', '')
	return {
		r: Number.parseInt(value.slice(0, 2), 16),
		g: Number.parseInt(value.slice(2, 4), 16),
		b: Number.parseInt(value.slice(4, 6), 16),
	}
}

/**
 * Pads a 0..255 channel to two hex digits.
 * @param v - Channel value
 * @returns Two-digit hex
 */
const hexChannel = (v: number): string =>
	Math.max(0, Math.min(255, Math.round(v)))
		.toString(16)
		.padStart(2, '0')

/**
 * Converts an RGB triple back to #RRGGBB.
 * @param rgb - RGB triple
 * @returns Hex color
 */
export const toHex = ({ r, g, b }: Rgb): string => {
	return `#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`.toUpperCase()
}

/**
 * Linearly interpolates between two RGB colors.
 * @param a - Start color
 * @param b - End color
 * @param t - Position 0..1
 * @returns Interpolated color
 */
export const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => ({
	r: a.r + (b.r - a.r) * t,
	g: a.g + (b.g - a.g) * t,
	b: a.b + (b.b - a.b) * t,
})

/**
 * Samples a multi-stop gradient at t.
 * @param stops - Ordered gradient stops
 * @param t - Position 0..1
 * @returns Hex color
 */
export const sampleGradient = (stops: GradientStop[], t: number): string => {
	if (stops.length === 0) {
		return '#FFFFFF'
	}
	const clamped = Math.max(0, Math.min(1, t))
	if (clamped <= stops[0].at) {
		return stops[0].color
	}
	if (clamped >= stops[stops.length - 1].at) {
		return stops[stops.length - 1].color
	}
	for (let index = 1; index < stops.length; index += 1) {
		const right = stops[index]
		if (clamped <= right.at) {
			const left = stops[index - 1]
			const span = Math.max(right.at - left.at, 1e-9)
			const local = (clamped - left.at) / span
			return toHex(lerpRgb(parseHex(left.color), parseHex(right.color), local))
		}
	}
	return stops[stops.length - 1].color
}

/**
 * Pre-renders a gradient into a fixed-size lookup table of hex colors.
 * @param stops - Gradient stops
 * @param size - Table size
 * @returns Array of hex colors
 */
export const gradientLut = (stops: GradientStop[], size = 256): string[] => {
	const table: string[] = []
	for (let index = 0; index < size; index += 1) {
		table.push(sampleGradient(stops, index / (size - 1)))
	}
	return table
}

/** Elevation ramp — deep green valley to warm summit. */
export const ELEVATION_STOPS: GradientStop[] = [
	{ at: 0, color: '#3D7A4E' },
	{ at: 0.35, color: '#8FBB4E' },
	{ at: 0.62, color: '#FFFF11' },
	{ at: 0.85, color: '#F09139' },
	{ at: 1, color: '#E4483D' },
]

/** Speed ramp — cool slow to electric fast. */
export const SPEED_STOPS: GradientStop[] = [
	{ at: 0, color: '#2E5E8C' },
	{ at: 0.4, color: '#3FA7A0' },
	{ at: 0.7, color: '#FFFF11' },
	{ at: 1, color: '#F09139' },
]

/** Heart-rate ramp — calm blue to max red. */
export const HEARTRATE_STOPS: GradientStop[] = [
	{ at: 0, color: '#4E8FD6' },
	{ at: 0.45, color: '#8FBB4E' },
	{ at: 0.7, color: '#FFFF11' },
	{ at: 0.88, color: '#F09139' },
	{ at: 1, color: '#E4483D' },
]

/** Solid accent colors used for chart lines. */
export const ACCENT = {
	elevation: '#8FBB4E',
	speed: '#3FA7A0',
	heartRate: '#F09139',
	track: '#FFFF11',
}

/** Standard 5 heart-rate zone colors (Z1 easy → Z5 max). */
export const HR_ZONE_COLORS = ['#4E8FD6', '#8FBB4E', '#FFFF11', '#F09139', '#E4483D']

/**
 * Returns the zone color for a 1-based zone index.
 * @param zone - Zone index 1..5
 * @returns Hex color
 */
export const hrZoneColor = (zone: number): string => {
	const index = Math.max(1, Math.min(5, Math.round(zone))) - 1
	return HR_ZONE_COLORS[index]
}
