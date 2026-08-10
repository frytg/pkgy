<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AnalyzedActivity, Sample } from '../engine/analyze.ts'
import { ELEVATION_STOPS, HEARTRATE_STOPS, SPEED_STOPS, gradientLut } from '../engine/color.ts'
import {
	clampScale,
	fitTransform,
	niceGridStep,
	screenToWorld,
	worldToScreen,
	zoomAt,
	type ViewTransform,
} from '../engine/geometry.ts'
import { formatDistance } from '../engine/format.ts'

/** Metric used to color the track. */
export type TrackMetric = 'elevation' | 'speed' | 'heartRate'

const props = defineProps<{
	activity: AnalyzedActivity | null
	metric: TrackMetric
	activeIndex: number | null
}>()

const emit = defineEmits<{
	hover: [index: number | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const COLOR_BUCKETS = 48
const MAX_RENDER_POINTS = 3200
const TRACK_WIDTH = 3.5

let view: ViewTransform = { scale: 1, tx: 0, ty: 0 }
let fitView: ViewTransform = { scale: 1, tx: 0, ty: 0 }
let ctx: CanvasRenderingContext2D | null = null
let dpr = 1
let cssWidth = 0
let cssHeight = 0
let rafId = 0
let drawQueued = false
let resizeObserver: ResizeObserver | null = null

// Render cache for the colored track.
let renderPoints: Array<{ x: number; y: number; bucket: number }> = []
let colorLut: string[] = []

// Interaction state.
const pointers = new Map<number, { x: number; y: number }>()
let dragging = false
let lastPinchDistance = 0
let animationFrame = 0
let animTarget: ViewTransform | null = null
let hoverRaf = 0
let pendingHover: { x: number; y: number } | null = null

/**
 * Returns the normalized 0..1 metric value for a sample, or null.
 * @param sample - Track sample
 * @param activity - Parent activity (for ranges)
 * @returns Normalized value or null
 */
const metricValue = (sample: Sample, activity: AnalyzedActivity): number | null => {
	if (props.metric === 'elevation') {
		if (sample.eleSmooth === null || activity.minEle === null || activity.maxEle === null) {
			return null
		}
		const span = Math.max(activity.maxEle - activity.minEle, 1e-6)
		return (sample.eleSmooth - activity.minEle) / span
	}
	if (props.metric === 'speed') {
		if (sample.speedMs === null || activity.maxSpeedMs === null) {
			return null
		}
		return Math.min(sample.speedMs / Math.max(activity.maxSpeedMs, 1e-6), 1)
	}
	if (sample.hr === null || activity.minHr === null || activity.maxHr === null) {
		return null
	}
	const span = Math.max(activity.maxHr - activity.minHr, 1e-6)
	return (sample.hr - activity.minHr) / span
}

/**
 * Rebuilds the downsampled, color-bucketed render cache.
 */
const buildRenderCache = (): void => {
	const activity = props.activity
	if (!activity) {
		renderPoints = []
		return
	}
	const stops =
		props.metric === 'elevation' ? ELEVATION_STOPS : props.metric === 'speed' ? SPEED_STOPS : HEARTRATE_STOPS
	colorLut = gradientLut(stops, COLOR_BUCKETS)

	const samples = activity.samples
	const stride = Math.max(1, Math.ceil(samples.length / MAX_RENDER_POINTS))
	const points: Array<{ x: number; y: number; bucket: number }> = []
	for (let index = 0; index < samples.length; index += stride) {
		const sample = samples[index]
		const value = metricValue(sample, activity)
		const bucket = value === null ? -1 : Math.min(COLOR_BUCKETS - 1, Math.floor(value * COLOR_BUCKETS))
		points.push({ x: sample.x, y: sample.y, bucket })
	}
	// Always include the final point.
	const last = samples[samples.length - 1]
	const lastValue = metricValue(last, activity)
	points.push({
		x: last.x,
		y: last.y,
		bucket: lastValue === null ? -1 : Math.min(COLOR_BUCKETS - 1, Math.floor(lastValue * COLOR_BUCKETS)),
	})
	renderPoints = points
}

/**
 * Draws the faint world-aligned grid.
 */
const drawGrid = (): void => {
	if (!ctx) {
		return
	}
	const step = niceGridStep(view)
	const topLeft = screenToWorld(view, 0, 0)
	const bottomRight = screenToWorld(view, cssWidth, cssHeight)

	ctx.strokeStyle = 'rgba(215, 226, 204, 0.05)'
	ctx.lineWidth = 1
	ctx.beginPath()
	const startX = Math.floor(topLeft.x / step) * step
	for (let x = startX; x <= bottomRight.x; x += step) {
		const sx = Math.round(worldToScreen(view, x, 0).x) + 0.5
		ctx.moveTo(sx, 0)
		ctx.lineTo(sx, cssHeight)
	}
	const startY = Math.floor(bottomRight.y / step) * step
	for (let y = startY; y <= topLeft.y; y += step) {
		const sy = Math.round(worldToScreen(view, 0, y).y) + 0.5
		ctx.moveTo(0, sy)
		ctx.lineTo(cssWidth, sy)
	}
	ctx.stroke()
}

/**
 * Draws the colored track with a soft glow underlay.
 */
const drawTrack = (): void => {
	if (!ctx || renderPoints.length < 2) {
		return
	}

	// Glow underlay — whole path, single translucent stroke.
	ctx.beginPath()
	const first = worldToScreen(view, renderPoints[0].x, renderPoints[0].y)
	ctx.moveTo(first.x, first.y)
	for (let index = 1; index < renderPoints.length; index += 1) {
		const point = worldToScreen(view, renderPoints[index].x, renderPoints[index].y)
		ctx.lineTo(point.x, point.y)
	}
	ctx.strokeStyle = 'rgba(255, 255, 17, 0.10)'
	ctx.lineWidth = TRACK_WIDTH * 3.4
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	ctx.stroke()

	// Colored runs — batch consecutive equal buckets into one stroke.
	ctx.lineWidth = TRACK_WIDTH
	let runColor = ''
	let runOpen = false
	for (let index = 1; index < renderPoints.length; index += 1) {
		const previous = renderPoints[index - 1]
		const current = renderPoints[index]
		const color = current.bucket < 0 ? 'rgba(150,160,145,0.7)' : colorLut[current.bucket]
		if (color !== runColor) {
			if (runOpen) {
				ctx.stroke()
			}
			ctx.beginPath()
			const start = worldToScreen(view, previous.x, previous.y)
			ctx.moveTo(start.x, start.y)
			ctx.strokeStyle = color
			runColor = color
			runOpen = true
		}
		const point = worldToScreen(view, current.x, current.y)
		ctx.lineTo(point.x, point.y)
	}
	if (runOpen) {
		ctx.stroke()
	}
}

/**
 * Draws a circular marker.
 * @param x - Screen x
 * @param y - Screen y
 * @param radius - Radius px
 * @param fill - Fill color
 * @param ring - Ring color or null
 */
const drawMarker = (x: number, y: number, radius: number, fill: string, ring: string | null): void => {
	if (!ctx) {
		return
	}
	if (ring) {
		ctx.beginPath()
		ctx.arc(x, y, radius + 3, 0, Math.PI * 2)
		ctx.fillStyle = ring
		ctx.fill()
	}
	ctx.beginPath()
	ctx.arc(x, y, radius, 0, Math.PI * 2)
	ctx.fillStyle = fill
	ctx.fill()
}

/**
 * Draws start/end markers.
 */
const drawEndpoints = (): void => {
	const activity = props.activity
	if (!ctx || !activity || activity.samples.length < 2) {
		return
	}
	const start = activity.samples[0]
	const end = activity.samples[activity.samples.length - 1]
	const startScreen = worldToScreen(view, start.x, start.y)
	const endScreen = worldToScreen(view, end.x, end.y)

	drawMarker(startScreen.x, startScreen.y, 6, '#8FBB4E', 'rgba(24,29,22,0.9)')
	drawMarker(endScreen.x, endScreen.y, 6, '#F09139', 'rgba(24,29,22,0.9)')

	ctx.fillStyle = 'rgba(24,29,22,0.95)'
	ctx.font = '700 8px GeistSans, sans-serif'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText('S', startScreen.x, startScreen.y + 0.5)
	ctx.fillText('E', endScreen.x, endScreen.y + 0.5)
}

/**
 * Draws the synced hover marker.
 */
const drawHover = (): void => {
	const activity = props.activity
	if (!ctx || !activity || props.activeIndex === null) {
		return
	}
	const sample = activity.samples[props.activeIndex]
	if (!sample) {
		return
	}
	const screen = worldToScreen(view, sample.x, sample.y)

	ctx.strokeStyle = 'rgba(255,255,17,0.35)'
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(screen.x, 0)
	ctx.lineTo(screen.x, cssHeight)
	ctx.moveTo(0, screen.y)
	ctx.lineTo(cssWidth, screen.y)
	ctx.stroke()

	drawMarker(screen.x, screen.y, 6, '#FFFF11', 'rgba(255,255,17,0.25)')
}

/**
 * Draws a scale bar (bottom-left).
 */
const drawScaleBar = (): void => {
	if (!ctx) {
		return
	}
	const targetPx = 88
	const step = niceGridStep(view, targetPx)
	const px = step * view.scale
	const x = 20
	const y = cssHeight - 22

	ctx.strokeStyle = 'rgba(236,235,227,0.7)'
	ctx.lineWidth = 2
	ctx.beginPath()
	ctx.moveTo(x, y)
	ctx.lineTo(x + px, y)
	ctx.moveTo(x, y - 4)
	ctx.lineTo(x, y + 4)
	ctx.moveTo(x + px, y - 4)
	ctx.lineTo(x + px, y + 4)
	ctx.stroke()

	ctx.fillStyle = 'rgba(236,235,227,0.75)'
	ctx.font = '500 11px GeistMono, monospace'
	ctx.textAlign = 'left'
	ctx.textBaseline = 'bottom'
	ctx.fillText(formatDistance(step), x, y - 7)
}

/**
 * Renders the whole scene.
 */
const draw = (): void => {
	if (!ctx) {
		return
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

	// Flat dark-greeny field — no decorative vignette.
	ctx.fillStyle = '#181d16'
	ctx.fillRect(0, 0, cssWidth, cssHeight)

	drawGrid()
	drawTrack()
	drawEndpoints()
	drawHover()
	drawScaleBar()
}

/**
 * Queues a single rAF draw.
 */
const scheduleDraw = (): void => {
	if (drawQueued) {
		return
	}
	drawQueued = true
	rafId = requestAnimationFrame(() => {
		drawQueued = false
		draw()
	})
}

/**
 * Stops any running zoom animation.
 */
const stopAnimation = (): void => {
	if (animationFrame) {
		cancelAnimationFrame(animationFrame)
		animationFrame = 0
	}
	animTarget = null
}

/**
 * Animates the view toward a target transform.
 * @param target - Target transform
 */
const animateTo = (target: ViewTransform): void => {
	stopAnimation()
	animTarget = target
	const start = { ...view }
	const startTime = performance.now()
	const duration = 320

	/**
	 * Animation step.
	 * @param now - Current timestamp
	 */
	const step = (now: number): void => {
		if (!animTarget) {
			return
		}
		const t = Math.min((now - startTime) / duration, 1)
		const eased = 1 - (1 - t) ** 3
		view = {
			scale: start.scale + (animTarget.scale - start.scale) * eased,
			tx: start.tx + (animTarget.tx - start.tx) * eased,
			ty: start.ty + (animTarget.ty - start.ty) * eased,
		}
		draw()
		if (t < 1) {
			animationFrame = requestAnimationFrame(step)
		} else {
			animationFrame = 0
			animTarget = null
		}
	}
	animationFrame = requestAnimationFrame(step)
}

/**
 * Zooms by a factor around the viewport center (animated).
 * @param factor - Zoom multiplier
 */
const zoomBy = (factor: number): void => {
	const target = zoomAt(view, factor, cssWidth / 2, cssHeight / 2)
	target.scale = clampScale(target.scale, fitView.scale)
	animateTo(target)
}

/**
 * Fits the whole track into view (animated).
 */
const fit = (): void => {
	animateTo({ ...fitView })
}

/**
 * Recomputes the fit transform for the current viewport + activity.
 */
const computeFit = (): void => {
	if (!props.activity) {
		return
	}
	fitView = fitTransform(props.activity.bounds, cssWidth, cssHeight)
}

/**
 * Sizes the canvas to its container at device pixel ratio.
 */
const resize = (): void => {
	const container = containerRef.value
	const canvas = canvasRef.value
	if (!container || !canvas) {
		return
	}
	cssWidth = container.clientWidth
	cssHeight = container.clientHeight
	dpr = Math.min(window.devicePixelRatio || 1, 2)
	canvas.width = Math.round(cssWidth * dpr)
	canvas.height = Math.round(cssHeight * dpr)
	canvas.style.width = `${cssWidth}px`
	canvas.style.height = `${cssHeight}px`
	ctx = canvas.getContext('2d')
	computeFit()
	scheduleDraw()
}

/**
 * Handles wheel zoom toward the cursor.
 * @param event - Wheel event
 */
const onWheel = (event: WheelEvent): void => {
	event.preventDefault()
	stopAnimation()
	const factor = Math.exp(-event.deltaY * 0.0016)
	const next = zoomAt(view, factor, event.offsetX, event.offsetY)
	next.scale = clampScale(next.scale, fitView.scale)
	view = next
	scheduleDraw()
}

/**
 * Runs the nearest-sample search once per frame.
 */
const processHover = (): void => {
	hoverRaf = 0
	const activity = props.activity
	if (!activity || !pendingHover) {
		return
	}
	const world = screenToWorld(view, pendingHover.x, pendingHover.y)
	let bestIndex = -1
	let bestDistance = Infinity
	for (let index = 0; index < activity.samples.length; index += 1) {
		const sample = activity.samples[index]
		const dx = sample.x - world.x
		const dy = sample.y - world.y
		const distance = dx * dx + dy * dy
		if (distance < bestDistance) {
			bestDistance = distance
			bestIndex = index
		}
	}
	const thresholdWorld = 18 / view.scale
	emit('hover', bestDistance <= thresholdWorld * thresholdWorld ? bestIndex : null)
}

/**
 * Hit-tests the cursor against the track and emits hover (rAF-throttled).
 * @param event - Pointer event
 */
const emitHover = (event: PointerEvent): void => {
	pendingHover = { x: event.offsetX, y: event.offsetY }
	if (hoverRaf) {
		return
	}
	hoverRaf = requestAnimationFrame(processHover)
}

/**
 * Handles pointer down — begins drag / pinch tracking.
 * @param event - Pointer event
 */
const onPointerDown = (event: PointerEvent): void => {
	;(event.target as HTMLElement).setPointerCapture(event.pointerId)
	pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY })
	stopAnimation()
	if (pointers.size === 1) {
		dragging = true
	} else if (pointers.size === 2) {
		dragging = false
		const [a, b] = [...pointers.values()]
		lastPinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
	}
}

/**
 * Handles pointer move — pan, pinch, or hover.
 * @param event - Pointer event
 */
const onPointerMove = (event: PointerEvent): void => {
	if (!pointers.has(event.pointerId)) {
		emitHover(event)
		return
	}
	const previous = pointers.get(event.pointerId)!
	pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY })

	if (pointers.size === 2) {
		const [a, b] = [...pointers.values()]
		const distance = Math.hypot(a.x - b.x, a.y - b.y)
		const centerX = (a.x + b.x) / 2
		const centerY = (a.y + b.y) / 2
		if (lastPinchDistance > 0) {
			const factor = distance / lastPinchDistance
			const next = zoomAt(view, factor, centerX, centerY)
			next.scale = clampScale(next.scale, fitView.scale)
			view = next
			scheduleDraw()
		}
		lastPinchDistance = distance
		return
	}

	if (dragging) {
		view = {
			...view,
			tx: view.tx + (event.offsetX - previous.x),
			ty: view.ty + (event.offsetY - previous.y),
		}
		scheduleDraw()
	}
}

