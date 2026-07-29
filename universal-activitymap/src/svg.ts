import type { ActivityDay } from './providers/types.ts'
import type { Theme } from './themes.ts'

const CUBE_SIZE = 12
const X_PAD = 27
const Y_PAD = 20
const DAYS_PER_WEEK = 7
const MIN_MONTH_LABEL_GAP = 40

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LABELS = ['Mon', 'Wed', 'Fri']

/** Cell shape presets, selected by the `style` query param. Maps to the rect corner radius. */
export type Style = 'default' | 'square' | 'round'
export const STYLES: readonly Style[] = ['default', 'square', 'round']
const STYLE_RX: Record<Style, number> = { default: 2, square: 0, round: 5 }

/** @returns true when the value is a known {@link Style} */
export const isStyle = (value: string): value is Style => (STYLES as readonly string[]).includes(value)

/** Presentation options applied at render time. */
export interface RenderOptions {
	/** cell shape preset, defaults to `default` */
	readonly style?: Style
}

const TEXT_STYLE =
	"fill:#767676;text-anchor:start;text-align:center;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';white-space:nowrap;"

interface Point {
	date: string
	level: number
}

/**
 * Maps an intensity level onto the theme colors, clamping to the highest bucket.
 * @param level - intensity bucket from 0 upwards
 * @param colors - theme colors, index 0 is "no activity"
 * @returns hex color for the cell
 */
const pointColor = (level: number, colors: readonly string[]): string => {
	const index = Math.min(Math.max(level, 0), colors.length - 1)
	return colors[index] ?? colors[0] ?? '#eeeeee'
}

/**
 * Lays days out as a week-column grid (7 rows, one column per week).
 * @param days - activity days sorted ascending by date
 * @returns grid indexed by `[week][weekday]`
 */
const matrix = (days: ActivityDay[]): Point[][] => {
	const weeks = Math.max(1, Math.ceil(days.length / DAYS_PER_WEEK))
	const grid: Point[][] = Array.from({ length: weeks }, () =>
		Array.from({ length: DAYS_PER_WEEK }, () => ({ date: '', level: -1 })),
	)
	for (const [i, day] of days.entries()) {
		const week = Math.floor(i / DAYS_PER_WEEK)
		const weekday = i % DAYS_PER_WEEK
		const column = grid[week]
		if (column) column[weekday] = { date: day.date, level: day.level }
	}
	return grid
}

/**
 * Adds one `<rect>` per day to the svg body.
 * @param grid - week-column grid from {@link matrix}
 * @param colors - theme colors
 * @param style - cell shape preset controlling corner radius
 * @returns svg fragment with all day cells
 */
const renderPoints = (grid: Point[][], colors: readonly string[], style: Style): string => {
	const rx = STYLE_RX[style]
	let out = ''
	for (const [x, week] of grid.entries()) {
		for (const [y, point] of week.entries()) {
			if (point.level < 0 || !point.date.includes('-')) continue
			out += `<rect x="${x * CUBE_SIZE + X_PAD}" y="${y * CUBE_SIZE + Y_PAD}" rx="${rx}" ry="${rx}" width="10" height="10" style="fill:${pointColor(point.level, colors)};" data-level="${point.level}" data-date="${point.date}" />`
		}
	}
	return out
}

/**
 * Adds Mon/Wed/Fri labels on the y-axis.
 * @returns svg fragment with weekday labels
 */
const renderWeekdays = (): string => {
	let out = ''
	for (const [i, day] of WEEKDAY_LABELS.entries()) {
		out += `<text x="0" y="${CUBE_SIZE * (i * 2 + 1) + 28}" style="${TEXT_STYLE}font-size:9px;display:block;">${day}</text>`
	}
	return out
}

/**
 * Adds up to 12 month labels on the x-axis, starting at the month of the first day.
 * @param days - activity days sorted ascending by date
 * @returns svg fragment with month labels
 */
const renderMonths = (days: ActivityDay[]): string => {
	const first = days[0]
	if (!first) return ''

	const startMonth = Number.parseInt(first.date.slice(5, 7), 10) || 1
	let currentMonth = startMonth - 1
	let lastX = 0
	let out = ''

	for (let i = 0; i < 12; i++) {
		const x = Math.floor((CUBE_SIZE * (i * 30)) / DAYS_PER_WEEK) + X_PAD
		if (i === 0 || x >= lastX + MIN_MONTH_LABEL_GAP) {
			out += `<text x="${x}" y="10" style="${TEXT_STYLE}font-size:10px;">${MONTHS[currentMonth]}</text>`
			lastX = x
		}
		currentMonth = (currentMonth + 1) % 12
	}
	return out
}

/**
 * Builds the dark-mode override block for auto themes. Cells keep their light inline fill; the
 * `!important` rules win over inline styles when the viewer's system is in dark mode.
 * @param dark - dark overrides from the theme
 * @returns svg style element with the media query
 */
const renderDarkStyle = (dark: NonNullable<Theme['dark']>): string => {
	const cells = dark.cells.map((color, i) => `rect[data-level="${i}"]{fill:${color} !important;}`).join('')
	return `<style>@media (prefers-color-scheme: dark) {${cells}text{fill:${dark.text} !important;}}</style>`
}

/**
 * Renders the activity chart as a standalone SVG document.
 * @param days - activity days sorted ascending by date
 * @param theme - theme with cell colors and optional dark-mode overrides
 * @param options - presentation options (cell shape)
 * @returns svg markup
 */
export const renderChart = (days: ActivityDay[], theme: Theme, options: RenderOptions = {}): string => {
	const style: Style = options.style ?? 'default'
	const grid = matrix(days)
	const width = CUBE_SIZE * grid.length + X_PAD
	const height = CUBE_SIZE * DAYS_PER_WEEK + Y_PAD
	const darkStyle = theme.dark ? renderDarkStyle(theme.dark) : ''

	return `<svg width="${width}" height="${height}" version="1.1" xmlns="http://www.w3.org/2000/svg">${darkStyle}${renderPoints(grid, theme.cells, style)}${renderWeekdays()}${renderMonths(days)}</svg>`
}
