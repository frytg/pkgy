<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { copyImageBlob, downloadBlob, downloadText } from '../../engine/image-io.ts'
import { getExportScaleOption } from '../../engine/export-size.ts'
import { parseGpx, parseGpxFile, type GpxTrack } from './engine/parse-gpx.ts'
import {
	captureGpxOverlayPng,
	drawGpxOverlay,
	generateGpxOverlaySvg,
	resolveGpxExportSize,
} from './engine/render-overlay.ts'
import { DEFAULT_GPX_SETTINGS, type GpxOverlaySettings } from './engine/settings.ts'
import PanelToggle from '../../components/PanelToggle.vue'
import GpxControlsPanel from './components/GpxControlsPanel.vue'
import { initialPanelOpen } from '../panel-state.ts'

const DEMO_URL = '/demo-loop.gpx'
const DEMO_NAME = 'demo-loop.gpx'

const settings = ref<GpxOverlaySettings>({
	...DEFAULT_GPX_SETTINGS,
	layers: { ...DEFAULT_GPX_SETTINGS.layers },
})
const track = ref<GpxTrack | null>(null)
const fileName = ref(DEMO_NAME)
const exportScale = ref('2160')
const panelOpen = ref(initialPanelOpen())
const fileInputRef = ref<HTMLInputElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const dragOver = ref(false)
const errorMessage = ref<string | null>(null)

const exportSize = computed(() => {
	const scale = getExportScaleOption(exportScale.value)
	if (!track.value) {
		return { width: scale.longEdge ?? 2160, height: scale.longEdge ?? 2160 }
	}
	return resolveGpxExportSize(track.value, settings.value, scale.longEdge)
})

const exportSizeLabel = computed(() => {
	const size = exportSize.value
	return `${size.width}×${size.height} · route aspect`
})

const statsLine = computed(() => {
	if (!track.value) {
		return 'Drop a .gpx file'
	}
	const km = (track.value.distanceMeters / 1000).toFixed(2)
	const parts = [`${track.value.points.length} pts`, `${km} km`]
	if (track.value.hasElevation) {
		parts.push(`↑ ${Math.round(track.value.elevationGainMeters)} m`)
	}
	if (track.value.hasHeartRate && track.value.minHr !== null && track.value.maxHr !== null) {
		parts.push(`HR ${track.value.minHr}–${track.value.maxHr}`)
	}
	return parts.join(' · ')
})

/**
 * Paints the preview canvas to fit its container while keeping export aspect.
 */
const paintPreview = (): void => {
	const canvas = canvasRef.value
	const current = track.value
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
	drawGpxOverlay(ctx, current, settings.value, width, height)
}

/**
 * Applies a parsed track as the current source.
 * @param nextTrack - Parsed GPX track
 * @param nextName - Display filename
 */
const applyTrack = (nextTrack: GpxTrack, nextName: string): void => {
	track.value = nextTrack
	fileName.value = nextName
	errorMessage.value = null

	const layers = { ...settings.value.layers }
	if (!nextTrack.hasElevation) {
		layers.elevation = false
	}
	if (!nextTrack.hasHeartRate) {
		layers.heartRate = false
	}
	if (!layers.track && !layers.elevation && !layers.heartRate) {
		layers.track = true
	}
	settings.value = { ...settings.value, layers }
}

/**
 * Loads the bundled demo GPX.
 */
const loadDemo = async (): Promise<void> => {
	const response = await fetch(DEMO_URL)
	if (!response.ok) {
		throw new Error('Demo GPX missing')
	}
	const text = await response.text()
	applyTrack(parseGpx(text, 'demo-loop'), DEMO_NAME)
}

/**
 * Opens the hidden file picker.
 */
const openFilePicker = (): void => {
	fileInputRef.value?.click()
}

/**
 * Handles a GPX file from picker, drop, or paste.
 * @param file - Selected file
 */
const handleFile = async (file: File): Promise<void> => {
	const isGpx = file.name.toLowerCase().endsWith('.gpx') || file.type.includes('xml') || file.type === ''
	if (!isGpx) {
		errorMessage.value = 'Choose a .gpx file'
		return
	}

	try {
		const parsed = await parseGpxFile(file)
		applyTrack(parsed, file.name)
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'Failed to parse GPX'
	}
}

/**
 * Handles change events from the file input.
 * @param event - Change event
 */
const onFileInput = async (event: Event): Promise<void> => {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (file) {
		await handleFile(file)
	}
	input.value = ''
}

/**
 * Resets visual settings without clearing the track.
 */
