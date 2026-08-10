<script setup lang="ts">
import { computed } from 'vue'

import type { AnalyzedActivity } from '../engine/analyze.ts'
import { hrZoneColor } from '../engine/color.ts'
import { formatDuration, formatDurationShort, formatPace, formatSignedMeters, formatSpeed } from '../engine/format.ts'
import HeroStats from './HeroStats.vue'

const props = defineProps<{
	activity: AnalyzedActivity
	fileName: string
}>()

const emit = defineEmits<{
	upload: []
}>()

/** Whether the sport reads better as pace (on foot) than speed. */
const prefersPace = computed(() => {
	const type = props.activity.sportType.toLowerCase()
	return /run|hike|walk|trail|trek/.test(type) || (props.activity.avgSpeedMs ?? 0) < 4.2
})

/**
 * Secondary detail rows — skips fields already shown in HeroStats.
 */
const detailRows = computed(() => {
	const activity = props.activity
	const rows: Array<{ label: string; value: string }> = []

	if (activity.durationMs !== null) {
		rows.push({ label: 'Elapsed time', value: formatDuration(activity.durationMs) })
	}
	if (activity.stoppedMs !== null && activity.stoppedMs > 1000) {
		rows.push({ label: 'Stopped', value: formatDurationShort(activity.stoppedMs) })
	}
	if (activity.maxSpeedMs !== null) {
		rows.push({ label: 'Max speed', value: `${formatSpeed(activity.maxSpeedMs)} km/h` })
	}
	if (activity.bestPaceSecPerKm !== null && prefersPace.value) {
		rows.push({ label: 'Best km', value: `${formatPace(activity.bestPaceSecPerKm)} /km` })
	}
	if (activity.eleLossM !== null) {
		rows.push({ label: 'Descent', value: `${Math.round(activity.eleLossM)} m` })
	}
	if (activity.minEle !== null && activity.maxEle !== null) {
		rows.push({ label: 'Elev range', value: `${Math.round(activity.minEle)}–${Math.round(activity.maxEle)} m` })
	}
	if (activity.maxGradePct !== null) {
		rows.push({ label: 'Max grade', value: `${activity.maxGradePct.toFixed(0)}%` })
	}
	if (activity.maxHr !== null) {
		rows.push({ label: 'Max HR', value: `${activity.maxHr} bpm` })
	}
	return rows
})

/** Visible splits (cap long activities). */
const visibleSplits = computed(() => props.activity.splits.slice(0, 60))
</script>

<template>
	<aside class="flex h-full flex-col overflow-hidden">
		<div class="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-5 sm:pt-5 sm:pb-5">
			<!-- Activity header -->
			<section class="mb-5 sm:mb-6">
				<button type="button" class="group block w-full text-left" :title="fileName" @click="emit('upload')">
					<span class="ui-label mb-2 block">Activity</span>
					<span
						class="block truncate text-[15px] font-semibold text-off-white transition-colors group-hover:text-yellow"
					>
						{{ activity.name }}
					</span>
					<span class="mt-1 block text-[12px] text-[var(--faint)]">
						{{ activity.sportType }} · {{ fileName }}
					</span>
					<span class="mt-1.5 block text-[11px] text-[var(--faint)]">Drop or click to replace</span>
				</button>
			</section>

			<!-- Headline stats -->
			<section class="mb-6 border-y border-[var(--line)] py-5 sm:mb-7">
				<HeroStats :activity="activity" />
			</section>

			<!-- HR zones -->
			<section v-if="activity.hrZones" class="mb-6 sm:mb-7">
				<h2 class="ui-label mb-3">Heart rate zones</h2>
				<div class="flex h-2 w-full overflow-hidden">
					<div
						v-for="zone in activity.hrZones"
						:key="zone.zone"
						class="h-full"
						:style="{ width: `${zone.pct * 100}%`, background: hrZoneColor(zone.zone) }"
						:title="`Z${zone.zone} ${zone.label}`"
					/>
				</div>
				<ul class="mt-3 space-y-1.5">
					<li
						v-for="zone in activity.hrZones"
						:key="zone.zone"
						class="flex items-center gap-2 text-[11px] text-off-white/70"
					>
						<span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: hrZoneColor(zone.zone) }" />
						<span class="w-6 font-mono text-[var(--faint)]">Z{{ zone.zone }}</span>
						<span class="flex-1 truncate">{{ zone.label }}</span>
						<span class="font-mono text-[var(--faint)] tabular-nums">{{
							formatDurationShort(zone.timeMs)
						}}</span>
						<span class="w-9 text-right font-mono text-off-white/80 tabular-nums"
							>{{ Math.round(zone.pct * 100) }}%</span
						>
					</li>
				</ul>
			</section>

			<!-- Detail stats -->
			<section v-if="detailRows.length > 0" class="mb-6 sm:mb-7">
				<h2 class="ui-label mb-3">Details</h2>
				<dl class="divide-y divide-[var(--line)]">
					<div v-for="row in detailRows" :key="row.label" class="flex items-center justify-between py-2">
						<dt class="text-[12px] text-[var(--muted)]">{{ row.label }}</dt>
						<dd class="font-mono text-[12px] text-off-white/90 tabular-nums">{{ row.value }}</dd>
					</div>
				</dl>
			</section>

			<!-- Splits -->
			<section v-if="visibleSplits.length > 1">
				<h2 class="ui-label mb-3">Splits <span class="text-[var(--faint)] normal-case">/ km</span></h2>
				<div class="border-y border-[var(--line)]">
					<div
						class="grid grid-cols-[2rem_1fr_3.5rem_3rem] gap-x-2 border-b border-[var(--line)] px-0 py-1.5 text-[10px] font-medium tracking-[0.05em] text-[var(--faint)] uppercase"
					>
						<span>km</span>
						<span>Pace</span>
						<span class="text-right">Δ ele</span>
						<span class="text-right">HR</span>
					</div>
					<div
						v-for="split in visibleSplits"
						:key="split.index"
						class="grid grid-cols-[2rem_1fr_3.5rem_3rem] gap-x-2 border-b border-[var(--line)] px-0 py-1.5 text-[11px] last:border-b-0"
					>
						<span class="font-mono text-[var(--faint)] tabular-nums">{{ split.index + 1 }}</span>
						<span class="font-mono text-off-white/90 tabular-nums">
							{{ split.paceSecPerKm !== null ? formatPace(split.paceSecPerKm) : '—' }}
						</span>
						<span
							class="text-right font-mono tabular-nums"
							:class="
								split.eleDeltaM === null
									? 'text-[var(--faint)]'
									: split.eleDeltaM > 1
										? 'text-orange'
										: split.eleDeltaM < -1
											? 'text-[#8FBB4E]'
											: 'text-[var(--faint)]'
							"
						>
							{{ split.eleDeltaM !== null ? formatSignedMeters(split.eleDeltaM) : '—' }}
						</span>
						<span class="text-right font-mono text-off-white/70 tabular-nums">
							{{ split.avgHr !== null ? split.avgHr : '—' }}
						</span>
					</div>
				</div>
			</section>
		</div>
	</aside>
</template>
