import * as THREE from 'three'

import { HALFTONE_CONSTANTS } from './constants.ts'
import { getImageFootprintScale, getImagePreviewZoom } from './footprint.ts'
import { type HalftoneSettings, RASTER_SHAPE_IDS } from './settings.ts'
import { FULLSCREEN_VERTEX_SHADER, HALFTONE_PASS_FRAGMENT_SHADER, IMAGE_PASS_FRAGMENT_SHADER } from './shaders.ts'

export type ImageSession = {
	dispose: () => void
	render: () => void
	setImage: (image: HTMLImageElement) => void
	updateSettings: (settings: HalftoneSettings) => void
	capturePngBlob: (width: number, height: number, includeBackground: boolean) => Promise<Blob | null>
	getCanvas: () => HTMLCanvasElement
}

type CreateImageSessionOptions = {
	container: HTMLElement
	image: HTMLImageElement
	settings: HalftoneSettings
}

/**
 * Parses a CSS hex color into a Three.js Color.
 * @param hex - Hex string like #FFFF11
 * @returns Three color instance
 */
const parseColor = (hex: string): THREE.Color => {
	try {
		return new THREE.Color(hex)
	} catch {
		return new THREE.Color('#FFFF11')
	}
}

/**
 * Creates a two-pass WebGL session: framed image field → raster ink motifs.
 * @param options - Container, source image, and initial settings
 * @returns Session API or null when WebGL is unavailable
 */
