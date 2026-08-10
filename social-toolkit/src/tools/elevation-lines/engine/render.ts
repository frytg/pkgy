import { buildContours, type ContourLine, type ContourPoint } from './contours.ts'
import { buildHeightfield, type Heightfield } from './heightfield.ts'
import type { ElevationLinesSettings } from './settings.ts'
import { fitExportSize } from '../../../engine/export-size.ts'

/** Fully generated contour map ready to draw. */
export type ElevationMap = {
	field: Heightfield
	contours: ContourLine[]
}

/**
 * Stable copy-sort for contour draw order (index lines last).
 * @param contours - Source lines
 * @returns New sorted array
 */
const orderContours = (contours: ContourLine[]): ContourLine[] => {
	const ordered = contours.slice()
	ordered.sort((a, b) => {
		if (a.isIndex !== b.isIndex) {
			return a.isIndex ? 1 : -1
		}
		return a.levelIndex - b.levelIndex
	})
	return ordered
}

/**
 * Generates heightfield + oriented contours for the current settings.
 * @param settings - Generator settings
 * @returns Map data
 */
export const generateElevationMap = (settings: ElevationLinesSettings): ElevationMap => {
	const field = buildHeightfield(settings)
	const contours = buildContours(field, settings.levels, settings.indexEvery)
	return { field, contours }
}

/**
 * Resolves export pixel size from aspect + long-edge budget.
 * @param settings - Generator settings
 * @param longEdge - Target long edge, or null for 2160 default
 * @returns Integer width/height
 */
export const resolveElevationExportSize = (
	settings: ElevationLinesSettings,
	longEdge: number | null,
): { width: number; height: number } => {
	const budget = longEdge ?? 2160
	return fitExportSize(settings.aspectWidth, settings.aspectHeight, budget)
}

/**
 * Layout metrics mapping grid coords → pixels.
 */
export type ContourLayout = {
	width: number
	height: number
	originX: number
	originY: number
	scaleX: number
	scaleY: number
}

/**
 * Builds a layout that fits the heightfield into the canvas with padding.
 * @param field - Height grid
 * @param width - Canvas width
 * @param height - Canvas height
 * @param paddingFraction - Padding as fraction of short edge
 * @returns Layout transform
 */
export const buildContourLayout = (
	field: Heightfield,
	width: number,
	height: number,
	paddingFraction: number,
): ContourLayout => {
	const pad = Math.max(0, Math.min(0.25, paddingFraction)) * Math.min(width, height)
	const innerW = Math.max(1, width - pad * 2)
	const innerH = Math.max(1, height - pad * 2)
	const gridW = Math.max(field.worldWidth, 1e-9)
	const gridH = Math.max(field.worldHeight, 1e-9)
	const scale = Math.min(innerW / gridW, innerH / gridH)
	const drawW = gridW * scale
	const drawH = gridH * scale
	return {
		width,
		height,
		originX: pad + (innerW - drawW) / 2,
		originY: pad + (innerH - drawH) / 2,
		scaleX: scale,
		scaleY: scale,
	}
}

/**
 * Maps a grid point into pixel space.
 * @param point - Grid coordinate
 * @param layout - Layout transform
 * @returns Pixel point
 */
export const projectPoint = (point: ContourPoint, layout: ContourLayout): ContourPoint => ({
	x: layout.originX + point.x * layout.scaleX,
	y: layout.originY + point.y * layout.scaleY,
})

/**
 * Builds an SVG path `d` from contour points.
 * @param points - Grid points
 * @param layout - Layout transform
 * @param closed - Whether to close the path
 * @returns Path data
 */
export const contourPathD = (points: ContourPoint[], layout: ContourLayout, closed: boolean): string => {
	if (points.length === 0) {
		return ''
	}
	const projected = points.map((point) => projectPoint(point, layout))
	// Skip duplicate closing vertex when we emit Z.
	const last = projected[projected.length - 1]
	const first = projected[0]
	const end =
		closed && projected.length > 2 && Math.hypot(last.x - first.x, last.y - first.y) < 0.05
			? projected.length - 1
			: projected.length
	const [head, ...rest] = projected.slice(0, end)
	const body = rest.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
	return `M ${head.x.toFixed(2)} ${head.y.toFixed(2)} ${body}${closed ? ' Z' : ''}`
}

/**
 * Stroke width for a contour line.
 * @param line - Contour
 * @param settings - Visual settings
 * @returns Pixel width
 */
const strokeFor = (line: ContourLine, settings: ElevationLinesSettings): number => {
	const base = settings.strokeWidth
	return line.isIndex ? base * settings.indexStrokeScale : base
}

/**
 * Draws the elevation map onto a 2D canvas context.
 * @param ctx - Canvas context
 * @param map - Generated map
 * @param settings - Visual settings
 * @param width - Canvas CSS pixel width
 * @param height - Canvas CSS pixel height
 */
export const drawElevationMap = (
	ctx: CanvasRenderingContext2D,
	map: ElevationMap,
	settings: ElevationLinesSettings,
	width: number,
	height: number,
): void => {
	ctx.clearRect(0, 0, width, height)
	if (settings.includeBackground) {
		ctx.fillStyle = settings.backgroundColor
		ctx.fillRect(0, 0, width, height)
	}

	const layout = buildContourLayout(map.field, width, height, settings.padding)
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	ctx.strokeStyle = settings.strokeColor

	// Draw lower levels first so index lines layer cleanly on top.
	const ordered = orderContours(map.contours)

	for (const line of ordered) {
		if (line.points.length < 2) {
			continue
		}
		ctx.beginPath()
		const first = projectPoint(line.points[0], layout)
		ctx.moveTo(first.x, first.y)
		const last = line.points[line.points.length - 1]
		const skipClose = line.closed && Math.hypot(last.x - line.points[0].x, last.y - line.points[0].y) < 1e-3
		const end = skipClose ? line.points.length - 1 : line.points.length
		for (let i = 1; i < end; i += 1) {
			const p = projectPoint(line.points[i], layout)
			ctx.lineTo(p.x, p.y)
		}
		if (line.closed) {
			ctx.closePath()
		}
		ctx.lineWidth = strokeFor(line, settings)
		ctx.stroke()
	}
}

/**
 * Builds SVG markup for the elevation map.
 * @param map - Generated map
 * @param settings - Visual settings
 * @param width - Output width
 * @param height - Output height
 * @returns SVG string
 */
export const generateElevationSvg = (
	map: ElevationMap,
	settings: ElevationLinesSettings,
	width: number,
	height: number,
): string => {
	const layout = buildContourLayout(map.field, width, height, settings.padding)
	const parts: string[] = []

	if (settings.includeBackground) {
		parts.push(`<rect width="${width}" height="${height}" fill="${settings.backgroundColor}"/>`)
	}

	const ordered = orderContours(map.contours)

	for (const line of ordered) {
		const d = contourPathD(line.points, layout, line.closed)
		if (!d) {
			continue
		}
		const sw = strokeFor(line, settings)
		parts.push(
			`<path d="${d}" fill="none" stroke="${settings.strokeColor}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`,
		)
	}

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
		...parts,
		'</svg>',
	].join('')
}

/**
 * Renders a PNG blob of the elevation map.
 * @param map - Generated map
 * @param settings - Visual settings
 * @param width - Output width
 * @param height - Output height
 * @returns PNG blob
 */
export const captureElevationPng = async (
	map: ElevationMap,
	settings: ElevationLinesSettings,
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
	drawElevationMap(ctx, map, settings, width, height)
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!blob) {
		throw new Error('PNG encode failed')
	}
	return blob
}
