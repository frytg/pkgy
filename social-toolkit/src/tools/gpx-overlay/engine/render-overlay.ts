import { fitExportSize } from '../../../engine/export-size.ts'
import { cumulativeDistances, type GpxPoint, type GpxTrack } from './parse-gpx.ts'
import type { GpxOverlaySettings } from './settings.ts'

/** Axis-aligned bounds in lon/lat space (x = lon, y = lat). */
export type GeoBounds = {
	minLon: number
	maxLon: number
	minLat: number
	maxLat: number
}

/** Pixel point. */
export type PixelPoint = { x: number; y: number }

/** Layout rectangles for each drawable layer. */
export type OverlayLayout = {
	width: number
	height: number
	trackRect: { x: number; y: number; width: number; height: number } | null
	elevationRect: { x: number; y: number; width: number; height: number } | null
	heartRateRect: { x: number; y: number; width: number; height: number } | null
}

/**
 * Computes geographic bounds for a track.
 * @param points - Track points
 * @returns Lon/lat bounds
 */
export const geoBounds = (points: GpxPoint[]): GeoBounds => {
	let minLon = Infinity
	let maxLon = -Infinity
	let minLat = Infinity
	let maxLat = -Infinity
	for (const point of points) {
		minLon = Math.min(minLon, point.lon)
		maxLon = Math.max(maxLon, point.lon)
		minLat = Math.min(minLat, point.lat)
		maxLat = Math.max(maxLat, point.lat)
	}
	return { minLon, maxLon, minLat, maxLat }
}

/**
 * Builds the stacked layout for enabled layers inside a canvas size.
 * @param width - Canvas width
 * @param height - Canvas height
 * @param settings - Overlay settings
 * @param track - Parsed track (for availability gates)
 * @returns Layout rectangles
 */
export const buildOverlayLayout = (
	width: number,
	height: number,
	settings: GpxOverlaySettings,
	track: GpxTrack,
): OverlayLayout => {
	const pad = settings.padding
	const showTrack = settings.layers.track
	const showElevation = settings.layers.elevation && track.hasElevation
	const showHeartRate = settings.layers.heartRate && track.hasHeartRate

	const chartCount = Number(showElevation) + Number(showHeartRate)
	const innerWidth = Math.max(1, width - pad * 2)
	const innerHeight = Math.max(1, height - pad * 2)

	if (!showTrack && chartCount === 0) {
		return { width, height, trackRect: null, elevationRect: null, heartRateRect: null }
	}

	if (!showTrack) {
		const chartHeight = chartCount > 0 ? (innerHeight - (chartCount - 1) * 16) / chartCount : 0
		let y = pad
		const elevationRect = showElevation
			? { x: pad, y, width: innerWidth, height: chartHeight }
			: null
		if (showElevation) {
			y += chartHeight + 16
		}
		const heartRateRect = showHeartRate
			? { x: pad, y, width: innerWidth, height: chartHeight }
			: null
		return { width, height, trackRect: null, elevationRect, heartRateRect }
	}

	if (chartCount === 0) {
		return {
			width,
			height,
			trackRect: { x: pad, y: pad, width: innerWidth, height: innerHeight },
			elevationRect: null,
			heartRateRect: null,
		}
	}

	const chartsBand = Math.min(innerHeight * settings.chartHeightRatio * chartCount, innerHeight * 0.45)
	const gap = 16
	const trackHeight = Math.max(1, innerHeight - chartsBand - gap)
	const chartHeight = (chartsBand - (chartCount - 1) * gap) / chartCount

	let chartY = pad + trackHeight + gap
	const elevationRect = showElevation
		? { x: pad, y: chartY, width: innerWidth, height: chartHeight }
		: null
	if (showElevation) {
		chartY += chartHeight + gap
	}
	const heartRateRect = showHeartRate
		? { x: pad, y: chartY, width: innerWidth, height: chartHeight }
		: null

	return {
		width,
		height,
		trackRect: { x: pad, y: pad, width: innerWidth, height: trackHeight },
		elevationRect,
		heartRateRect,
	}
}

