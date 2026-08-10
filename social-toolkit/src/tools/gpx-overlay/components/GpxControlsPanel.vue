<script setup lang="ts">
import ColorField from '../../../components/ColorField.vue'
import SliderControl from '../../../components/SliderControl.vue'
import { EXPORT_SCALE_OPTIONS } from '../../../engine/export-size.ts'
import type { GpxTrack } from '../engine/parse-gpx.ts'
import type { GpxOverlaySettings } from '../engine/settings.ts'

const props = defineProps<{
	settings: GpxOverlaySettings
	fileName: string
	statsLine: string
	exportScale: string
	exportSizeLabel: string
	track: GpxTrack | null
}>()

const emit = defineEmits<{
	'update:settings': [value: GpxOverlaySettings]
	'update:exportScale': [value: string]
	upload: []
	reset: []
	downloadPng: []
	downloadSvg: []
	copyPng: []
	copySvg: []
}>()

/**
 * Patches settings and emits the full object.
 * @param patch - Partial settings update
 */
const patchSettings = (patch: Partial<GpxOverlaySettings>): void => {
	emit('update:settings', { ...props.settings, ...patch })
}

/**
 * Toggles one overlay layer.
 * @param key - Layer key
 */
const toggleLayer = (key: keyof GpxOverlaySettings['layers']): void => {
	const layers = { ...props.settings.layers, [key]: !props.settings.layers[key] }
	if (!layers.track && !layers.elevation && !layers.heartRate) {
		layers[key] = true
	}
	patchSettings({ layers })
}

/**
 * Formats a number to fixed decimal places.
 * @param digits - Decimal places
 * @returns Formatter function
 */
const decimal =
	(digits: number) =>
	(value: number): string =>
		value.toFixed(digits)
</script>

<template>
	<aside class="flex h-full flex-col overflow-hidden">
		<div class="flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-4 sm:px-5 sm:pt-6 sm:pb-5">
			<section class="mb-7 sm:mb-9">
				<button type="button" class="group block w-full text-left" :title="fileName" @click="$emit('upload')">
					<span class="ui-label mb-2 block">GPX</span>
					<span
						class="block truncate text-[13px] text-off-white/90 transition-colors group-hover:text-yellow"
					>
						{{ fileName }}
					</span>
					<span class="mt-1.5 block text-[12px] text-[var(--faint)]">{{ statsLine }}</span>
				</button>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Layers</h2>
				<div class="space-y-4">
					<label class="flex min-h-11 items-center justify-between text-[13px] text-off-white/70 sm:min-h-0">
						<span>GPS track</span>
						<button
							type="button"
							class="ui-toggle"
							:class="{ 'is-on': settings.layers.track }"
							:aria-pressed="settings.layers.track"
							@click="toggleLayer('track')"
						>
							<span class="ui-toggle-knob" />
						</button>
					</label>
					<label class="flex min-h-11 items-center justify-between text-[13px] text-off-white/70 sm:min-h-0">
						<span :class="{ 'opacity-40': track && !track.hasElevation }">Elevation</span>
						<button
							type="button"
							class="ui-toggle disabled:cursor-not-allowed disabled:opacity-40"
							:class="{ 'is-on': settings.layers.elevation }"
							:aria-pressed="settings.layers.elevation"
							:disabled="Boolean(track && !track.hasElevation)"
							@click="toggleLayer('elevation')"
						>
							<span class="ui-toggle-knob" />
						</button>
					</label>
					<label class="flex min-h-11 items-center justify-between text-[13px] text-off-white/70 sm:min-h-0">
						<span :class="{ 'opacity-40': track && !track.hasHeartRate }">Heart rate</span>
						<button
							type="button"
							class="ui-toggle disabled:cursor-not-allowed disabled:opacity-40"
							:class="{ 'is-on': settings.layers.heartRate }"
							:aria-pressed="settings.layers.heartRate"
							:disabled="Boolean(track && !track.hasHeartRate)"
							@click="toggleLayer('heartRate')"
						>
							<span class="ui-toggle-knob" />
						</button>
					</label>
				</div>
				<p v-if="track && !track.hasHeartRate" class="mt-3 text-[11px] text-[var(--faint)]">
					No HR in this file — Garmin/extension tags only.
				</p>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Stroke</h2>
				<div class="space-y-4">
					<SliderControl
						label="Weight"
						:model-value="settings.strokeWidth"
						:min="1"
						:max="12"
						:step="0.5"
						:format="decimal(1)"
						@update:model-value="patchSettings({ strokeWidth: $event })"
					/>
					<SliderControl
						label="Inset"
						:model-value="settings.padding"
						:min="16"
						:max="120"
						:step="1"
						:format="(value) => String(Math.round(value))"
						@update:model-value="patchSettings({ padding: $event })"
					/>
					<label class="flex min-h-11 items-center justify-between text-[13px] text-off-white/70 sm:min-h-0">
						<span>Start / end</span>
						<button
							type="button"
							class="ui-toggle"
							:class="{ 'is-on': settings.showStartEnd }"
							:aria-pressed="settings.showStartEnd"
							@click="patchSettings({ showStartEnd: !settings.showStartEnd })"
						>
							<span class="ui-toggle-knob" />
						</button>
					</label>
				</div>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Color</h2>
				<div class="space-y-3">
					<ColorField
						label="Track"
						:model-value="settings.strokeColor"
						@update:model-value="patchSettings({ strokeColor: $event })"
					/>
					<ColorField
						label="Elev"
						:model-value="settings.elevationColor"
						@update:model-value="patchSettings({ elevationColor: $event })"
					/>
					<ColorField
						label="HR"
						:model-value="settings.heartRateColor"
						@update:model-value="patchSettings({ heartRateColor: $event })"
					/>
				</div>
			</section>

			<section>
				<h2 class="ui-label mb-4">Output</h2>
				<p class="mb-4 text-[12px] text-[var(--faint)]">
					Canvas matches the route aspect — transparent PNG / SVG for photo overlays.
				</p>
				<label class="mb-2 grid grid-cols-[64px_1fr] items-center gap-3 text-[13px] text-off-white/70">
					<span>Scale</span>
					<select
						class="ui-field w-full border-none bg-transparent text-[13px] text-off-white/90 outline-none"
						:value="exportScale"
						@change="$emit('update:exportScale', ($event.target as HTMLSelectElement).value)"
					>
						<option v-for="option in EXPORT_SCALE_OPTIONS" :key="option.value" :value="option.value">
							{{
								option.longEdge
									? `${option.label} · ${option.longEdge} long edge`
									: `${option.label} · auto`
							}}
						</option>
					</select>
				</label>
				<p class="font-mono text-[11px] text-[var(--faint)] tabular-nums">{{ exportSizeLabel }}</p>
			</section>
		</div>

		<div
			class="space-y-2 border-t border-[var(--line)] px-4 pt-4 pb-[max(1.25rem,var(--safe-bottom))] sm:px-5 sm:pb-5"
		>
			<button type="button" class="ui-btn ui-btn-primary w-full" @click="$emit('downloadPng')">
				Download PNG
			</button>
			<button type="button" class="ui-btn w-full" @click="$emit('downloadSvg')">Download SVG</button>
			<button type="button" class="ui-btn-ghost w-full" @click="$emit('copyPng')">Copy PNG</button>
			<button type="button" class="ui-btn-ghost w-full" @click="$emit('copySvg')">Copy SVG</button>
			<button type="button" class="ui-link" @click="$emit('reset')">Reset</button>
		</div>
	</aside>
</template>
