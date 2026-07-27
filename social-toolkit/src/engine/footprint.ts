import { HALFTONE_CONSTANTS } from './constants.ts'

export type HalftoneRect = {
	height: number
	width: number
	x: number
	y: number
}

export type HalftoneImageFit = 'contain' | 'cover'

/**
 * Computes zoom from preview distance relative to the authored reference.
 * @param previewDistance - Studio distance control value
 * @returns Zoom factor applied to the fitted image
 */
export const getImagePreviewZoom = (previewDistance: number): number =>
	HALFTONE_CONSTANTS.referencePreviewDistance / Math.max(previewDistance, 0.001)

/**
 * Fits an image rect into a viewport with contain/cover and zoom.
 * @param args - Image, viewport, fit, and zoom inputs
 * @returns Fitted rect or null when inputs are invalid
 */
export const getContainedImageRect = ({
	imageFit = 'contain',
	imageHeight,
	imageWidth,
	viewportHeight,
	viewportWidth,
	zoom,
}: {
	imageFit?: HalftoneImageFit
	imageHeight: number
	imageWidth: number
	viewportHeight: number
	viewportWidth: number
	zoom: number
}): HalftoneRect | null => {
	if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
		return null
	}

	const imageAspect = imageWidth / imageHeight
	const viewAspect = viewportWidth / viewportHeight

	let fittedWidth = viewportWidth
	let fittedHeight = viewportHeight

	if (imageAspect > viewAspect) {
		if (imageFit === 'cover') {
			fittedWidth = viewportHeight * imageAspect
		} else {
			fittedHeight = viewportWidth / imageAspect
		}
	} else if (imageFit === 'cover') {
		fittedHeight = viewportWidth / imageAspect
	} else {
		fittedWidth = viewportHeight * imageAspect
	}

	const width = fittedWidth * zoom
	const height = fittedHeight * zoom
	const x = (viewportWidth - width) * 0.5
	const y = (viewportHeight - height) * 0.5

	const minX = Math.max(x, 0)
	const minY = Math.max(y, 0)
	const maxX = Math.min(x + width, viewportWidth)
	const maxY = Math.min(y + height, viewportHeight)

	if (maxX <= minX || maxY <= minY) {
		return null
	}

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	}
}

/**
 * Scales dash density so motif count matches the authored virtual canvas.
 * Combines preview-distance zoom with resolution scaling (export vs 768px preview).
 * @param args - Image, viewport, and preview distance
 * @returns Footprint scale applied to tile size
 */
export const getImageFootprintScale = ({
	imageHeight,
	imageWidth,
	previewDistance,
	viewportHeight,
	viewportWidth,
}: {
	imageHeight: number
	imageWidth: number
	previewDistance: number
	viewportHeight: number
	viewportWidth: number
}): number => {
	const currentRect = getContainedImageRect({
		imageFit: 'contain',
		imageHeight,
		imageWidth,
		viewportHeight,
		viewportWidth,
		zoom: getImagePreviewZoom(previewDistance),
	})
	const referenceRect = getContainedImageRect({
		imageFit: 'contain',
		imageHeight,
		imageWidth,
		viewportHeight,
		viewportWidth,
		zoom: 1,
	})

	const currentArea = currentRect ? currentRect.width * currentRect.height : 0
	const referenceArea = referenceRect ? referenceRect.width * referenceRect.height : 0

	const zoomScale =
		currentArea > 0 && referenceArea > 0 ? Math.sqrt(currentArea / referenceArea) : 1

	// Preview always renders at virtualRenderHeightPx; export must grow cell px with height
	// so the same Density slider yields the same motif count, not finer detail.
	const resolutionScale = viewportHeight / HALFTONE_CONSTANTS.virtualRenderHeightPx

	return Math.max(zoomScale * resolutionScale, HALFTONE_CONSTANTS.minFootprintScale)
}

/**
 * Maps a CSS pixel height to the fixed virtual render height.
 * @param cssHeight - Container height in CSS pixels
 * @returns Virtual height used for dash density
 */
export const getVirtualHeight = (cssHeight: number): number => Math.max(Math.round(cssHeight), 1)

/**
 * Maps a CSS pixel width to virtual width while locking density to virtual height.
 * @param cssWidth - Container width in CSS pixels
 * @param cssHeight - Container height in CSS pixels
 * @returns Virtual width matching the authored aspect
 */
export const getVirtualWidth = (cssWidth: number, cssHeight: number): number => {
	const virtualHeight = HALFTONE_CONSTANTS.virtualRenderHeightPx
	const aspect = cssWidth / Math.max(cssHeight, 1)
	return Math.max(Math.round(virtualHeight * aspect), 1)
}
