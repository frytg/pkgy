<script setup lang="ts">
import ColorField from '../../../components/ColorField.vue'
import SliderControl from '../../../components/SliderControl.vue'
import { EXPORT_SCALE_OPTIONS } from '../../../engine/export-size.ts'
import type { ElevationLinesSettings } from '../engine/settings.ts'

const props = defineProps<{
	settings: ElevationLinesSettings
	exportScale: string
	exportSizeLabel: string
	statsLine: string
}>()

const emit = defineEmits<{
	'update:settings': [value: ElevationLinesSettings]
	'update:exportScale': [value: string]
	randomize: []
	reset: []
	downloadPng: []
	downloadSvg: []
	copyPng: []
	copySvg: []
	swapColors: []
}>()

/**
 * Patches settings and emits the full object.
 * @param patch - Partial settings update
 */
const patchSettings = (patch: Partial<ElevationLinesSettings>): void => {
	emit('update:settings', { ...props.settings, ...patch })
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

const ASPECT_PRESETS: Array<{ label: string; width: number; height: number }> = [
	{ label: '1∶1', width: 1, height: 1 },
	{ label: '4∶5', width: 4, height: 5 },
	{ label: '9∶16', width: 9, height: 16 },
	{ label: '16∶9', width: 16, height: 9 },
	{ label: '3∶2', width: 3, height: 2 },
]

/**
 * Whether a preset matches the current aspect.
 * @param width - Preset width
 * @param height - Preset height
 * @returns True when active
 */
const isAspect = (width: number, height: number): boolean =>
	props.settings.aspectWidth === width && props.settings.aspectHeight === height
</script>

<template>
	<aside class="flex h-full flex-col overflow-hidden">
		<div class="flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-4 sm:px-5 sm:pt-6 sm:pb-5">
			<section class="mb-7 sm:mb-9">
				<button type="button" class="group block w-full text-left" @click="$emit('randomize')">
					<span class="ui-label mb-2 block">Terrain</span>
					<span class="block truncate text-[13px] text-primary/90 transition-colors group-hover:text-yellow">
						Seed {{ settings.seed }}
					</span>
					<span class="mt-1.5 block text-[12px] text-[var(--faint)]">{{ statsLine }}</span>
					<span class="mt-1.5 block text-[12px] text-[var(--faint)]">Click to randomize seed</span>
				</button>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Contours</h2>
				<div class="space-y-4">
					<SliderControl
						label="Levels"
						:model-value="settings.levels"
						:min="4"
						:max="36"
						:step="1"
						:format="(value) => String(Math.round(value))"
						@update:model-value="patchSettings({ levels: Math.round($event) })"
					/>
					<SliderControl
						label="Index every"
						:model-value="settings.indexEvery"
						:min="0"
						:max="10"
						:step="1"
						:format="(value) => (Math.round(value) <= 1 ? 'off' : String(Math.round(value)))"
						@update:model-value="patchSettings({ indexEvery: Math.round($event) })"
					/>
					<SliderControl
						label="Detail"
						:model-value="settings.resolution"
						:min="80"
						:max="280"
						:step="10"
						:format="(value) => String(Math.round(value))"
						@update:model-value="patchSettings({ resolution: Math.round($event) })"
					/>
				</div>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Terrain</h2>
				<div class="space-y-4">
					<SliderControl
						label="Scale"
						:model-value="settings.frequency"
						:min="0.4"
						:max="3.2"
						:step="0.05"
						:format="decimal(2)"
						@update:model-value="patchSettings({ frequency: $event })"
					/>
					<SliderControl
						label="Warp"
						:model-value="settings.warp"
						:min="0"
						:max="1.2"
						:step="0.01"
						:format="decimal(2)"
						@update:model-value="patchSettings({ warp: $event })"
					/>
					<SliderControl
						label="Ridges"
						:model-value="settings.ridged"
						:min="0"
						:max="1"
						:step="0.01"
						:format="decimal(2)"
						@update:model-value="patchSettings({ ridged: $event })"
					/>
					<SliderControl
						label="Octaves"
						:model-value="settings.octaves"
						:min="1"
						:max="7"
						:step="1"
						:format="(value) => String(Math.round(value))"
						@update:model-value="patchSettings({ octaves: Math.round($event) })"
					/>
				</div>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Stroke</h2>
				<div class="space-y-4">
					<SliderControl
						label="Weight"
						:model-value="settings.strokeWidth"
						:min="0.4"
						:max="4"
						:step="0.05"
						:format="decimal(2)"
						@update:model-value="patchSettings({ strokeWidth: $event })"
					/>
					<SliderControl
						label="Index ×"
						:model-value="settings.indexStrokeScale"
						:min="1"
						:max="4"
						:step="0.05"
						:format="decimal(2)"
						@update:model-value="patchSettings({ indexStrokeScale: $event })"
					/>
					<SliderControl
						label="Inset"
						:model-value="settings.padding"
						:min="0"
						:max="0.2"
						:step="0.005"
						:format="decimal(3)"
						@update:model-value="patchSettings({ padding: $event })"
					/>
				</div>
			</section>

			<section class="mb-7 sm:mb-9">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="ui-label">Color</h2>
					<button
						type="button"
						class="ui-link"
						title="Swap stroke and background"
						@click="$emit('swapColors')"
					>
						Swap
					</button>
				</div>
				<div class="space-y-3">
					<ColorField
						label="Line"
						:model-value="settings.strokeColor"
						@update:model-value="patchSettings({ strokeColor: $event })"
					/>
					<ColorField
						label="Background"
						:model-value="settings.backgroundColor"
						@update:model-value="patchSettings({ backgroundColor: $event })"
					/>
				</div>
			</section>

			<section class="mb-7 sm:mb-9">
				<h2 class="ui-label mb-4">Frame</h2>
				<div class="mb-4 flex flex-wrap gap-1.5">
					<button
						v-for="preset in ASPECT_PRESETS"
						:key="preset.label"
						type="button"
						class="ui-chip"
						:class="{ 'is-active': isAspect(preset.width, preset.height) }"
						@click="patchSettings({ aspectWidth: preset.width, aspectHeight: preset.height })"
					>
						{{ preset.label }}
					</button>
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
									: `${option.label} · 2160`
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
						:class="{ 'is-on': settings.includeBackground }"
						:aria-pressed="settings.includeBackground"
						@click="patchSettings({ includeBackground: !settings.includeBackground })"
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
