/**
 * Color schemes for the activity chart. Each theme has 5 colors, index 0 is "no activity".
 * Ported from githubchart-rust `COLOR_SCHEMES`.
 */
export const THEMES: Record<string, readonly string[]> = {
	default: ['#F0F3F8', '#9CE2A8', '#39C651', '#339944', '#20602A'],
	dark: ['#191C1F', '#0A431D', '#0D5926', '#1AB34D', '#2BE168'],
}

/** Theme used when the route param is omitted. */
export const DEFAULT_THEME = 'default'