const resetSettings = (): void => {
	settings.value = {
		...DEFAULT_GPX_SETTINGS,
		layers: { ...DEFAULT_GPX_SETTINGS.layers },
	}
}

/**
 * Downloads a transparent PNG of the overlay.
 */
const downloadPng = async (): Promise<void> => {
	if (!track.value) {
		return
	}
	const size = exportSize.value
	const blob = await captureGpxOverlayPng(track.value, settings.value, size.width, size.height)
	downloadBlob(blob, `${stripExtension(fileName.value)}-overlay.png`)
}

/**
 * Copies a transparent PNG of the overlay to the clipboard.
 */
const copyPng = async (): Promise<void> => {
	if (!track.value) {
		return
	}
	const size = exportSize.value
	const blob = await captureGpxOverlayPng(track.value, settings.value, size.width, size.height)
	await copyImageBlob(blob)
}

/**
 * Downloads an SVG of the overlay.
 */
const downloadSvg = (): void => {
	if (!track.value) {
		return
	}
	const size = exportSize.value
	const svg = generateGpxOverlaySvg(track.value, settings.value, size.width, size.height)
	downloadText(svg, `${stripExtension(fileName.value)}-overlay.svg`)
}

/**
 * Copies SVG markup to the clipboard.
 */
const copySvg = async (): Promise<void> => {
	if (!track.value) {
		return
	}
	const size = exportSize.value
	const svg = generateGpxOverlaySvg(track.value, settings.value, size.width, size.height)
	await navigator.clipboard.writeText(svg)
}

/**
 * Strips the file extension from a name.
 * @param name - Filename
 * @returns Basename without extension
 */
const stripExtension = (name: string): string => name.replace(/\.[^.]+$/, '') || 'gpx'

/**
 * Handles drag-over for the drop zone.
 * @param event - Drag event
 */
const onDragOver = (event: DragEvent): void => {
	event.preventDefault()
	dragOver.value = true
}

/**
 * Clears drag-over highlight.
 */
const onDragLeave = (): void => {
	dragOver.value = false
}

/**
 * Handles file drop onto the viewport.
 * @param event - Drop event
 */
const onDrop = async (event: DragEvent): Promise<void> => {
	event.preventDefault()
	dragOver.value = false
	const file = event.dataTransfer?.files?.[0]
	if (file) {
		await handleFile(file)
	}
}

let resizeObserver: ResizeObserver | null = null

watch(
	[track, settings, exportScale],
	() => {
		requestAnimationFrame(paintPreview)
	},
	{ deep: true },
)

onMounted(async () => {
	await loadDemo()
	requestAnimationFrame(paintPreview)
	if (canvasRef.value?.parentElement) {
		resizeObserver = new ResizeObserver(() => paintPreview())
		resizeObserver.observe(canvasRef.value.parentElement)
	}
})

onUnmounted(() => {
	resizeObserver?.disconnect()
})
</script>

<template>
	<div class="relative flex h-full bg-mid-dark-greeny">
		<aside class="ui-panel-shell" :class="{ 'is-collapsed': !panelOpen }">
			<div class="ui-panel-toggle-row">
				<PanelToggle
					:open="panelOpen"
					open-label="Open controls"
					close-label="Close controls"
					@toggle="panelOpen = !panelOpen"
				/>
			</div>
			<div class="ui-panel-body">
				<GpxControlsPanel
					v-model:settings="settings"
					v-model:export-scale="exportScale"
					:file-name="fileName"
					:stats-line="statsLine"
					:export-size-label="exportSizeLabel"
					:track="track"
					@upload="openFilePicker"
					@reset="resetSettings"
					@download-png="downloadPng"
					@download-svg="downloadSvg"
					@copy-png="copyPng"
					@copy-svg="copySvg"
				/>
			</div>
		</aside>

		<section
			class="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden"
			:class="{ 'outline outline-1 outline-offset-[-1px] outline-yellow': dragOver }"
			@dragover="onDragOver"
			@dragleave="onDragLeave"
			@drop="onDrop"
		>
			<!-- Checkerboard hints transparency -->
			<div
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

			<p
				v-if="errorMessage"
				class="absolute bottom-4 left-3 z-[2] max-w-[calc(100%-1.5rem)] border border-[var(--line)] bg-dark-greeny/90 px-3 py-2 text-[12px] text-orange"
				:style="{ marginLeft: 'var(--safe-left)', marginBottom: 'var(--safe-bottom)' }"
			>
				{{ errorMessage }}
			</p>
		</section>

		<input
			ref="fileInputRef"
			type="file"
			class="hidden"
			accept=".gpx,application/gpx+xml,text/xml"
			@change="onFileInput"
		/>
	</div>
</template>
