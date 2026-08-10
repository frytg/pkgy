<script setup lang="ts">
import { computed } from 'vue'

import type { AnalyzedActivity } from '../engine/analyze.ts'
import { formatDistance, formatDuration, formatPace, formatSpeed } from '../engine/format.ts'

const props = defineProps<{
	activity: AnalyzedActivity
}>()

/** Whether the sport reads better as pace (on foot) than speed. */
const prefersPace = computed(() => {
	const type = props.activity.sportType.toLowerCase()
	return /run|hike|walk|trail|trek/.test(type) || (props.activity.avgSpeedMs ?? 0) < 4.2
})

/** Headline stats for the sidebar. */
const stats = computed(() => {
	const activity = props.activity
	const cards: Array<{ label: string; value: string; unit?: string }> = [
		{ label: 'Distance', value: formatDistance(activity.distanceM) },
		{
			label: 'Moving time',
			value: activity.movingMs !== null ? formatDuration(activity.movingMs) : '—',
		},
		{
			label: 'Elevation',
			value: activity.eleGainM !== null ? `${Math.round(activity.eleGainM)}` : '—',
			unit: 'm',
		},
	]

	if (activity.avgPaceSecPerKm !== null && prefersPace.value) {
		cards.push({ label: 'Avg pace', value: formatPace(activity.avgPaceSecPerKm), unit: '/km' })
	} else if (activity.avgSpeedMs !== null) {
		cards.push({ label: 'Avg speed', value: formatSpeed(activity.avgSpeedMs), unit: 'km/h' })
	}

	if (activity.avgHr !== null) {
		cards.push({ label: 'Avg HR', value: `${activity.avgHr}`, unit: 'bpm' })
	}
	if (activity.calories !== null) {
		cards.push({ label: 'Calories', value: `${activity.calories}`, unit: 'kcal' })
	}
	return cards
})
</script>

<template>
	<div class="grid grid-cols-2 gap-x-4 gap-y-4">
		<div v-for="stat in stats" :key="stat.label" class="min-w-0">
			<p class="truncate text-[10px] font-medium tracking-[0.08em] text-[var(--faint)] uppercase">
				{{ stat.label }}
			</p>
			<p class="mt-1 truncate font-mono text-[22px] leading-none font-semibold text-off-white tabular-nums">
				{{ stat.value }}
				<span v-if="stat.unit" class="ml-0.5 text-[11px] font-normal text-[var(--muted)]">{{ stat.unit }}</span>
			</p>
		</div>
	</div>
</template>
