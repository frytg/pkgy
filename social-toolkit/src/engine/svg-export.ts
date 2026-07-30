import { getContainedImageRect, getImageFootprintScale, getImagePreviewZoom } from './footprint.ts'
import type { HalftoneSettings, RasterShape } from './settings.ts'

type GenerateImageHalftoneSvgOptions = {
	image: HTMLImageElement
	includeBackground: boolean
	settings: HalftoneSettings
	width: number
	height: number
}

type Bounds = {
	maxX: number
	maxY: number
	minX: number
	minY: number
}

/**
 * Clamps a number into an inclusive range.
 * @param value - Input value
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns Clamped value
 */
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

/**
 * Hermite smoothstep between two edges.
 * @param edge0 - Lower edge
 * @param edge1 - Upper edge
 * @param value - Input
 * @returns Interpolated 0–1 value
 */
const smoothstep = (edge0: number, edge1: number, value: number): number => {
	const x = clamp((value - edge0) / Math.max(edge1 - edge0, 0.000001), 0, 1)
	return x * x * (3 - 2 * x)
}

/**
 * Formats a number for compact SVG attributes.
 * @param value - Numeric value
 * @returns Trimmed decimal string
 */
const formatNumber = (value: number): string => Number(value.toFixed(3)).toString()

/**
 * Escapes a value for use inside an HTML/SVG attribute.
 * @param value - Raw string
 * @returns Escaped string
 */
const escapeAttribute = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * Expands bounds to include another rect.
 * @param current - Existing bounds or null
 * @param next - Bounds to merge
 * @returns Merged bounds
 */
const mergeBounds = (current: Bounds | null, next: Bounds): Bounds =>
	current
		? {
				minX: Math.min(current.minX, next.minX),
				minY: Math.min(current.minY, next.minY),
				maxX: Math.max(current.maxX, next.maxX),
				maxY: Math.max(current.maxY, next.maxY),
			}
		: next

/**
 * Linear interpolation helper.
 * @param a - Start
 * @param b - End
 * @param t - Mix factor
 * @returns Interpolated value
 */
const mix = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Stable 0–1 hash from a 2D cell id (matches shader hash21).
 * @param x - Cell column
 * @param y - Cell row
 * @param salt - Extra salt for independent channels
 * @returns Pseudo-random value in [0, 1)
 */
const hash21 = (x: number, y: number, salt = 0): number => {
	const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123
	return n - Math.floor(n)
}

/**
 * Builds one SVG motif for a halftone cell.
 * @param shape - Raster motif id
 * @param cx - Cell center x
 * @param cy - Cell center y
 * @param amount - Tone-mapped motif size in cell units (0–1 scale relative to cell)
 * @param localWidth - Stroke thickness control
 * @param cellSize - Cell size in pixels
 * @param rotation - Rotation in radians around the cell center
 * @returns Markup plus bounds, or null when too small
 */
