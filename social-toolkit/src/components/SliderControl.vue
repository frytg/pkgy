<script setup lang="ts">
defineProps<{
	label: string
	modelValue: number
	min: number
	max: number
	step?: number
	format?: (value: number) => string
}>()

defineEmits<{
	'update:modelValue': [value: number]
}>()
</script>

<template>
	<label class="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[13px] text-primary/70 sm:gap-3">
		<span>{{ label }}</span>
		<input
			type="range"
			:min="min"
			:max="max"
			:step="step ?? 0.01"
			:value="modelValue"
			@input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
		/>
		<span class="text-right font-mono text-[11px] text-[var(--faint)] tabular-nums">
			{{ format ? format(modelValue) : modelValue }}
		</span>
	</label>
</template>
