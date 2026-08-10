/** Which overlay layers to draw. */
export type GpxOverlayLayers = {
	track: boolean
	elevation: boolean
	heartRate: boolean
}

/** Visual settings for the GPX overlay tool. */
export type GpxOverlaySettings = {
	layers: GpxOverlayLayers
	strokeColor: string
	elevationColor: string
	heartRateColor: string
	strokeWidth: number
	padding: number
	chartHeightRatio: number
	showStartEnd: boolean
}

export const DEFAULT_GPX_SETTINGS: GpxOverlaySettings = {
	layers: {
		track: true,
		elevation: false,
		heartRate: false,
	},
	strokeColor: '#FFFF11',
	elevationColor: '#D6E1CB',
	heartRateColor: '#F09139',
	strokeWidth: 3,
	padding: 48,
	chartHeightRatio: 0.28,
	showStartEnd: true,
}