/**
 * Geographic width/height aspect for a track (mercator-corrected).
 * @param points - Track points
 * @returns Width ÷ height in projected space
 */
export const trackAspectRatio = (points: GpxPoint[]): number => {
	const bounds = geoBounds(points)
	const midLat = (bounds.minLat + bounds.maxLat) / 2
	const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 1e-9)
	const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1e-9)
	return (lonSpan * Math.cos((midLat * Math.PI) / 180)) / latSpan
}

/**
 * Resolves export pixel size from track geometry and enabled layers.
 * Track-only output matches the route aspect; charts extend height below.
 * @param track - Parsed track
 * @param settings - Overlay settings
 * @param longEdge - Target long edge, or null for a 2160 default budget
 * @returns Integer width/height
 */
export const resolveGpxExportSize = (
	track: GpxTrack,
	settings: GpxOverlaySettings,
	longEdge: number | null,
): { width: number; height: number } => {
	const budget = longEdge ?? 2160
	const pad = settings.padding
	const gap = 16
	const showTrack = settings.layers.track
	const showElevation = settings.layers.elevation && track.hasElevation
	const showHeartRate = settings.layers.heartRate && track.hasHeartRate
	const chartCount = Number(showElevation) + Number(showHeartRate)

	if (!showTrack && chartCount === 0) {
		return { width: budget, height: budget }
	}

	if (!showTrack) {
		// Wide stacked charts — ~2.8∶1 per chart row.
		const chartAspect = 2.8 / chartCount
		return fitExportSize(chartAspect, 1, budget)
	}

	const aspect = trackAspectRatio(track.points)

	if (chartCount === 0) {
		// Canvas = padded track box that matches geo aspect (no letterboxing).
		const content = fitExportSize(aspect, 1, Math.max(1, budget - pad * 2))
		return {
			width: content.width + pad * 2,
			height: content.height + pad * 2,
		}
	}

	// Track fills its band; charts sit below. Solve so trackRect aspect == geo aspect.
	const chartFraction = Math.min(settings.chartHeightRatio * chartCount, 0.45)
	const trackFraction = Math.max(1 - chartFraction, 0.35)

	// Prefer fitting the long edge of the full canvas.
	// innerW / trackH = aspect, trackH ≈ innerH * trackFraction (gap negligible at scale)
	// innerW / innerH ≈ aspect * trackFraction
	const contentAspect = aspect * trackFraction
	const content = fitExportSize(contentAspect, 1, Math.max(1, budget - pad * 2))
	const innerWidth = content.width
	const innerHeight = content.height
	const chartsBand = Math.min(innerHeight * chartFraction, innerHeight * 0.45)
	const trackHeight = Math.max(1, innerHeight - chartsBand - gap)
	// Re-derive width from exact track height so projection fills flush.
	const trackWidth = Math.max(1, Math.round(trackHeight * aspect))
	const width = Math.max(trackWidth, innerWidth) + pad * 2
	const height = innerHeight + pad * 2

	return { width, height }
}

/**
 * Projects lon/lat points into a rectangle with correct aspect (mercator-ish Y stretch by cos mid-lat).
 * @param points - Track points
 * @param rect - Destination rectangle
 * @returns Pixel coordinates in the same order
 */
export const projectTrack = (
	points: GpxPoint[],
	rect: { x: number; y: number; width: number; height: number },
): PixelPoint[] => {
	const aspect = trackAspectRatio(points)
	const bounds = geoBounds(points)
	const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 1e-9)
	const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1e-9)

	let drawWidth = rect.width
	let drawHeight = rect.height
	let offsetX = 0
	let offsetY = 0

	if (aspect > rect.width / rect.height) {
		drawHeight = rect.width / aspect
		offsetY = (rect.height - drawHeight) / 2
	} else {
		drawWidth = rect.height * aspect
		offsetX = (rect.width - drawWidth) / 2
	}

	return points.map((point) => {
		const nx = (point.lon - bounds.minLon) / lonSpan
		const ny = (point.lat - bounds.minLat) / latSpan
		return {
			x: rect.x + offsetX + nx * drawWidth,
			y: rect.y + offsetY + (1 - ny) * drawHeight,
		}
	})
}

