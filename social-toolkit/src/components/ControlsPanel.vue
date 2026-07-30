<script setup lang="ts">
import ColorField from './ColorField.vue'
import SegmentedControl from './SegmentedControl.vue'
import SliderControl from './SliderControl.vue'
import { EXPORT_SCALE_OPTIONS } from '../engine/export-size.ts'
import { type HalftoneSettings, RASTER_SHAPE_OPTIONS } from '../engine/settings.ts'

defineProps<{
	settings: HalftoneSettings
	fileName: string
	exportScale: string
	exportSizeLabel: string
	exportBackground: boolean
}>()

const emit = defineEmits<{
	'update:settings': [value: HalftoneSettings]
	'update:exportScale': [value: string]
	'update:exportBackground': [value: boolean]
	upload: []
	reset: []
	swapColors: []
	downloadPng: []
	downloadSvg: []
	copyPng: []
	copySvg: []
}>()

/**
 * Patches settings and emits the full object.
 * @param patch - Partial settings update
 * @param settings - Current settings
 */
const patchSettings = (patch: Partial<HalftoneSettings>, settings: HalftoneSettings): void => {
	emit('update:settings', { ...settings, ...patch })
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
					<span class="ui-label mb-2 block">Image</span>
					<span class="block truncate text-[13px] text-primary/90 transition-colors group-hover:text-yellow">
						{{ fileName }}
					</span>
					<span class="mt-1.5 block text-[12px] text-[var(--faint)]"> Drop, paste, or click to replace </span>
				</button>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Frame</h2>
				<div class="space-y-4">
					<SliderControl
						label="Distance"
						:model-value="settings.previewDistance"
						:min="4"
						:max="12"
						:step="0.1"
						:format="decimal(1)"
						@update:model-value="patchSettings({ previewDistance: $event }, settings)"
					/>
					<SegmentedControl
						label="Fit"
						:model-value="settings.imageFit"
						:options="[
							{ label: 'Contain', value: 'contain' },
							{ label: 'Cover', value: 'cover' },
						]"
						@update:model-value="patchSettings({ imageFit: $event as 'contain' | 'cover' }, settings)"
					/>
					<SliderControl
						label="Contrast"
						:model-value="settings.imageContrast"
						:min="0.4"
						:max="2.5"
						:step="0.01"
						:format="decimal(2)"
						@update:model-value="patchSettings({ imageContrast: $event }, settings)"
					/>
				</div>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Halftone</h2>
				<div class="space-y-4">
					<div>
						<span class="ui-label mb-2.5 block">Shape</span>
						<div class="flex flex-wrap gap-1.5">
							<button
								v-for="option in RASTER_SHAPE_OPTIONS"
								:key="option.value"
								type="button"
								class="ui-chip"
								:class="{ 'is-active': settings.shape === option.value }"
								@click="patchSettings({ shape: option.value }, settings)"
							>
								{{ option.label }}
							</button>
						</div>
					</div>
					<SegmentedControl
						label="Areas"
						:model-value="settings.toneTarget"
						:options="[
							{ label: 'Light', value: 'light' },
							{ label: 'Dark', value: 'dark' },
						]"
						@update:model-value="patchSettings({ toneTarget: $event as 'light' | 'dark' }, settings)"
					/>
					<SliderControl
						label="Density"
						:model-value="settings.scale"
						:min="8"
						:max="64"
						:step="0.01"
						:format="decimal(2)"
						@update:model-value="patchSettings({ scale: $event }, settings)"
					/>
					<SliderControl
						label="Bias"
						:model-value="settings.power"
						:min="-1.5"
						:max="1.5"
						:step="0.01"
						:format="decimal(2)"
						@update:model-value="patchSettings({ power: $event }, settings)"
					/>
					<SliderControl
						label="Stroke"
						:model-value="settings.width"
						:min="0.05"
						:max="1.4"
						:step="0.01"
						:format="decimal(2)"
						@update:model-value="patchSettings({ width: $event }, settings)"
					/>
					<SliderControl
						label="Noise"
						:model-value="settings.randomness"
						:min="0"
						:max="1"
						:step="0.01"
						:format="decimal(2)"
						@update:model-value="patchSettings({ randomness: $event }, settings)"
					/>
				</div>
			</section>

			<section class="mb-7 sm:mb-9">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="ui-label">Color</h2>
					<button
						type="button"
						class="ui-link"
						title="Swap dash and background colors"
						@click="$emit('swapColors')"
					>
						Swap
					</button>
				</div>
				<div class="space-y-3">
					<ColorField
						label="Dash"
						:model-value="settings.dashColor"
						@update:model-value="patchSettings({ dashColor: $event }, settings)"
					/>
					<ColorField
						label="Background"
						:model-value="settings.backgroundColor"
						@update:model-value="patchSettings({ backgroundColor: $event }, settings)"
					/>
				</div>
			</section>

			<section>
				<h2 class="ui-label mb-4">Output</h2>
				<label class="mb-2 grid grid-cols-[64px_1fr] items-center gap-3 text-[13px] text-primary/70">
					<span>Scale</span>
					<select
						class="ui-field w-full border-none bg-transparent text-[13px] text-primary/90 outline-none"
						:value="exportScale"
						@change="$emit('update:exportScale', ($event.target as HTMLSelectElement).value)"
					>
						<option v-for="option in EXPORT_SCALE_OPTIONS" :key="option.value" :value="option.value">
							{{
								option.longEdge
									? `${option.label} · ${option.longEdge} long edge`
									: `${option.label} · native`
							}}
						</option>
					</select>
				</label>
				<p class="mb-5 font-mono text-[11px] text-[var(--faint)] tabular-nums">{{ exportSizeLabel }}</p>
				<label class="flex min-h-11 items-center justify-between text-[13px] text-primary/70 sm:min-h-0">
					<span>Include background</span>
					<button
						type="button"
						class="ui-toggle"
						:class="{ 'is-on': exportBackground }"
						:aria-pressed="exportBackground"
						@click="$emit('update:exportBackground', !exportBackground)"
					>
						<span class="ui-toggle-knob" />
					</button>
				</label>
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
