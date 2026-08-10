<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { copyImageBlob, downloadBlob, downloadText } from '../../engine/image-io.ts'
import { getExportScaleOption } from '../../engine/export-size.ts'
import {
	captureElevationPng,
	drawElevationMap,
	generateElevationMap,
	generateElevationSvg,
	resolveElevationExportSize,
	type ElevationMap,
} from './engine/render.ts'
import { DEFAULT_ELEVATION_SETTINGS, type ElevationLinesSettings } from './engine/settings.ts'
import ElevationControlsPanel from './components/ElevationControlsPanel.vue'
import { initialPanelOpen } from '../panel-state.ts'

const settings = ref<ElevationLinesSettings>({ ...DEFAULT_ELEVATION_SETTINGS })
const map = ref<ElevationMap | null>(null)
const exportScale = ref('2160')
const panelOpen = ref(initialPanelOpen())
const canvasRef = ref<HTMLCanvasElement | null>(null)

const exportSize = computed(() => {
	const scale = getExportScaleOption(exportScale.value)
	return resolveElevationExportSize(settings.value, scale.longEdge)
})

const exportSizeLabel = computed(() => {
	const size = exportSize.value
	return `${size.width}×${size.height}`
})

const statsLine = computed(() => {
	if (!map.value) {
		return 'Generating contours…'
	}
	const closed = map.value.contours.filter((line) => line.closed).length
	const open = map.value.contours.length - closed
	const holes = map.value.contours.filter((line) => line.isHole).length
	return `${map.value.contours.length} lines · ${closed} closed · ${holes} holes · ${open} open`
})

/**
 * Rebuilds the heightfield and contours from settings.
 */
const regenerate = (): void => {
	map.value = generateElevationMap(settings.value)
}

/**
 * Paints the preview canvas to fit its container while keeping export aspect.
 */
