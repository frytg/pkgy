/** Shared physical constants for the image halftone pipeline. */
export const HALFTONE_CONSTANTS = {
	/** Fixed virtual render height so dash density stays authored at any container size. */
	virtualRenderHeightPx: 768,
	/** Camera distance the dash density was authored at. */
	referencePreviewDistance: 4,
	minFootprintScale: 0.001,
} as const
