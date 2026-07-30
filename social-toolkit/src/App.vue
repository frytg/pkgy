<script setup lang="ts">
import { computed, ref } from 'vue'

import { DEFAULT_TOOL_ID, FLEET_TOOLS, getFleetTool } from './tools/registry.ts'

const activeToolId = ref(DEFAULT_TOOL_ID)
const activeTool = computed(() => getFleetTool(activeToolId.value))
</script>

<template>
	<div class="flex h-full flex-col bg-mid-dark-greeny">
		<header
			class="flex shrink-0 flex-col gap-2 border-b border-[var(--line)] px-3 pt-[max(0.625rem,var(--safe-top))] pb-2 sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-2.5"
		>
			<div class="min-w-0 shrink-0">
				<p class="text-[11px] font-medium tracking-[0.12em] text-[var(--faint)] uppercase">FRYTG socials</p>
				<p class="truncate text-[13px] text-primary/90">{{ activeTool.label }}</p>
				<p class="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[var(--faint)]">
					<a class="ui-link" href="https://www.frytg.digital" target="_blank" rel="noopener noreferrer"
						>www.frytg.digital</a
					>
					<a
						class="ui-link"
						href="https://github.com/frytg/pkgy/tree/main/social-toolkit"
						target="_blank"
						rel="noopener noreferrer"
						>repo</a
					>
				</p>
			</div>

			<nav
				class="-mx-3 flex [scrollbar-width:none] gap-1 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:ml-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
				aria-label="Tools"
			>
				<button
					v-for="tool in FLEET_TOOLS"
					:key="tool.id"
					type="button"
					class="ui-tab shrink-0"
					:class="{ 'is-active': activeToolId === tool.id }"
					:title="tool.blurb"
					@click="activeToolId = tool.id"
				>
					{{ tool.label }}
				</button>
			</nav>
		</header>

		<main class="min-h-0 flex-1">
			<component :is="activeTool.component" />
		</main>
	</div>
</template>