/**
 * Builds an SVG path `d` from pixel points.
 * @param pixels - Pixel polyline
 * @returns Path data string
 */
export const polylinePath = (pixels: PixelPoint[]): string => {
	if (pixels.length === 0) {
		return ''
	}
	const [first, ...rest] = pixels
	return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest
		.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
		.join(' ')}`
}

/**
 * Samples a numeric series along cumulative distance for charting.
 * @param track - Parsed track
 * @param valueOf - Value accessor (skips nulls via interpolation gap breaks)
 * @returns Distance/value pairs ready for plotting
 */
export const seriesAlongDistance = (
	track: GpxTrack,
	valueOf: (point: GpxPoint) => number | null,
): Array<{ distance: number; value: number }> => {
	const distances = cumulativeDistances(track.points)
	const series: Array<{ distance: number; value: number }> = []
	for (let index = 0; index < track.points.length; index += 1) {
		const value = valueOf(track.points[index])
		if (value === null) {
			continue
		}
		series.push({ distance: distances[index], value })
	}
	return series
}

/**
 * Projects a distance/value series into a chart rectangle.
 * @param series - Distance/value samples
 * @param rect - Chart rectangle
 * @returns Pixel polyline
 */
export const projectSeries = (
	series: Array<{ distance: number; value: number }>,
	rect: { x: number; y: number; width: number; height: number },
): PixelPoint[] => {
	if (series.length === 0) {
		return []
	}
	const minDistance = series[0].distance
	const maxDistance = series[series.length - 1].distance
	const distanceSpan = Math.max(maxDistance - minDistance, 1e-9)
	let minValue = Infinity
	let maxValue = -Infinity
	for (const sample of series) {
		minValue = Math.min(minValue, sample.value)
		maxValue = Math.max(maxValue, sample.value)
	}
	const valuePad = Math.max((maxValue - minValue) * 0.08, 1)
	minValue -= valuePad
	maxValue += valuePad
	const valueSpan = Math.max(maxValue - minValue, 1e-9)

	return series.map((sample) => ({
		x: rect.x + ((sample.distance - minDistance) / distanceSpan) * rect.width,
		y: rect.y + (1 - (sample.value - minValue) / valueSpan) * rect.height,
	}))
}

/**
 * Formats a number for SVG attributes.
 * @param value - Number
 * @returns Fixed string
 */
const fmt = (value: number): string => value.toFixed(2)

/**
 * Builds transparent-background SVG markup for the overlay.
 * @param track - Parsed GPX track
 * @param settings - Visual settings
 * @param width - Output width
 * @param height - Output height
 * @returns SVG string
 */
export const generateGpxOverlaySvg = (
	track: GpxTrack,
	settings: GpxOverlaySettings,
	width: number,
	height: number,
): string => {
	const layout = buildOverlayLayout(width, height, settings, track)
	const parts: string[] = []

	if (layout.trackRect) {
		const pixels = projectTrack(track.points, layout.trackRect)
		parts.push(
			`<path d="${polylinePath(pixels)}" fill="none" stroke="${settings.strokeColor}" stroke-width="${settings.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
		)
		if (settings.showStartEnd && pixels.length > 0) {
			const start = pixels[0]
			const end = pixels[pixels.length - 1]
			const r = Math.max(settings.strokeWidth * 1.6, 4)
			parts.push(
				`<circle cx="${fmt(start.x)}" cy="${fmt(start.y)}" r="${fmt(r)}" fill="${settings.strokeColor}"/>`,
				`<circle cx="${fmt(end.x)}" cy="${fmt(end.y)}" r="${fmt(r)}" fill="none" stroke="${settings.strokeColor}" stroke-width="${settings.strokeWidth}"/>`,
			)
		}
	}

	if (layout.elevationRect) {
		const series = seriesAlongDistance(track, (point) => point.ele)
		const pixels = projectSeries(series, layout.elevationRect)
		parts.push(
			`<path d="${polylinePath(pixels)}" fill="none" stroke="${settings.elevationColor}" stroke-width="${settings.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
		)
	}

	if (layout.heartRateRect) {
		const series = seriesAlongDistance(track, (point) => point.hr)
		const pixels = projectSeries(series, layout.heartRateRect)
		parts.push(
			`<path d="${polylinePath(pixels)}" fill="none" stroke="${settings.heartRateColor}" stroke-width="${settings.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
		)
	}

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
		...parts,
		'</svg>',
	].join('')
}

