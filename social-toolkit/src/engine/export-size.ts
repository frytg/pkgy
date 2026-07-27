/** Long-edge scale preset for aspect-preserving export. */
export type ExportScaleOption = {
	label: string
	value: string
	/** Target length of the longer side; null keeps native source pixels. */
	longEdge: number | null
}

/** Shared scale presets for social-image exports. */
export const EXPORT_SCALE_OPTIONS: ExportScaleOption[] = [
	{ label: 'Source', value: 'source', longEdge: null },
	{ label: '1080', value: '1080', longEdge: 1080 },
	{ label: '1440', value: '1440', longEdge: 1440 },
	{ label: '2160', value: '2160', longEdge: 2160 },
	{ label: '3840', value: '3840', longEdge: 3840 },
]

const MAX_NATIVE_EDGE = 8192

/**
 * Looks up an export scale preset by value.
 * @param value - Preset id
 * @returns Matching option or the 1080 preset
 */
export const getExportScaleOption = (value: string): ExportScaleOption => {
	return EXPORT_SCALE_OPTIONS.find((option) => option.value === value) ?? EXPORT_SCALE_OPTIONS[1]
}

/**
 * Fits width/height to a source aspect ratio under a long-edge budget.
 * @param sourceWidth - Source aspect width
 * @param sourceHeight - Source aspect height
 * @param longEdge - Max length of the longer side, or null for native (capped)
 * @returns Integer pixel size preserving aspect ratio
 */
export const fitExportSize = (
	sourceWidth: number,
	sourceHeight: number,
	longEdge: number | null,
): { width: number; height: number } => {
	const sw = Math.max(sourceWidth, 1e-9)
	const sh = Math.max(sourceHeight, 1e-9)
	const sourceLong = Math.max(sw, sh)
	const targetLong = longEdge === null ? Math.min(sourceLong, MAX_NATIVE_EDGE) : longEdge
	const scale = targetLong / sourceLong
	return {
		width: Math.max(1, Math.round(sw * scale)),
		height: Math.max(1, Math.round(sh * scale)),
	}
}