const buildCellMarkup = ({
	shape,
	cx,
	cy,
	amount,
	localWidth,
	cellSize,
	rotation = 0,
}: {
	shape: RasterShape
	cx: number
	cy: number
	amount: number
	localWidth: number
	cellSize: number
	rotation?: number
}): { bounds: Bounds; markup: string } | null => {
	const radiusPx = amount * cellSize
	const stroke = Math.max(localWidth * amount * cellSize, 0.25)
	const halfStroke = stroke * 0.5
	const thicknessFactor = mix(0.55, 1.0, clamp(localWidth, 0.05, 1.4) / 1.4)
	const degrees = (rotation * 180) / Math.PI
	const wrapRotate = (inner: string): string =>
		Math.abs(rotation) > 0.0001
			? `<g transform="rotate(${formatNumber(degrees)} ${formatNumber(cx)} ${formatNumber(cy)})">${inner}</g>`
			: inner

	if (shape === 'bar' || shape === 'vertical' || shape === 'cross') {
		const commands: string[] = []
		let bounds: Bounds | null = null

		const pushBar = (vertical: boolean): void => {
			const x1 = vertical ? cx : cx - radiusPx
			const y1 = vertical ? cy - radiusPx : cy
			const x2 = vertical ? cx : cx + radiusPx
			const y2 = vertical ? cy + radiusPx : cy
			commands.push(`M ${formatNumber(x1)} ${formatNumber(y1)} L ${formatNumber(x2)} ${formatNumber(y2)}`)
			bounds = mergeBounds(bounds, {
				minX: Math.floor(Math.min(x1, x2) - halfStroke),
				minY: Math.floor(Math.min(y1, y2) - halfStroke),
				maxX: Math.ceil(Math.max(x1, x2) + halfStroke),
				maxY: Math.ceil(Math.max(y1, y2) + halfStroke),
			})
		}

		if (shape === 'bar' || shape === 'cross') {
			pushBar(false)
		}
		if (shape === 'vertical' || shape === 'cross') {
			pushBar(true)
		}

		if (!bounds || commands.length === 0) {
			return null
		}

		return {
			bounds,
			markup: wrapRotate(
				`<path d="${commands.join(' ')}" fill="none" stroke-width="${formatNumber(stroke)}" stroke-linecap="round" />`,
			),
		}
	}

	if (shape === 'circle') {
		const r = radiusPx * thicknessFactor * 0.5
		if (r <= 0.15) {
			return null
		}
		return {
			bounds: {
				minX: Math.floor(cx - r),
				minY: Math.floor(cy - r),
				maxX: Math.ceil(cx + r),
				maxY: Math.ceil(cy + r),
			},
			markup: `<circle cx="${formatNumber(cx)}" cy="${formatNumber(cy)}" r="${formatNumber(r)}" />`,
		}
	}

	if (shape === 'square') {
		const half = radiusPx * mix(0.5, 0.95, clamp(localWidth, 0.05, 1.4) / 1.4) * 0.5
		if (half <= 0.15) {
			return null
		}
		return {
			bounds: {
				minX: Math.floor(cx - half),
				minY: Math.floor(cy - half),
				maxX: Math.ceil(cx + half),
				maxY: Math.ceil(cy + half),
			},
			markup: wrapRotate(
				`<rect x="${formatNumber(cx - half)}" y="${formatNumber(cy - half)}" width="${formatNumber(half * 2)}" height="${formatNumber(half * 2)}" />`,
			),
		}
	}

	const diamondHalf = radiusPx * mix(0.55, 1.05, clamp(localWidth, 0.05, 1.4) / 1.4) * 0.5
	if (diamondHalf <= 0.15) {
		return null
	}
	const points = [
		`${formatNumber(cx)},${formatNumber(cy - diamondHalf)}`,
		`${formatNumber(cx + diamondHalf)},${formatNumber(cy)}`,
		`${formatNumber(cx)},${formatNumber(cy + diamondHalf)}`,
		`${formatNumber(cx - diamondHalf)},${formatNumber(cy)}`,
	].join(' ')

	return {
		bounds: {
			minX: Math.floor(cx - diamondHalf),
			minY: Math.floor(cy - diamondHalf),
			maxX: Math.ceil(cx + diamondHalf),
			maxY: Math.ceil(cy + diamondHalf),
		},
		markup: wrapRotate(`<polygon points="${points}" />`),
	}
}

/**
 * Generates an SVG string that approximates the band-halftone image render.
 * @param options - Image, settings, export size, and background flag
 * @returns SVG markup or null when inputs are invalid
 */
