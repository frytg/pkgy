<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ControlsPanel from '../../components/ControlsPanel.vue'
import HalftoneViewport from '../../components/HalftoneViewport.vue'
import { fitExportSize, getExportScaleOption } from '../../engine/export-size.ts'
import { copyImageBlob, downloadBlob, downloadText, loadImage, loadImageFromFile } from '../../engine/image-io.ts'
import { DEFAULT_SETTINGS, type HalftoneSettings } from '../../engine/settings.ts'
import { generateImageHalftoneSvg } from '../../engine/svg-export.ts'
import { initialPanelOpen } from '../panel-state.ts'

const DEMO_URL = '/demo.svg'
const DEMO_NAME = 'signal-mark.svg'

const settings = ref<HalftoneSettings>({ ...DEFAULT_SETTINGS })
const image = ref<HTMLImageElement | null>(null)
const fileName = ref(DEMO_NAME)
const objectUrl = ref<string | null>(null)
const exportScale = ref('2160')
const exportBackground = ref(true)
const panelOpen = ref(initialPanelOpen())
const fileInputRef = ref<HTMLInputElement | null>(null)
const viewportRef = ref<InstanceType<typeof HalftoneViewport> | null>(null)
const dragOver = ref(false)

const exportSize = computed(() => {
	const source = image.value
	const scale = getExportScaleOption(exportScale.value)
	if (!source) {
		return fitExportSize(16, 9, scale.longEdge)
	}
	return fitExportSize(source.naturalWidth, source.naturalHeight, scale.longEdge)
})

const exportSizeLabel = computed(() => {
	const size = exportSize.value
	const source = image.value
	if (!source) {
		return `${size.width}×${size.height}`
	}
	return `${size.width}×${size.height} · source ${source.naturalWidth}×${source.naturalHeight}`
})

/**
 * Revokes the previous object URL if one exists.
 */
const revokeObjectUrl = (): void => {
	if (objectUrl.value) {
		URL.revokeObjectURL(objectUrl.value)
		objectUrl.value = null
	}
}

/**
 * Applies a loaded image as the current source.
 * @param nextImage - Loaded image element
 * @param nextName - Display name for the source
 * @param nextObjectUrl - Optional object URL to track for cleanup
 */
const applyImage = (nextImage: HTMLImageElement, nextName: string, nextObjectUrl: string | null = null): void => {
	revokeObjectUrl()
	image.value = nextImage
	fileName.value = nextName
	objectUrl.value = nextObjectUrl
}

/**
 * Loads the bundled demo SVG.
 */
const loadDemo = async (): Promise<void> => {
	const demo = await loadImage(DEMO_URL)
	applyImage(demo, DEMO_NAME)
}

/**
 * Opens the hidden file picker.
 */
const openFilePicker = (): void => {
	fileInputRef.value?.click()
}

/**
 * Handles a file chosen via picker, drop, or paste.
 * @param file - Image file
 */
const handleFile = async (file: File): Promise<void> => {
	if (!file.type.startsWith('image/')) {
		return
	}

	try {
		const loaded = await loadImageFromFile(file)
		applyImage(loaded.image, file.name, loaded.objectUrl)
	} catch {
		// Ignore load failures silently; user can retry.
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
 * Resets settings to defaults without clearing the image.
 */
const resetSettings = (): void => {
	settings.value = { ...DEFAULT_SETTINGS }
}

/**
 * Swaps dash and background colors.
 */
const swapColors = (): void => {
	const dashColor = settings.value.backgroundColor
	const backgroundColor = settings.value.dashColor
	settings.value = { ...settings.value, dashColor, backgroundColor }
}

/**
 * Downloads a PNG of the current effect.
 */
const downloadPng = async (): Promise<void> => {
	const size = exportSize.value
	const blob = await viewportRef.value?.capturePng(size.width, size.height, exportBackground.value)
	if (!blob) {
		return
	}
	downloadBlob(blob, `${stripExtension(fileName.value)}-halftone.png`)
}

/**
 * Copies a PNG of the current effect to the clipboard.
 */
const copyPng = async (): Promise<void> => {
	const size = exportSize.value
	const blob = await viewportRef.value?.capturePng(size.width, size.height, exportBackground.value)
	if (!blob) {
		return
	}
	await copyImageBlob(blob)
}

/**
 * Builds SVG markup for the current image and settings.
 * @returns SVG string or null
 */
const buildSvg = (): string | null => {
	if (!image.value) {
		return null
	}
	const size = exportSize.value
	return generateImageHalftoneSvg({
		image: image.value,
		includeBackground: exportBackground.value,
		settings: settings.value,
		width: size.width,
		height: size.height,
	})
}

/**
 * Downloads an SVG of the current effect.
 */
const downloadSvg = (): void => {
	const svg = buildSvg()
	if (!svg) {
		return
	}
	downloadText(svg, `${stripExtension(fileName.value)}-halftone.svg`)
}

/**
 * Copies SVG markup to the clipboard.
 */
const copySvg = async (): Promise<void> => {
	const svg = buildSvg()
	if (!svg) {
		return
	}
	await navigator.clipboard.writeText(svg)
}

/**
 * Strips the file extension from a name.
 * @param name - Filename
 * @returns Basename without extension
 */
const stripExtension = (name: string): string => name.replace(/\.[^.]+$/, '') || 'halftone'

/**
 * Handles clipboard paste of image files.
 * @param event - Clipboard event
 */
const onPaste = async (event: ClipboardEvent): Promise<void> => {
	const items = event.clipboardData?.items
	if (!items) {
		return
	}
	for (const item of items) {
		if (item.type.startsWith('image/')) {
			const file = item.getAsFile()
			if (file) {
				event.preventDefault()
				await handleFile(file)
			}
			return
		}
	}
}

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

onMounted(async () => {
	window.addEventListener('paste', onPaste)
	await loadDemo()
})

onUnmounted(() => {
	window.removeEventListener('paste', onPaste)
	revokeObjectUrl()
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
			<ControlsPanel
				v-model:settings="settings"
				v-model:export-scale="exportScale"
				v-model:export-background="exportBackground"
				:file-name="fileName"
				:export-size-label="exportSizeLabel"
				@upload="openFilePicker"
				@reset="resetSettings"
				@swap-colors="swapColors"
				@download-png="downloadPng"
				@download-svg="downloadSvg"
				@copy-png="copyPng"
				@copy-svg="copySvg"
			/>
		</aside>

		<section
			class="relative min-w-0 flex-1 overflow-hidden"
			:class="{ 'outline outline-1 outline-yellow outline-offset-[-1px]': dragOver }"
			@dragover="onDragOver"
			@dragleave="onDragLeave"
			@drop="onDrop"
		>
			<HalftoneViewport ref="viewportRef" :image="image" :settings="settings" />

			<button
				type="button"
				class="ui-fab absolute top-3 left-3 md:hidden"
				:style="{ marginLeft: 'var(--safe-left)' }"
				@click="panelOpen = !panelOpen"
			>
				{{ panelOpen ? 'Close' : 'Controls' }}
			</button>
		</section>

		<input
			ref="fileInputRef"
			type="file"
			class="hidden"
			accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
			@change="onFileInput"
		>
	</div>
</template>
