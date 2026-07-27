import type { Component } from 'vue'

import GpxOverlayTool from './gpx-overlay/GpxOverlayTool.vue'
import HalftoneTool from './halftone/HalftoneTool.vue'

/** One instrument in the social-image fleet. */
export type FleetTool = {
	id: string
	label: string
	blurb: string
	component: Component
}

/** Registered tools shown in the fleet switcher. */
export const FLEET_TOOLS: FleetTool[] = [
	{
		id: 'halftone',
		label: 'Halftone',
		blurb: 'Raster motif from any image',
		component: HalftoneTool,
	},
	{
		id: 'gpx-overlay',
		label: 'GPX Overlay',
		blurb: 'Transparent track · elevation · heart rate',
		component: GpxOverlayTool,
	},
]

/** Default tool opened on launch. */
export const DEFAULT_TOOL_ID = FLEET_TOOLS[0].id

/**
 * Looks up a fleet tool by id.
 * @param id - Tool id
 * @returns Matching tool or the default tool
 */
export const getFleetTool = (id: string): FleetTool => {
	return FLEET_TOOLS.find((tool) => tool.id === id) ?? FLEET_TOOLS[0]
}
