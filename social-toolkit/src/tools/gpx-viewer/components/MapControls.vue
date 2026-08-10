<script setup lang="ts">
import type { TrackMetric } from './MapView.vue'

defineProps<{
	metric: TrackMetric
	hasHeartRate: boolean
	hasSpeed: boolean
}>()

const emit = defineEmits<{
	'update:metric': [value: TrackMetric]
	zoomIn: []
	zoomOut: []
	fit: []
}>()

/** Metric options with availability gates. */
const metricOptions: Array<{ value: TrackMetric; label: string }> = [
	{ value: 'elevation', label: 'Elevation' },
	{ value: 'speed', label: 'Speed' },
	{ value: 'heartRate', label: 'HR' },
]

/**
 * Whether a metric is available for the current file.
 * @param value - Metric id
 * @returns Enabled flag
 */
const isEnabled = (value: TrackMetric, hasHeartRate: boolean, hasSpeed: boolean): boolean => {
	if (value === 'heartRate') {
		return hasHeartRate
	}
	if (value === 'speed') {
		return hasSpeed
	}
	return true
}
</script>

<template>
	<!-- Metric switcher (top-right) -->
	<div
		class="absolute top-3 right-3 z-10 flex gap-0.5 border border-[var(--line)] bg-dark-greeny/90 p-0.5 backdrop-blur"
		:style="{ marginRight: 'var(--safe-right)' }"
	>
		<button
			v-for="option in metricOptions"
			:key="option.value"
			type="button"
			class="px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35"
			:class="
				metric === option.value
					? 'bg-yellow text-greeny'
					: 'text-[var(--muted)] hover:bg-yellow hover:text-greeny'
			"
			:disabled="!isEnabled(option.value, hasHeartRate, hasSpeed)"
			@click="emit('update:metric', option.value)"
		>
			{{ option.label }}
		</button>
	</div>

	<!-- Zoom cluster (bottom-right) -->
	<div
		class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden border border-[var(--line)] bg-dark-greeny/90 backdrop-blur"
		:style="{ marginRight: 'var(--safe-right)', marginBottom: 'var(--safe-bottom)' }"
	>
		<button
			type="button"
			class="flex h-9 w-9 items-center justify-center text-off-white/80 transition-colors hover:bg-yellow hover:text-greeny"
			aria-label="Zoom in"
			@click="emit('zoomIn')"
		>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
				<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" />
			</svg>
		</button>
		<button
			type="button"
			class="flex h-9 w-9 items-center justify-center border-y border-[var(--line)] text-off-white/80 transition-colors hover:bg-yellow hover:text-greeny"
			aria-label="Zoom out"
			@click="emit('zoomOut')"
		>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
				<path d="M2 7h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" />
			</svg>
		</button>
		<button
			type="button"
			class="flex h-9 w-9 items-center justify-center text-off-white/80 transition-colors hover:bg-yellow hover:text-greeny"
			aria-label="Fit track"
			@click="emit('fit')"
		>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
				<path
					d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="square"
					stroke-linejoin="miter"
				/>
			</svg>
		</button>
	</div>
</template>
