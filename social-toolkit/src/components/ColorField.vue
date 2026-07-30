<script setup lang="ts">
defineProps<{
	label: string
	modelValue: string
}>()

const emit = defineEmits<{
	'update:modelValue': [value: string]
}>()

/**
 * Normalizes a hex input to #RRGGBB when valid.
 * @param value - Raw text from the hex field
 */
const onHexInput = (value: string): void => {
	const trimmed = value.trim()
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
		emit('update:modelValue', trimmed.toUpperCase())
	}
}
</script>

<template>
	<label class="grid grid-cols-[64px_1fr] items-center gap-3 text-[13px] text-primary/70">
		<span>{{ label }}</span>
		<div class="ui-field flex items-center gap-2">
			<input
				type="color"
				:value="modelValue"
				:aria-label="label"
				@input="$emit('update:modelValue', ($event.target as HTMLInputElement).value.toUpperCase())"
			/>
			<input
				type="text"
				class="w-full bg-transparent font-mono text-[12px] tracking-wide text-primary/80 uppercase outline-none"
				:value="modelValue"
				spellcheck="false"
				@change="onHexInput(($event.target as HTMLInputElement).value)"
			/>
		</div>
	</label>
</template>
