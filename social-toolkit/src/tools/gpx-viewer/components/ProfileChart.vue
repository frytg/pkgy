<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AnalyzedActivity, Sample } from '../engine/analyze.ts'
import {
	ACCENT,
	ELEVATION_STOPS,
	HEARTRATE_STOPS,
	SPEED_STOPS,
	sampleGradient,
	type GradientStop,
} from '../engine/color.ts'
import { formatClock, formatDistance, formatSpeed } from '../engine/format.ts'

/** Chartable metric field. */
export type ChartField = 'ele' | 'hr' | 'speed'

const props = defineProps<{
	activity: AnalyzedActivity
	field: ChartField
	activeIndex: number | null
}>()

const emit = defineEmits<{
	hover: [index: number | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
let resizeObserver: ResizeObserver | null = null

const PAD = { top: 14, right: 14, bottom: 24, left: 44 }

/** One plottable point tied back to its source sample. */
type SeriesPoint = { sampleIndex: number; distance: number; value: number }

type FieldConfig = {
	title: string
	unit: string
	color: string
	stops: GradientStop[]
	read: (sample: Sample) => number | null
	format: (value: number) => string
	range: (activity: AnalyzedActivity) => { min: number; max: number } | null
	normalize: (value: number, activity: AnalyzedActivity) => number
}

const FIELD_CONFIG: Record<ChartField, FieldConfig> = {
	ele: {
		title: 'Elevation',
		unit: 'm',
		color: ACCENT.elevation,
		stops: ELEVATION_STOPS,
		read: (sample) => sample.eleSmooth,
		format: (value) => `${Math.round(value)} m`,
		range: (activity) =>
			activity.minEle === null || activity.maxEle === null
				? null
				: { min: activity.minEle, max: activity.maxEle },
		normalize: (value, activity) => {
			const span = Math.max((activity.maxEle ?? 0) - (activity.minEle ?? 0), 1e-6)
			return (value - (activity.minEle ?? 0)) / span
		},
	},
	hr: {
		title: 'Heart rate',
		unit: 'bpm',
		color: ACCENT.heartRate,
		stops: HEARTRATE_STOPS,
		read: (sample) => sample.hr,
		format: (value) => `${Math.round(value)} bpm`,
		range: (activity) =>
			activity.minHr === null || activity.maxHr === null ? null : { min: activity.minHr, max: activity.maxHr },
		normalize: (value, activity) => {
			const span = Math.max((activity.maxHr ?? 0) - (activity.minHr ?? 0), 1e-6)
			return (value - (activity.minHr ?? 0)) / span
		},
	},
	speed: {
		title: 'Speed',
		unit: 'km/h',
		color: ACCENT.speed,
		stops: SPEED_STOPS,
		read: (sample) => (sample.speedMs === null ? null : sample.speedMs * 3.6),
		format: (value) => `${formatSpeed(value / 3.6)} km/h`,
		range: (activity) => (activity.maxSpeedMs === null ? null : { min: 0, max: activity.maxSpeedMs * 3.6 }),
		normalize: (value, activity) => value / Math.max((activity.maxSpeedMs ?? 1) * 3.6, 1e-6),
	},
}

const config = computed(() => FIELD_CONFIG[props.field])

/** Series of plottable points for the active field. */
const series = computed<SeriesPoint[]>(() => {
	const read = config.value.read
	const points: SeriesPoint[] = []
	const samples = props.activity.samples
	for (let index = 0; index < samples.length; index += 1) {
		const value = read(samples[index])
		if (value !== null) {
			points.push({ sampleIndex: index, distance: samples[index].distanceM, value })
		}
	}
	return points
})

const hasData = computed(() => series.value.length > 1)

/** Padded value range for the y-axis. */
const valueRange = computed(() => {
	const range = config.value.range(props.activity)
	if (!range) {
		return null
	}
	const pad = Math.max((range.max - range.min) * 0.1, props.field === 'hr' ? 4 : 1)
	return { min: range.min - pad, max: range.max + pad }
})

const plotWidth = computed(() => Math.max(1, width.value - PAD.left - PAD.right))
const plotHeight = computed(() => Math.max(1, height.value - PAD.top - PAD.bottom))

/**
 * Maps a series point to pixel coordinates.
 * @param point - Series point
 * @returns Pixel coordinates
 */
const toPixel = (point: SeriesPoint): { x: number; y: number } => {
	const range = valueRange.value
	const total = Math.max(props.activity.distanceM, 1e-6)
	const x = PAD.left + (point.distance / total) * plotWidth.value
	const valueSpan = Math.max((range?.max ?? 1) - (range?.min ?? 0), 1e-6)
	const y = PAD.top + (1 - (point.value - (range?.min ?? 0)) / valueSpan) * plotHeight.value
	return { x, y }
}

/** Line path for the series. */
const linePath = computed(() => {
	if (!hasData.value) {
		return ''
	}
	return series.value
		.map((point, index) => {
			const pixel = toPixel(point)
			return `${index === 0 ? 'M' : 'L'}${pixel.x.toFixed(1)},${pixel.y.toFixed(1)}`
		})
		.join(' ')
})

/** Closed area path for the gradient fill. */
const areaPath = computed(() => {
	if (!hasData.value) {
		return ''
	}
	const first = toPixel(series.value[0])
	const last = toPixel(series.value[series.value.length - 1])
	const bottom = PAD.top + plotHeight.value
	return `${linePath.value} L${last.x.toFixed(1)},${bottom.toFixed(1)} L${first.x.toFixed(1)},${bottom.toFixed(1)} Z`
})

/** Value-colored horizontal gradient stops (matches the map ramp). */
const gradientStops = computed(() => {
	if (!hasData.value) {
		return []
	}
	const total = Math.max(props.activity.distanceM, 1e-6)
	const count = 40
	const stops: Array<{ offset: string; color: string }> = []
	for (let index = 0; index <= count; index += 1) {
		const distance = (index / count) * total
		// Nearest series value at this distance.
		let nearest = series.value[0]
		let best = Infinity
		for (const point of series.value) {
			const d = Math.abs(point.distance - distance)
			if (d < best) {
				best = d
				nearest = point
			}
		}
		const t = Math.max(0, Math.min(1, config.value.normalize(nearest.value, props.activity)))
		stops.push({ offset: `${(index / count) * 100}%`, color: sampleGradient(config.value.stops, t) })
	}
	return stops
})

/** Y-axis tick labels. */
const yTicks = computed(() => {
	const range = valueRange.value
	if (!range) {
		return []
	}
	const ticks: Array<{ y: number; label: string }> = []
	for (let index = 0; index <= 3; index += 1) {
		const value = range.min + ((range.max - range.min) * index) / 3
		const valueSpan = Math.max(range.max - range.min, 1e-6)
		const y = PAD.top + (1 - (value - range.min) / valueSpan) * plotHeight.value
		ticks.push({ y, label: `${Math.round(value)}` })
	}
	return ticks
})

/** X-axis distance tick labels. */
const xTicks = computed(() => {
	const total = props.activity.distanceM
	const ticks: Array<{ x: number; label: string }> = []
	const count = 5
	for (let index = 0; index <= count; index += 1) {
		const distance = (index / count) * total
		const x = PAD.left + (index / count) * plotWidth.value
		ticks.push({ x, label: formatDistance(distance) })
	}
	return ticks
})

/** Active hover point derived from the synced sample index. */
const hoverPoint = computed(() => {
	if (props.activeIndex === null) {
		return null
	}
	const point = series.value.find((entry) => entry.sampleIndex === props.activeIndex)
	// Fall back to nearest series point when the exact sample has no value.
	if (!point) {
		let nearest: SeriesPoint | null = null
		let best = Infinity
		for (const entry of series.value) {
			const d = Math.abs(entry.sampleIndex - props.activeIndex)
			if (d < best) {
				best = d
				nearest = entry
			}
		}
		if (!nearest) {
			return null
		}
		return { point: nearest, pixel: toPixel(nearest) }
	}
	return { point, pixel: toPixel(point) }
})

const hoverSample = computed(() =>
	props.activeIndex === null ? null : (props.activity.samples[props.activeIndex] ?? null),
)

const gradientId = `grad-${props.field}`

/**
 * Handles pointer movement — emits the nearest sample index.
 * @param event - Pointer event
 */
const onPointerMove = (event: PointerEvent): void => {
	if (!hasData.value) {
		return
	}
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
	const x = event.clientX - rect.left
	const total = Math.max(props.activity.distanceM, 1e-6)
	const distance = ((x - PAD.left) / plotWidth.value) * total

	// Binary search nearest series point by distance.
	let low = 0
	let high = series.value.length - 1
	while (low < high) {
		const mid = (low + high) >> 1
		if (series.value[mid].distance < distance) {
			low = mid + 1
		} else {
			high = mid
		}
	}
	let best = series.value[low]
	if (low > 0) {
		const prev = series.value[low - 1]
		if (Math.abs(prev.distance - distance) < Math.abs(best.distance - distance)) {
			best = prev
		}
	}
	emit('hover', best.sampleIndex)
}

/**
 * Clears hover on pointer leave.
 */
const onPointerLeave = (): void => {
	emit('hover', null)
}

/**
 * Measures the container.
 */
const measure = (): void => {
	const container = containerRef.value
	if (!container) {
		return
	}
	width.value = container.clientWidth
	height.value = container.clientHeight
}

onMounted(() => {
	measure()
	if (containerRef.value) {
		resizeObserver = new ResizeObserver(() => measure())
		resizeObserver.observe(containerRef.value)
	}
})

onBeforeUnmount(() => {
	resizeObserver?.disconnect()
})

watch(
	() => props.activity,
	() => measure(),
)
</script>

<template>
	<div ref="containerRef" class="relative h-full w-full">
		<div v-if="!hasData" class="flex h-full items-center justify-center text-[12px] text-[var(--faint)]">
			No {{ config.title.toLowerCase() }} data in this file
		</div>

		<svg
			v-else
			class="block h-full w-full"
			:viewBox="`0 0 ${width} ${height}`"
			@pointermove="onPointerMove"
			@pointerleave="onPointerLeave"
		>
			<defs>
				<linearGradient :id="gradientId" x1="0%" y1="0%" x2="100%" y2="0%">
					<stop
						v-for="(stop, index) in gradientStops"
						:key="index"
						:offset="stop.offset"
						:stop-color="stop.color"
					/>
				</linearGradient>
				<linearGradient :id="`${gradientId}-fade`" x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" :stop-color="config.color" stop-opacity="0.28" />
					<stop offset="100%" :stop-color="config.color" stop-opacity="0.02" />
				</linearGradient>
			</defs>

			<!-- Grid -->
			<g v-for="(tick, index) in yTicks" :key="`y-${index}`">
				<line
					:x1="PAD.left"
					:x2="width - PAD.right"
					:y1="tick.y"
					:y2="tick.y"
					stroke="rgba(214,225,203,0.08)"
					stroke-width="1"
				/>
				<text
					:x="PAD.left - 8"
					:y="tick.y + 3"
					text-anchor="end"
					fill="rgba(214,225,203,0.45)"
					font-size="10"
					font-family="GeistMono, monospace"
				>
					{{ tick.label }}
				</text>
			</g>
			<text
				v-for="(tick, index) in xTicks"
				:key="`x-${index}`"
				:x="tick.x"
				:y="height - 8"
				:text-anchor="index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'"
				fill="rgba(214,225,203,0.45)"
				font-size="10"
				font-family="GeistMono, monospace"
			>
				{{ tick.label }}
			</text>

			<!-- Area + line -->
			<path :d="areaPath" :fill="`url(#${gradientId}-fade)`" />
			<path
				:d="linePath"
				fill="none"
				:stroke="`url(#${gradientId})`"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			<!-- Hover crosshair -->
			<g v-if="hoverPoint">
				<line
					:x1="hoverPoint.pixel.x"
					:x2="hoverPoint.pixel.x"
					:y1="PAD.top"
					:y2="PAD.top + plotHeight"
					stroke="rgba(232,255,42,0.4)"
					stroke-width="1"
				/>
				<circle :cx="hoverPoint.pixel.x" :cy="hoverPoint.pixel.y" r="4.5" :fill="config.color" />
				<circle
					:cx="hoverPoint.pixel.x"
					:cy="hoverPoint.pixel.y"
					r="8"
					fill="none"
					:stroke="config.color"
					stroke-opacity="0.4"
				/>
			</g>
		</svg>

		<!-- Tooltip -->
		<div
			v-if="hoverPoint && hoverSample"
			class="pointer-events-none absolute z-10 border border-[var(--line-strong)] bg-dark-greeny/95 px-2.5 py-1.5 backdrop-blur"
			:style="{
				left: `${Math.min(Math.max(hoverPoint.pixel.x, 70), width - 78)}px`,
				top: '6px',
				transform: hoverPoint.pixel.x > width / 2 ? 'translateX(-100%)' : 'none',
			}"
		>
			<p class="font-mono text-[12px] font-semibold text-off-white tabular-nums">
				{{ config.format(hoverPoint.point.value) }}
			</p>
			<p class="mt-0.5 font-mono text-[10px] text-[var(--faint)] tabular-nums">
				{{ formatDistance(hoverSample.distanceM) }}
				<template v-if="hoverSample.timeMs"> · {{ formatClock(hoverSample.timeMs) }}</template>
			</p>
		</div>
	</div>
</template>