export const createImageSession = ({
	container,
	image,
	settings: initialSettings,
}: CreateImageSessionOptions): ImageSession | null => {
	let settings = { ...initialSettings }
	let currentImage = image

	const renderer = new THREE.WebGLRenderer({
		antialias: false,
		alpha: true,
		preserveDrawingBuffer: true,
	})

	if (!renderer.getContext()) {
		renderer.dispose()
		return null
	}

	renderer.outputColorSpace = THREE.SRGBColorSpace
	renderer.setPixelRatio(1)
	renderer.setClearColor(0x000000, 0)

	const canvas = renderer.domElement
	canvas.style.display = 'block'
	canvas.style.width = '100%'
	canvas.style.height = '100%'
	container.appendChild(canvas)

	const fullScreenGeometry = new THREE.PlaneGeometry(2, 2)
	const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

	let imageTexture = new THREE.Texture(currentImage)
	imageTexture.wrapS = THREE.ClampToEdgeWrapping
	imageTexture.wrapT = THREE.ClampToEdgeWrapping
	imageTexture.generateMipmaps = false
	imageTexture.minFilter = THREE.LinearFilter
	imageTexture.magFilter = THREE.LinearFilter
	imageTexture.colorSpace = THREE.SRGBColorSpace
	imageTexture.needsUpdate = true

	const fieldTarget = new THREE.WebGLRenderTarget(1, 1, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat,
		type: THREE.UnsignedByteType,
	})
	fieldTarget.texture.colorSpace = THREE.SRGBColorSpace

	const imageMaterial = new THREE.ShaderMaterial({
		uniforms: {
			uSource: { value: imageTexture },
			uImageSize: {
				value: new THREE.Vector2(currentImage.naturalWidth, currentImage.naturalHeight),
			},
			uViewSize: { value: new THREE.Vector2(1, 1) },
			uZoom: { value: getImagePreviewZoom(settings.previewDistance) },
			uContrast: { value: settings.imageContrast },
			uFitMode: { value: settings.imageFit === 'cover' ? 1 : 0 },
		},
		vertexShader: FULLSCREEN_VERTEX_SHADER,
		fragmentShader: IMAGE_PASS_FRAGMENT_SHADER,
	})

	const rasterMaterial = new THREE.ShaderMaterial({
		transparent: true,
		uniforms: {
			uField: { value: fieldTarget.texture },
			uPixelSize: { value: new THREE.Vector2(1, 1) },
			uLogicalSize: { value: new THREE.Vector2(1, 1) },
			uCellPx: { value: settings.scale },
			uBias: { value: settings.power },
			uStroke: { value: settings.width },
			uNoise: { value: settings.randomness },
			uInvert: { value: settings.toneTarget === 'dark' ? 1 : 0 },
			uFloor: { value: settings.minimumTone },
			uActive: { value: 1 },
			uShape: { value: RASTER_SHAPE_IDS[settings.shape] },
			uInk: { value: parseColor(settings.dashColor) },
			uDensityScale: { value: 1 },
			uClipEmpty: { value: 1 },
		},
		vertexShader: FULLSCREEN_VERTEX_SHADER,
		fragmentShader: HALFTONE_PASS_FRAGMENT_SHADER,
	})

	const imageScene = new THREE.Scene()
	imageScene.add(new THREE.Mesh(fullScreenGeometry, imageMaterial))
	const rasterScene = new THREE.Scene()
	rasterScene.add(new THREE.Mesh(fullScreenGeometry, rasterMaterial))

	/**
	 * Resolves virtual render size from the container CSS size.
	 * @returns Width and height in virtual pixels
	 */
	const getVirtualSize = (): { width: number; height: number } => {
		const rect = container.getBoundingClientRect()
		const cssWidth = Math.max(rect.width, 1)
		const cssHeight = Math.max(rect.height, 1)
		const height = HALFTONE_CONSTANTS.virtualRenderHeightPx
		const width = Math.max(Math.round(height * (cssWidth / cssHeight)), 1)
		return { width, height }
	}

	/**
	 * Syncs render targets and uniforms to the current container size.
	 */
	const syncSize = (): void => {
		const { width, height } = getVirtualSize()
		renderer.setSize(width, height, false)
		fieldTarget.setSize(width, height)
		imageMaterial.uniforms.uViewSize.value.set(width, height)
		rasterMaterial.uniforms.uPixelSize.value.set(width, height)
		rasterMaterial.uniforms.uLogicalSize.value.set(width, height)
		rasterMaterial.uniforms.uDensityScale.value = getImageFootprintScale({
			imageHeight: currentImage.naturalHeight,
			imageWidth: currentImage.naturalWidth,
			previewDistance: settings.previewDistance,
			viewportHeight: height,
			viewportWidth: width,
		})
	}

	/**
	 * Pushes settings into shader uniforms without resizing.
	 */
	const syncSettingsUniforms = (): void => {
		imageMaterial.uniforms.uZoom.value = getImagePreviewZoom(settings.previewDistance)
		imageMaterial.uniforms.uContrast.value = settings.imageContrast
		imageMaterial.uniforms.uFitMode.value = settings.imageFit === 'cover' ? 1 : 0
		rasterMaterial.uniforms.uCellPx.value = settings.scale
		rasterMaterial.uniforms.uBias.value = settings.power
		rasterMaterial.uniforms.uStroke.value = settings.width
		rasterMaterial.uniforms.uNoise.value = settings.randomness
		rasterMaterial.uniforms.uInvert.value = settings.toneTarget === 'dark' ? 1 : 0
		rasterMaterial.uniforms.uFloor.value = settings.minimumTone
		rasterMaterial.uniforms.uShape.value = RASTER_SHAPE_IDS[settings.shape]
		rasterMaterial.uniforms.uInk.value = parseColor(settings.dashColor)

		const { width, height } = getVirtualSize()
		rasterMaterial.uniforms.uDensityScale.value = getImageFootprintScale({
			imageHeight: currentImage.naturalHeight,
			imageWidth: currentImage.naturalWidth,
			previewDistance: settings.previewDistance,
			viewportHeight: height,
			viewportWidth: width,
		})
	}

	/**
	 * Renders the image field, then the raster composite.
	 */
	const render = (): void => {
		renderer.setRenderTarget(fieldTarget)
		renderer.render(imageScene, orthographicCamera)
		renderer.setRenderTarget(null)
		renderer.clear()
		renderer.render(rasterScene, orthographicCamera)
	}

	syncSize()
	render()

	const sizeObserver =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(() => {
					syncSize()
					render()
				})
	sizeObserver?.observe(container)

	return {
		getCanvas: () => canvas,
		render,
		/**
		 * Replaces the source image texture.
		 * @param nextImage - Loaded HTML image element
		 */
		setImage: (nextImage: HTMLImageElement): void => {
			currentImage = nextImage
			imageTexture.dispose()
			imageTexture = new THREE.Texture(nextImage)
			imageTexture.wrapS = THREE.ClampToEdgeWrapping
			imageTexture.wrapT = THREE.ClampToEdgeWrapping
			imageTexture.generateMipmaps = false
			imageTexture.minFilter = THREE.LinearFilter
			imageTexture.magFilter = THREE.LinearFilter
			imageTexture.colorSpace = THREE.SRGBColorSpace
			imageTexture.needsUpdate = true
			imageMaterial.uniforms.uSource.value = imageTexture
			imageMaterial.uniforms.uImageSize.value.set(nextImage.naturalWidth, nextImage.naturalHeight)
			syncSize()
			render()
		},
		/**
		 * Applies new settings and re-renders.
		 * @param next - Full settings object
		 */
		updateSettings: (next: HalftoneSettings): void => {
			settings = { ...next }
			syncSettingsUniforms()
			render()
		},
		/**
		 * Renders at an export resolution and returns a PNG blob.
		 * @param width - Export width in pixels
		 * @param height - Export height in pixels
		 * @param includeBackground - Whether to composite the background color
		 * @returns PNG blob or null on failure
		 */
		capturePngBlob: async (width: number, height: number, includeBackground: boolean): Promise<Blob | null> => {
			const previousSize = getVirtualSize()
			renderer.setSize(width, height, false)
			fieldTarget.setSize(width, height)
			imageMaterial.uniforms.uViewSize.value.set(width, height)
			rasterMaterial.uniforms.uPixelSize.value.set(width, height)
			rasterMaterial.uniforms.uLogicalSize.value.set(width, height)
			rasterMaterial.uniforms.uDensityScale.value = getImageFootprintScale({
				imageHeight: currentImage.naturalHeight,
				imageWidth: currentImage.naturalWidth,
				previewDistance: settings.previewDistance,
				viewportHeight: height,
				viewportWidth: width,
			})
			render()

			const exportCanvas = document.createElement('canvas')
			exportCanvas.width = width
			exportCanvas.height = height
			const ctx = exportCanvas.getContext('2d')
			if (!ctx) {
				syncSize()
				render()
				return null
			}

			if (includeBackground) {
				ctx.fillStyle = settings.backgroundColor
				ctx.fillRect(0, 0, width, height)
			}
			ctx.drawImage(canvas, 0, 0, width, height)

			const blob = await new Promise<Blob | null>((resolve) => {
				exportCanvas.toBlob((result) => resolve(result), 'image/png')
			})

			renderer.setSize(previousSize.width, previousSize.height, false)
			fieldTarget.setSize(previousSize.width, previousSize.height)
			imageMaterial.uniforms.uViewSize.value.set(previousSize.width, previousSize.height)
			rasterMaterial.uniforms.uPixelSize.value.set(previousSize.width, previousSize.height)
			rasterMaterial.uniforms.uLogicalSize.value.set(previousSize.width, previousSize.height)
			syncSettingsUniforms()
			render()

			return blob
		},
		dispose: (): void => {
			sizeObserver?.disconnect()
			imageMaterial.dispose()
			rasterMaterial.dispose()
			fullScreenGeometry.dispose()
			imageTexture.dispose()
			fieldTarget.dispose()
			renderer.dispose()
			if (canvas.parentNode === container) {
				container.removeChild(canvas)
			}
		},
	}
}
