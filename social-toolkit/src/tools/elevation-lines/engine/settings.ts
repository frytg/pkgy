/** Visual + generative settings for abstract elevation contours. */
export type ElevationLinesSettings = {
	/** Seed for deterministic terrain. */
	seed: number
	/** Contour interval count across the height range. */
	levels: number
	/** Every Nth contour is an index (thicker) line. */
	indexEvery: number
	/** Domain warp amount for ridgelines / organic drift. */
	warp: number
	/** Base spatial frequency of the heightfield. */
	frequency: number
	/** Fractal octaves for terrain detail. */
	octaves: number
	/** Peakiness — higher favors ridges and bowls. */
	ridged: number
	/** Stroke weight for ordinary contours. */
	strokeWidth: number
	/** Multiplier applied to index contours. */
	indexStrokeScale: number
	/** Line color. */
	strokeColor: string
	/** Optional solid background; transparent when includeBackground is false. */
	backgroundColor: string
	/** Whether exports/preview fill the background. */
	includeBackground: boolean
	/** Canvas padding as a fraction of the short edge (0–0.25). */
	padding: number
	/** Aspect width relative to height (e.g. 1 = square, 4/5 portrait). */
	aspectWidth: number
	/** Aspect height relative to width. */
	aspectHeight: number
	/** Sampling resolution along the long axis (cells). */
	resolution: number
}

export const DEFAULT_ELEVATION_SETTINGS: ElevationLinesSettings = {
	seed: 4,
	levels: 16,
	indexEvery: 5,
	warp: 0.35,
	frequency: 1.35,
	octaves: 5,
	ridged: 0.4,
	strokeWidth: 1.35,
	indexStrokeScale: 2.1,
	strokeColor: '#E8FF2A',
	backgroundColor: '#171D15',
	includeBackground: true,
	padding: 0.06,
	aspectWidth: 1,
	aspectHeight: 1,
	resolution: 180,
}