export const generateImageHalftoneSvg = ({
	image,
	includeBackground,
	settings,
	width,
	height,
}: GenerateImageHalftoneSvgOptions): string | null => {
	if (width <= 0 || height <= 0 || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
		return null
	}

	const imageRect = getContainedImageRect({
		imageHeight: image.naturalHeight,
		imageWidth: image.naturalWidth,
		viewportHeight: height,
		viewportWidth: width,
		zoom: getImagePreviewZoom(settings.previewDistance),
	})

	if (!imageRect) {
		return null
	}

	const sourceCanvas = document.createElement('canvas')
	sourceCanvas.width = width
	sourceCanvas.height = height
	const sourceContext = sourceCanvas.getContext('2d')
	if (!sourceContext) {
		return null
	}

	sourceContext.clearRect(0, 0, width, height)
	sourceContext.drawImage(image, imageRect.x, imageRect.y, imageRect.width, imageRect.height)

	const pixels = sourceContext.getImageData(0, 0, width, height).data
	const footprintScale = getImageFootprintScale({
		imageHeight: image.naturalHeight,
		imageWidth: image.naturalWidth,
		previewDistance: settings.previewDistance,
		viewportHeight: height,
		viewportWidth: width,
	})
	const cellSize = Math.max(settings.scale * Math.max(footprintScale, 0.001), 1)
	const localPower = clamp(settings.power, -1.5, 1.5)
	const localWidth = clamp(settings.width, 0.05, 1.4)
	const applyToDark = settings.toneTarget === 'dark'
	const ink = settings.dashColor
	const columns = Math.ceil(width / cellSize)
	const rows = Math.ceil(height / cellSize)
	const strokeGroups = new Map<string, string[]>()
	const fillGroups = new Map<string, string[]>()
	let contentBounds: Bounds | null = null

	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const sampleX = clamp((column + 0.5) * cellSize, 0, width - 1)
			const sampleY = clamp((row + 0.5) * cellSize, 0, height - 1)
			const sampleIndex = (Math.floor(sampleY) * width + Math.floor(sampleX)) * 4
			const alpha = (pixels[sampleIndex + 3] ?? 0) / 255
			const mask = smoothstep(0.02, 0.08, alpha)

			if (mask <= 0) {
				continue
			}

			const contrast = settings.imageContrast
			const red = clamp(((pixels[sampleIndex] ?? 0) / 255 - 0.5) * contrast + 0.5, 0, 1)
			const green = clamp(((pixels[sampleIndex + 1] ?? 0) / 255 - 0.5) * contrast + 0.5, 0, 1)
			const blue = clamp(((pixels[sampleIndex + 2] ?? 0) / 255 - 0.5) * contrast + 0.5, 0, 1)
			let tone = red * 0.2126 + green * 0.7152 + blue * 0.0722

			if (applyToDark) {
				tone = 1 - tone
			}

			const amount =
				Math.max(
					clamp(tone + (localPower + (hash21(column, row) - 0.5) * 2 * clamp(settings.randomness, 0, 1)) * 0.33, 0, 1),
					settings.minimumTone,
				) * 0.92
			const strokeWidth = localWidth
			const cx = (column + 0.5) * cellSize
			const cy = (row + 0.5) * cellSize

			if (amount <= 0.0001) {
				continue
			}

			const cell = buildCellMarkup({
				shape: settings.shape,
				cx,
				cy,
				amount,
				localWidth: strokeWidth,
				cellSize,
			})

			if (!cell) {
				continue
			}

			contentBounds = mergeBounds(contentBounds, cell.bounds)
			const opacityKey = formatNumber(mask)
			const isStroke = settings.shape === 'bar' || settings.shape === 'vertical' || settings.shape === 'cross'
			const groups = isStroke ? strokeGroups : fillGroups
			const bucket = groups.get(opacityKey) ?? []
			bucket.push(cell.markup)
			groups.set(opacityKey, bucket)
		}
	}

	const fullBounds = { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 }
	const croppedBounds = includeBackground ? fullBounds : (contentBounds ?? fullBounds)
	const exportWidth = croppedBounds.maxX - croppedBounds.minX + 1
	const exportHeight = croppedBounds.maxY - croppedBounds.minY + 1

	const layers = [
		...Array.from(strokeGroups.entries()).map(
			([opacity, markups]) =>
				`<g fill="none" stroke="${escapeAttribute(ink)}" stroke-opacity="${opacity}">${markups.join('')}</g>`,
		),
		...Array.from(fillGroups.entries()).map(
			([opacity, markups]) => `<g fill="${escapeAttribute(ink)}" fill-opacity="${opacity}">${markups.join('')}</g>`,
		),
	]

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(exportWidth)}" height="${formatNumber(exportHeight)}" viewBox="0 0 ${formatNumber(exportWidth)} ${formatNumber(exportHeight)}" fill="none">`,
		includeBackground
			? `<rect width="${formatNumber(exportWidth)}" height="${formatNumber(exportHeight)}" fill="${escapeAttribute(settings.backgroundColor)}" />`
			: '',
		`<g transform="translate(${formatNumber(-croppedBounds.minX)} ${formatNumber(-croppedBounds.minY)})">`,
		...layers,
		'</g>',
		'</svg>',
	]
		.filter(Boolean)
		.join('')
}
