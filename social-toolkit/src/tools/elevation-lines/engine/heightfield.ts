import { terrainHeight } from './noise.ts'
import type { ElevationLinesSettings } from './settings.ts'

/** Regular grid of terrain heights in [0, 1]. */
export type Heightfield = {
	/** Columns (x). */
	cols: number
	/** Rows (y). */
	rows: number
	/** Row-major samples, length cols * rows. */
	data: Float32Array
	/** World width of the sampled domain (aspect-aware, unitless). */
	worldWidth: number
	/** World height of the sampled domain. */
	worldHeight: number
}

/**
 * Resolves grid dimensions from settings so the long axis hits `resolution`.
 * @param settings - Generator settings
 * @returns Column and row counts
 */
export const resolveGridSize = (settings: ElevationLinesSettings): { cols: number; rows: number } => {
	const aspect = Math.max(settings.aspectWidth, 1e-6) / Math.max(settings.aspectHeight, 1e-6)
	const long = Math.max(32, Math.floor(settings.resolution))
	if (aspect >= 1) {
		const cols = long
		const rows = Math.max(32, Math.round(long / aspect))
		return { cols, rows }
	}
	const rows = long
	const cols = Math.max(32, Math.round(long * aspect))
	return { cols, rows }
}

/**
 * Samples a heightfield for the given settings.
 * @param settings - Generator settings
 * @returns Dense height grid
 */
export const buildHeightfield = (settings: ElevationLinesSettings): Heightfield => {
	const { cols, rows } = resolveGridSize(settings)
	const data = new Float32Array(cols * rows)
	const worldWidth = cols - 1
	const worldHeight = rows - 1

	for (let row = 0; row < rows; row += 1) {
		const v = rows === 1 ? 0.5 : row / (rows - 1)
		for (let col = 0; col < cols; col += 1) {
			const u = cols === 1 ? 0.5 : col / (cols - 1)
			data[row * cols + col] = terrainHeight(
				u,
				v,
				settings.seed,
				settings.frequency,
				settings.octaves,
				settings.warp,
				settings.ridged,
			)
		}
	}

	return { cols, rows, data, worldWidth, worldHeight }
}

/**
 * Bilinear sample of a heightfield in grid coordinates.
 * @param field - Height grid
 * @param x - Column coordinate (may be fractional)
 * @param y - Row coordinate (may be fractional)
 * @returns Interpolated height
 */
export const sampleHeight = (field: Heightfield, x: number, y: number): number => {
	const maxX = field.cols - 1
	const maxY = field.rows - 1
	const cx = Math.min(maxX, Math.max(0, x))
	const cy = Math.min(maxY, Math.max(0, y))
	const x0 = Math.floor(cx)
	const y0 = Math.floor(cy)
	const x1 = Math.min(maxX, x0 + 1)
	const y1 = Math.min(maxY, y0 + 1)
	const tx = cx - x0
	const ty = cy - y0
	const h00 = field.data[y0 * field.cols + x0]
	const h10 = field.data[y0 * field.cols + x1]
	const h01 = field.data[y1 * field.cols + x0]
	const h11 = field.data[y1 * field.cols + x1]
	const a = h00 + (h10 - h00) * tx
	const b = h01 + (h11 - h01) * tx
	return a + (b - a) * ty
}