/**
 * Handles pointer up — ends drag / pinch.
 * @param event - Pointer event
 */
const onPointerUp = (event: PointerEvent): void => {
	pointers.delete(event.pointerId)
	if (pointers.size < 2) {
		lastPinchDistance = 0
	}
	if (pointers.size === 0) {
		dragging = false
	}
}

/**
 * Clears hover when the pointer leaves.
 */
const onPointerLeave = (): void => {
	emit('hover', null)
}

watch(
	() => props.activity,
	() => {
		buildRenderCache()
		computeFit()
		view = { ...fitView }
		scheduleDraw()
	},
)

watch(
	() => props.metric,
	() => {
		buildRenderCache()
		scheduleDraw()
	},
)

watch(
	() => props.activeIndex,
	() => scheduleDraw(),
)

onMounted(() => {
	resize()
	if (props.activity) {
		buildRenderCache()
		computeFit()
		view = { ...fitView }
	}
	if (containerRef.value) {
		resizeObserver = new ResizeObserver(() => resize())
		resizeObserver.observe(containerRef.value)
	}
	scheduleDraw()
})

onBeforeUnmount(() => {
	resizeObserver?.disconnect()
	stopAnimation()
	if (rafId) {
		cancelAnimationFrame(rafId)
	}
	if (hoverRaf) {
		cancelAnimationFrame(hoverRaf)
	}
})

defineExpose({ zoomBy, fit })
</script>

<template>
	<div
		ref="containerRef"
		class="relative h-full w-full touch-none overflow-hidden"
		@wheel="onWheel"
		@pointerdown="onPointerDown"
		@pointermove="onPointerMove"
		@pointerup="onPointerUp"
		@pointercancel="onPointerUp"
		@pointerleave="onPointerLeave"
	>
		<canvas ref="canvasRef" class="block h-full w-full" :class="dragging ? 'cursor-grabbing' : 'cursor-grab'" />
	</div>
</template>
