/**
 * Color schemes for the activity chart. Each theme has 5 cell colors, index 0 is "no activity".
 * `default` and `dark` are ported from githubchart-rust `COLOR_SCHEMES`.
 * Themes with a `dark` block are "auto" themes: they render with the light `cells` and flip to the
 * dark overrides through a `prefers-color-scheme` media query embedded in the svg, so a single URL
 * follows the viewer's system setting.
 */
export interface Theme {
	/** cell colors, index 0 is "no activity" */
	readonly cells: readonly string[]
	/** dark-mode overrides for auto themes, applied via prefers-color-scheme */
	readonly dark?: {
		/** dark cell colors, index 0 is "no activity" */
		readonly cells: readonly string[]
		/** label color in dark mode (light-mode labels stay #767676) */
		readonly text: string
	}
}

/** Label color shared by all auto themes in dark mode. */
const DARK_TEXT = '#9198A1'

const DEFAULT_CELLS = ['#F0F3F8', '#9CE2A8', '#39C651', '#339944', '#20602A'] as const
const DARK_CELLS = ['#191C1F', '#0A431D', '#0D5926', '#1AB34D', '#2BE168'] as const
const BLUESKY_CELLS = ['#F0F3F8', '#A6D7FF', '#59B0FF', '#0A84FF', '#0A5CB8'] as const
const MASTODON_CELLS = ['#F0F3F8', '#C0BDF5', '#9B93F0', '#6364FF', '#3E3D9E'] as const

export const THEMES: Record<string, Theme> = {
	default: { cells: DEFAULT_CELLS },
	'default-auto': {
		cells: DEFAULT_CELLS,
		dark: { cells: DARK_CELLS, text: DARK_TEXT },
	},
	dark: { cells: DARK_CELLS },
	bluesky: { cells: BLUESKY_CELLS },
	'bluesky-auto': {
		cells: BLUESKY_CELLS,
		dark: { cells: ['#191C1F', '#123C62', '#0960B1', '#0085FF', '#80C2FF'], text: DARK_TEXT },
	},
	mastodon: { cells: MASTODON_CELLS },
	'mastodon-auto': {
		cells: MASTODON_CELLS,
		dark: { cells: ['#191C1F', '#2F3262', '#494BB1', '#6364FF', '#B1B2FF'], text: DARK_TEXT },
	},
}

/** Theme used when the route param is omitted. */
export const DEFAULT_THEME = 'default'
