<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { createImageSession, type ImageSession } from '../engine/create-image-session.ts'
import type { HalftoneSettings } from '../engine/settings.ts'

const props = defineProps<{
	image: HTMLImageElement | null
	settings: HalftoneSettings
}>()

const containerRef = ref<HTMLElement | null>(null)
let session: ImageSession | null = null

/**
 * Creates or tears down the WebGL session when the container mounts.
 */
const mountSession = (): void => {
	session?.dispose()
	session = null

	if (!containerRef.value || !props.image) {
		return
	}

	session = createImageSession({
		container: containerRef.value,
		image: props.image,
		settings: props.settings,
	})
}

onMounted(() => {
	mountSession()
})

watch(
	() => props.image,
	(image) => {
		if (!image) {
			session?.dispose()
			session = null
			return
		}
		if (session) {
			session.setImage(image)
			return
		}
		mountSession()
	}
)

watch(
	() => props.settings,
	(settings) => {
		session?.updateSettings(settings)
	},
	{ deep: true }
)

onBeforeUnmount(() => {
	session?.dispose()
	session = null
})

/**
 * Captures the current effect as a PNG blob at the given resolution.
 * @param width - Export width
 * @param height - Export height
 * @param includeBackground - Composite background color behind dashes
 * @returns PNG blob or null
 */
const capturePng = (width: number, height: number, includeBackground: boolean): Promise<Blob | null> => {
	if (!session) {
		return Promise.resolve(null)
	}
	return session.capturePngBlob(width, height, includeBackground)
}

defineExpose({ capturePng })
</script>

<template>
	<div
		ref="containerRef"
		class="relative h-full w-full overflow-hidden"
		:style="{ background: settings.backgroundColor }"
	/>
</template>
