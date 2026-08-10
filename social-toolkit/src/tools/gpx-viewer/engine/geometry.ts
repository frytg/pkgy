/** Geographic projection + map view-transform math. */

import type { GpxPoint } from '../../gpx-overlay/engine/parse-gpx.ts'

const EARTH_RADIUS_M = 6_371_000
const DEG_TO_RAD = Math.PI / 180

/** World-space point in meters, relative to the track origin. */
export type WorldPoint = { x: number; y: number }

/** Axis-aligned world bounds in meters. */
export type WorldBounds = {
	minX: number
	maxX: number
	minY: number
	maxY: number
	widthM: number
	heightM: number
	centerX: number
	centerY: number
}

/**
 * Projects lon/lat to local flat meters (equirectangular, cos-corrected).
 * Origin is the first point; Y is flipped so north renders up.
 * @param points - Track points
 * @returns World-space points in meters
 */
export const projectToWorld = (points: GpxPoint[]): WorldPoint[] => {
	if (points.length === 0) {
		return []
	}
	let latSum = 0
	for (const point of points) {
		latSum += point.lat
	}
	const midLatRad = (latSum / points.length) * DEG_TO_RAD
	const cosLat = Math.cos(midLatRad)
	const originLon = points[0].lon
	const originLat = points[0].lat

	return points.map((point) => ({
		x: EARTH_RADIUS_M * (point.lon - originLon) * DEG_TO_RAD * cosLat,
		y: -EARTH_RADIUS_M * (point.lat - originLat) * DEG_TO_RAD,
	}))
}

/**
 * Computes world bounds for projected points.
 * @param world - World-space points
 * @returns Bounds in meters
 */
export const worldBounds = (world: WorldPoint[]): WorldBounds => {
	let minX = Infinity
	let maxX = -Infinity
	let minY = Infinity
	let maxY = -Infinity
	for (const point of world) {
		minX = Math.min(minX, point.x)
		maxX = Math.max(maxX, point.x)
		minY = Math.min(minY, point.y)
		maxY = Math.max(maxY, point.y)
	}
	if (!Number.isFinite(minX)) {
		minX = 0
		maxX = 1
		minY = 0
		maxY = 1
	}
	return {
		minX,
		maxX,
		minY,
		maxY,
		widthM: Math.max(maxX - minX, 1e-6),
		heightM: Math.max(maxY - minY, 1e-6),
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2,
	}
}

/**
 * Camera transform: screen = world * scale + offset.
 * `scale` is screen px per world meter.
 */
export type ViewTransform = {
	scale: number
	tx: number
	ty: number
}

/**
 * Converts a world point to screen coordinates.
 * @param view - Camera transform
 * @param x - World x (meters)
 * @param y - World y (meters)
 * @returns Screen coordinates
 */
export const worldToScreen = (view: ViewTransform, x: number, y: number): { x: number; y: number } => ({
	x: x * view.scale + view.tx,
	y: y * view.scale + view.ty,
})

/**
 * Converts a screen point back to world meters.
 * @param view - Camera transform
 * @param x - Screen x
 * @param y - Screen y
 * @returns World coordinates
 */
export const screenToWorld = (view: ViewTransform, x: number, y: number): { x: number; y: number } => ({
	x: (x - view.tx) / view.scale,
	y: (y - view.ty) / view.scale,
})

/**
 * Builds a transform that fits bounds into a viewport with padding.
 * @param bounds - World bounds
 * @param viewportWidth - Viewport px
 * @param viewportHeight - Viewport px
 * @param padding - Edge padding px
 * @returns Fitted transform
 */
export const fitTransform = (
	bounds: WorldBounds,
	viewportWidth: number,
	viewportHeight: number,
	padding = 56,
): ViewTransform => {
	const usableWidth = Math.max(1, viewportWidth - padding * 2)
	const usableHeight = Math.max(1, viewportHeight - padding * 2)
	const scale = Math.min(usableWidth / bounds.widthM, usableHeight / bounds.heightM)
	return {
		scale,
		tx: viewportWidth / 2 - bounds.centerX * scale,
		ty: viewportHeight / 2 - bounds.centerY * scale,
	}
}

/**
 * Zooms a transform around a screen anchor point.
 * @param view - Current transform
 * @param factor - Zoom multiplier (>1 zooms in)
 * @param anchorX - Screen anchor x
 * @param anchorY - Screen anchor y
 * @returns New transform
 */
export const zoomAt = (view: ViewTransform, factor: number, anchorX: number, anchorY: number): ViewTransform => {
	const world = screenToWorld(view, anchorX, anchorY)
	const scale = view.scale * factor
	return {
		scale,
		tx: anchorX - world.x * scale,
		ty: anchorY - world.y * scale,
	}
}

/**
 * Clamps a zoom scale to sane limits relative to the fit scale.
 * @param scale - Proposed scale
 * @param fitScale - Scale that fits the whole track
 * @returns Clamped scale
 */
export const clampScale = (scale: number, fitScale: number): number => {
	const min = fitScale * 0.35
	const max = fitScale * 400
	return Math.max(min, Math.min(max, scale))
}

/**
 * Picks a "nice" grid step in meters for a given screen spacing.
 * @param view - Camera transform
 * @param targetPx - Desired on-screen grid spacing
 * @returns Grid step in meters
 */
export const niceGridStep = (view: ViewTransform, targetPx = 96): number => {
	const rawStep = targetPx / view.scale
	const magnitude = 10 ** Math.floor(Math.log10(rawStep))
	const normalized = rawStep / magnitude
	let step: number
	if (normalized < 1.5) {
		step = 1
	} else if (normalized < 3.5) {
		step = 2
	} else if (normalized < 7.5) {
		step = 5
	} else {
		step = 10
	}
	return step * magnitude
}
