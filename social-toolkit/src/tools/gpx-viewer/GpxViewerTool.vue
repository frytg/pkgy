<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import PanelToggle from '../../components/PanelToggle.vue'
import { parseGpx, type GpxTrack } from '../gpx-overlay/engine/parse-gpx.ts'
import { analyzeActivity, type AnalyzedActivity } from './engine/analyze.ts'
import { initialPanelOpen } from '../panel-state.ts'
import MapControls from './components/MapControls.vue'
import MapView, { type TrackMetric } from './components/MapView.vue'
import ProfileChart, { type ChartField } from './components/ProfileChart.vue'
import StatsSidebar from './components/StatsSidebar.vue'

const DEMO_URL = '/demo-hike.gpx'
const DEMO_FALLBACK_URL = '/demo-loop.gpx'
const DEMO_NAME = 'demo-hike.gpx'

const activity = ref<AnalyzedActivity | null>(null)
const fileName = ref(DEMO_NAME)
const metric = ref<TrackMetric>('elevation')
const activeIndex = ref<number | null>(null)
const sidebarOpen = ref(initialPanelOpen())
const dragOver = ref(false)
const errorMessage = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const mapRef = ref<InstanceType<typeof MapView> | null>(null)

const hasHeartRate = computed(() => activity.value?.hasHeartRate ?? false)
const hasSpeed = computed(() => (activity.value ? activity.value.avgSpeedMs !== null : false))

/** Charts to show along the bottom, in priority order. */
const visibleCharts = computed<ChartField[]>(() => {
	const current = activity.value
	if (!current) {
		return []
	}
	const charts: ChartField[] = []
	if (current.hasElevation) {
		charts.push('ele')
	}
	if (current.hasHeartRate) {
		charts.push('hr')
	} else if (current.avgSpeedMs !== null) {
		charts.push('speed')
	}
	return charts.slice(0, 2)
})

/**
 * Extracts the activity <type> label from raw GPX text.
 * @param text - Raw GPX XML
 * @returns Capitalized sport label
 */
const extractSportType = (text: string): string => {
	const match = /<type>\s*([^<]+?)\s*<\/type>/i.exec(text)
	if (!match) {
		return 'Activity'
	}
	const label = match[1].trim()
	return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Applies raw GPX text as the current activity.
 * @param text - Raw GPX XML
 * @param name - Display filename
 */
const applyGpx = (text: string, name: string): void => {
	const track: GpxTrack = parseGpx(text, name.replace(/\.gpx$/i, ''))
	const analyzed = analyzeActivity(track, extractSportType(text))
	activity.value = analyzed
	fileName.value = name
	errorMessage.value = null
	activeIndex.value = null

	// Pick a sensible default color metric for this file.
	if (analyzed.hasElevation) {
		metric.value = 'elevation'
	} else if (analyzed.hasHeartRate) {
		metric.value = 'heartRate'
	} else {
		metric.value = 'speed'
	}
}

/**
 * Loads the bundled demo activity.
 */
const loadDemo = async (): Promise<void> => {
	try {
		const response = await fetch(DEMO_URL)
		if (!response.ok) {
			throw new Error('missing')
		}
		applyGpx(await response.text(), DEMO_NAME)
	} catch {
		const response = await fetch(DEMO_FALLBACK_URL)
		if (!response.ok) {
			throw new Error('Demo GPX missing')
		}
		applyGpx(await response.text(), 'demo-loop.gpx')
	}
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
		applyGpx(await file.text(), file.name)
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
 * Handles file drop onto the viewer.
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

/** Zooms the map in. */
const zoomIn = (): void => mapRef.value?.zoomBy(1.45)
/** Zooms the map out. */
const zoomOut = (): void => mapRef.value?.zoomBy(1 / 1.45)
/** Fits the whole track. */
const fit = (): void => mapRef.value?.fit()

watch(activity, () => {
	activeIndex.value = null
})

onMounted(async () => {
	await loadDemo()
})
</script>

<template>
	<div
		class="relative flex h-full bg-mid-dark-greeny"
		:class="{ 'outline outline-1 outline-offset-[-1px] outline-yellow': dragOver }"
		@dragover="onDragOver"
		@dragleave="onDragLeave"
		@drop="onDrop"
	>
		<aside v-if="activity" class="ui-panel-shell" :class="{ 'is-collapsed': !sidebarOpen }">
			<div class="ui-panel-toggle-row">
				<PanelToggle
					:open="sidebarOpen"
					open-label="Open stats"
					close-label="Close stats"
					@toggle="sidebarOpen = !sidebarOpen"
				/>
			</div>
			<div class="ui-panel-body">
				<StatsSidebar :activity="activity" :file-name="fileName" @upload="openFilePicker" />
			</div>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col">
			<!-- Map -->
			<section class="relative min-h-0 flex-1">
				<MapView
					v-if="activity"
					ref="mapRef"
					:activity="activity"
					:metric="metric"
					:active-index="activeIndex"
					@hover="activeIndex = $event"
				/>
				<div
					v-else
					class="flex h-full items-center justify-center px-6 text-center text-[13px] text-[var(--faint)]"
				>
					Drop a .gpx file to explore it
				</div>

				<MapControls
					v-if="activity"
					:metric="metric"
					:has-heart-rate="hasHeartRate"
					:has-speed="hasSpeed"
					@update:metric="metric = $event"
					@zoom-in="zoomIn"
					@zoom-out="zoomOut"
					@fit="fit"
				/>

				<p
					v-if="errorMessage"
					class="absolute bottom-4 left-3 z-[12] max-w-[calc(100%-1.5rem)] border border-[var(--line)] bg-dark-greeny/90 px-3 py-2 text-[12px] text-orange"
					:style="{ marginLeft: 'var(--safe-left)' }"
				>
					{{ errorMessage }}
				</p>
			</section>

			<!-- Charts -->
			<section
				v-if="activity && visibleCharts.length > 0"
				class="grid shrink-0 grid-cols-1 border-t border-[var(--line)] md:grid-cols-2"
			>
				<div
					v-for="(field, index) in visibleCharts"
					:key="field"
					class="relative h-32 min-w-0 md:h-48"
					:class="{
						'md:border-l md:border-[var(--line)]': index > 0,
						'border-t border-[var(--line)] md:border-t-0': index > 0,
						'md:col-span-2': visibleCharts.length === 1,
					}"
				>
					<ProfileChart
						:activity="activity"
						:field="field"
						:active-index="activeIndex"
						@hover="activeIndex = $event"
					/>
				</div>
			</section>
		</div>

		<input
			ref="fileInputRef"
			type="file"
			class="hidden"
			accept=".gpx,application/gpx+xml,text/xml"
			@change="onFileInput"
		/>
	</div>
</template>