/**
 * Draws the overlay onto a canvas context (transparent by default).
 * @param ctx - 2D context
 * @param track - Parsed track
 * @param settings - Visual settings
 * @param width - Canvas width
 * @param height - Canvas height
 */
export const drawGpxOverlay = (
	ctx: CanvasRenderingContext2D,
	track: GpxTrack,
	settings: GpxOverlaySettings,
	width: number,
	height: number,
): void => {
	ctx.clearRect(0, 0, width, height)
	const layout = buildOverlayLayout(width, height, settings, track)

	/**
	 * Strokes a pixel polyline.
	 * @param pixels - Points
	 * @param color - Stroke color
	 */
	const strokePolyline = (pixels: PixelPoint[], color: string): void => {
		if (pixels.length < 2) {
			return
		}
		ctx.beginPath()
		ctx.moveTo(pixels[0].x, pixels[0].y)
		for (let index = 1; index < pixels.length; index += 1) {
			ctx.lineTo(pixels[index].x, pixels[index].y)
		}
		ctx.strokeStyle = color
		ctx.lineWidth = settings.strokeWidth
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'
		ctx.stroke()
	}

	if (layout.trackRect) {
		const pixels = projectTrack(track.points, layout.trackRect)
		strokePolyline(pixels, settings.strokeColor)
		if (settings.showStartEnd && pixels.length > 0) {
			const r = Math.max(settings.strokeWidth * 1.6, 4)
			const start = pixels[0]
			const end = pixels[pixels.length - 1]
			ctx.fillStyle = settings.strokeColor
			ctx.beginPath()
			ctx.arc(start.x, start.y, r, 0, Math.PI * 2)
			ctx.fill()
			ctx.strokeStyle = settings.strokeColor
			ctx.lineWidth = settings.strokeWidth
			ctx.beginPath()
			ctx.arc(end.x, end.y, r, 0, Math.PI * 2)
			ctx.stroke()
		}
	}

	if (layout.elevationRect) {
		const series = seriesAlongDistance(track, (point) => point.ele)
		strokePolyline(projectSeries(series, layout.elevationRect), settings.elevationColor)
	}

	if (layout.heartRateRect) {
		const series = seriesAlongDistance(track, (point) => point.hr)
		strokePolyline(projectSeries(series, layout.heartRateRect), settings.heartRateColor)
	}
}

/**
 * Renders a transparent PNG blob of the overlay.
 * @param track - Parsed track
 * @param settings - Visual settings
 * @param width - Output width
 * @param height - Output height
 * @returns PNG blob
 */
export const captureGpxOverlayPng = async (
	track: GpxTrack,
	settings: GpxOverlaySettings,
	width: number,
	height: number,
): Promise<Blob> => {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	const ctx = canvas.getContext('2d')
	if (!ctx) {
		throw new Error('Canvas 2D unavailable')
	}
	drawGpxOverlay(ctx, track, settings, width, height)
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!blob) {
		throw new Error('PNG encode failed')
	}
	return blob
}
