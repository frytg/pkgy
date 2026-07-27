<script setup lang="ts">
defineProps<{
	label: string
	modelValue: string
	options: Array<{ label: string; value: string }>
}>()

defineEmits<{
	'update:modelValue': [value: string]
}>()
</script>

<template>
	<div class="grid grid-cols-[64px_1fr] items-center gap-3 text-[13px] text-primary/70">
		<span>{{ label }}</span>
		<div class="ui-seg">
			<button
				v-for="option in options"
				:key="option.value"
				type="button"
				class="ui-seg-btn"
				:class="{ 'is-active': modelValue === option.value }"
				@click="$emit('update:modelValue', option.value)"
			>
				{{ option.label }}
			</button>
		</div>
	</div>
</template>
