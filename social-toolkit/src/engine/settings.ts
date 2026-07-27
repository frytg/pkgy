export type ToneTarget = 'light' | 'dark'
export type ImageFit = 'contain' | 'cover'

/** Raster cell motif drawn by the halftone pass. */
export type RasterShape = 'bar' | 'circle' | 'square' | 'vertical' | 'cross' | 'diamond'

export type HalftoneSettings = {
	scale: number
	power: number
	width: number
	randomness: number
	toneTarget: ToneTarget
	imageContrast: number
	dashColor: string
	backgroundColor: string
	previewDistance: number
	imageFit: ImageFit
	minimumTone: number
	shape: RasterShape
}

/** Shape picker options for the controls panel. */
export const RASTER_SHAPE_OPTIONS: Array<{ label: string; value: RasterShape }> = [
	{ label: 'Bar', value: 'bar' },
	{ label: 'Circle', value: 'circle' },
	{ label: 'Square', value: 'square' },
	{ label: 'Vertical', value: 'vertical' },
	{ label: 'Cross', value: 'cross' },
	{ label: 'Diamond', value: 'diamond' },
]

/** Maps a raster shape id to the shader uniform enum. */
export const RASTER_SHAPE_IDS: Record<RasterShape, number> = {
	bar: 0,
	circle: 1,
	square: 2,
	vertical: 3,
	cross: 4,
	diamond: 5,
}

export const DEFAULT_SETTINGS: HalftoneSettings = {
	scale: 22,
	power: -0.12,
	width: 0.52,
	randomness: 0,
	toneTarget: 'light',
	imageContrast: 1.1,
	dashColor: '#E8FF2A',
	backgroundColor: '#171D15',
	previewDistance: 5.5,
	imageFit: 'contain',
	minimumTone: 0,
	shape: 'bar',
}