const paintPreview = (): void => {
	const canvas = canvasRef.value
	const current = map.value
	if (!canvas || !current) {
		return
	}

	const parent = canvas.parentElement
	if (!parent) {
		return
	}

	const resolution = exportSize.value
	const maxWidth = parent.clientWidth - 48
	const maxHeight = parent.clientHeight - 48
	const scale = Math.min(maxWidth / resolution.width, maxHeight / resolution.height, 1)
	const width = Math.max(1, Math.round(resolution.width * scale))
	const height = Math.max(1, Math.round(resolution.height * scale))

	const dpr = Math.min(window.devicePixelRatio || 1, 2)
	canvas.width = Math.round(width * dpr)
	canvas.height = Math.round(height * dpr)
	canvas.style.width = `${width}px`
	canvas.style.height = `${height}px`

	const ctx = canvas.getContext('2d')
	if (!ctx) {
		return
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	drawElevationMap(ctx, current, settings.value, width, height)
}

/**
 * Picks a new random seed and regenerates.
 */
const randomize = (): void => {
	settings.value = {
		...settings.value,
		seed: Math.floor(Math.random() * 100_000),
	}
}

/**
 * Resets settings to defaults.
 */
const resetSettings = (): void => {
	settings.value = { ...DEFAULT_ELEVATION_SETTINGS }
}

/**
 * Swaps stroke and background colors.
 */
const swapColors = (): void => {
	const strokeColor = settings.value.backgroundColor
	const backgroundColor = settings.value.strokeColor
	settings.value = { ...settings.value, strokeColor, backgroundColor }
}

/**
 * Downloads a PNG of the current map.
 */
const downloadPng = async (): Promise<void> => {
	if (!map.value) {
		return
	}
	const size = exportSize.value
	const blob = await captureElevationPng(map.value, settings.value, size.width, size.height)
	downloadBlob(blob, `elevation-lines-${settings.value.seed}.png`)
}

/**
 * Copies a PNG of the current map to the clipboard.
 */
const copyPng = async (): Promise<void> => {
	if (!map.value) {
		return
	}
	const size = exportSize.value
	const blob = await captureElevationPng(map.value, settings.value, size.width, size.height)
	await copyImageBlob(blob)
}

/**
 * Downloads an SVG of the current map.
 */
const downloadSvg = (): void => {
	if (!map.value) {
		return
	}
	const size = exportSize.value
	const svg = generateElevationSvg(map.value, settings.value, size.width, size.height)
	downloadText(svg, `elevation-lines-${settings.value.seed}.svg`)
}

/**
 * Copies SVG markup to the clipboard.
 */
const copySvg = async (): Promise<void> => {
	if (!map.value) {
		return
	}
	const size = exportSize.value
	const svg = generateElevationSvg(map.value, settings.value, size.width, size.height)
	await navigator.clipboard.writeText(svg)
}

let resizeObserver: ResizeObserver | null = null
let regenTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Debounced regenerate so sliders stay responsive.
 */
const scheduleRegenerate = (): void => {
	if (regenTimer !== null) {
		clearTimeout(regenTimer)
	}
	regenTimer = setTimeout(() => {
		regenTimer = null
		regenerate()
		requestAnimationFrame(paintPreview)
	}, 40)
}

// Geometry-affecting knobs rebuild the map; pure style knobs only repaint.
watch(
	() => ({
		seed: settings.value.seed,
		levels: settings.value.levels,
		indexEvery: settings.value.indexEvery,
		warp: settings.value.warp,
		frequency: settings.value.frequency,
		octaves: settings.value.octaves,
		ridged: settings.value.ridged,
		resolution: settings.value.resolution,
		aspectWidth: settings.value.aspectWidth,
		aspectHeight: settings.value.aspectHeight,
	}),
	() => {
		scheduleRegenerate()
	},
)

watch(
	() => ({
		strokeWidth: settings.value.strokeWidth,
		indexStrokeScale: settings.value.indexStrokeScale,
		strokeColor: settings.value.strokeColor,
		backgroundColor: settings.value.backgroundColor,
		includeBackground: settings.value.includeBackground,
		padding: settings.value.padding,
		exportScale: exportScale.value,
	}),
	() => {
		requestAnimationFrame(paintPreview)
	},
)

watch(map, () => {
	requestAnimationFrame(paintPreview)
})

onMounted(() => {
	regenerate()
	requestAnimationFrame(paintPreview)
	if (canvasRef.value?.parentElement) {
		resizeObserver = new ResizeObserver(() => paintPreview())
		resizeObserver.observe(canvasRef.value.parentElement)
	}
})

onUnmounted(() => {
	resizeObserver?.disconnect()
	if (regenTimer !== null) {
		clearTimeout(regenTimer)
	}
})
</script>

<template>
	<div class="relative flex h-full bg-mid-dark-greeny">
		<button
			v-if="panelOpen"
			type="button"
			class="ui-panel-backdrop md:hidden"
			aria-label="Close controls"
			@click="panelOpen = false"
		/>

		<aside
			v-show="panelOpen"
			class="ui-panel-shell absolute inset-y-0 left-0 max-w-full pl-[var(--safe-left)] md:static md:max-w-none md:shrink-0"
		>
			<ElevationControlsPanel
				v-model:settings="settings"
				v-model:export-scale="exportScale"
				:stats-line="statsLine"
				:export-size-label="exportSizeLabel"
				@randomize="randomize"
				@reset="resetSettings"
				@swap-colors="swapColors"
				@download-png="downloadPng"
				@download-svg="downloadSvg"
				@copy-png="copyPng"
				@copy-svg="copySvg"
			/>
		</aside>

		<section class="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden">
			<div
				v-if="!settings.includeBackground"
				class="pointer-events-none absolute inset-0 opacity-[0.35]"
				style="
					background-image:
						linear-gradient(45deg, #1f261c 25%, transparent 25%),
						linear-gradient(-45deg, #1f261c 25%, transparent 25%),
						linear-gradient(45deg, transparent 75%, #1f261c 75%),
						linear-gradient(-45deg, transparent 75%, #1f261c 75%);
					background-size: 24px 24px;
					background-position:
						0 0,
						0 12px,
						12px -12px,
						-12px 0;
					background-color: #293126;
				"
			/>

			<canvas ref="canvasRef" class="relative z-[1] max-h-full max-w-full" />

			<button
				type="button"
				class="ui-fab absolute top-3 left-3 md:hidden"
				:style="{ marginLeft: 'var(--safe-left)' }"
				@click="panelOpen = !panelOpen"
			>
				{{ panelOpen ? 'Close' : 'Controls' }}
			</button>
		</section>
	</div>
</template>
