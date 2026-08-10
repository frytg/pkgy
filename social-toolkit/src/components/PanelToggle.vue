<script setup lang="ts">
defineProps<{
	open: boolean
	/** Accessible name when the panel is closed (e.g. "Open controls"). */
	openLabel: string
	/** Accessible name when the panel is open (e.g. "Close controls"). */
	closeLabel: string
}>()

defineEmits<{
	toggle: []
}>()
</script>

<template>
	<button
		type="button"
		class="ui-panel-toggle"
		:aria-label="open ? closeLabel : openLabel"
		:aria-expanded="open"
		@click.stop="$emit('toggle')"
	>
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
			<path
				v-if="open"
				d="M9 2L4 7l5 5"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="square"
				stroke-linejoin="miter"
			/>
			<path
				v-else
				d="M5 2l5 5-5 5"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="square"
				stroke-linejoin="miter"
			/>
		</svg>
	</button>
</template>
