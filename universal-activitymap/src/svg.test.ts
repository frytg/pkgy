import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderChart } from './svg.ts'
import { THEMES } from './themes.ts'

const theme = THEMES.default ?? { cells: [] }

describe('renderChart', () => {
	it('renders an svg with one rect per day', () => {
		const days = [
			{ date: '2025-01-05', level: 0 },
			{ date: '2025-01-06', level: 2 },
			{ date: '2025-01-07', level: 4 },
		]
		const svg = renderChart(days, theme)

		assert.ok(svg.startsWith('<svg'))
		assert.ok(svg.endsWith('</svg>'))
		assert.equal(svg.match(/<rect /g)?.length, 3)
		assert.ok(svg.includes('data-date="2025-01-06"'))
	})

	it('renders no style block for static themes', () => {
		const svg = renderChart([{ date: '2025-01-06', level: 1 }], theme)
		assert.ok(!svg.includes('<style>'))
	})

	it('maps levels onto theme colors with clamping', () => {
		const svg = renderChart([{ date: '2025-01-06', level: 99 }], theme)
		assert.ok(svg.includes(`fill:${theme.cells[4]}`))
	})

	it('renders weekday and month labels', () => {
		const svg = renderChart([{ date: '2025-03-01', level: 1 }], theme)
		assert.ok(svg.includes('>Mon</text>'))
		assert.ok(svg.includes('>Mar</text>'))
	})

	describe('auto themes', () => {
		it('embeds a prefers-color-scheme override per level', () => {
			const auto = THEMES['default-auto']
			assert.ok(auto?.dark)
			const svg = renderChart([{ date: '2025-01-06', level: 2 }], auto)

			assert.ok(svg.includes('<style>@media (prefers-color-scheme: dark) {'))
			for (const [i, color] of auto.dark.cells.entries()) {
				assert.ok(svg.includes(`rect[data-level="${i}"]{fill:${color} !important;}`))
			}
			assert.ok(svg.includes(`text{fill:${auto.dark.text} !important;}`))
		})

		it('keeps the light colors inline so light mode is unaffected', () => {
			const auto = THEMES['default-auto']
			assert.ok(auto?.dark)
			const svg = renderChart([{ date: '2025-01-06', level: 2 }], auto)
			assert.ok(svg.includes(`style="fill:${auto.cells[2]};"`))
		})

		it('gives every auto theme a dark override', () => {
			for (const name of ['default-auto', 'bluesky-auto', 'mastodon-auto']) {
				assert.ok(THEMES[name]?.dark, `${name} should have a dark block`)
			}
		})
	})

	describe('styles', () => {
		it('defaults to the rounded rect (rx=2)', () => {
			const svg = renderChart([{ date: '2025-01-06', level: 1 }], theme)
			assert.ok(svg.includes('rx="2" ry="2"'))
		})

		it('renders square corners with style=square', () => {
			const svg = renderChart([{ date: '2025-01-06', level: 1 }], theme, { style: 'square' })
			assert.ok(svg.includes('rx="0" ry="0"'))
		})

		it('renders fully rounded corners with style=round', () => {
			const svg = renderChart([{ date: '2025-01-06', level: 1 }], theme, { style: 'round' })
			assert.ok(svg.includes('rx="5" ry="5"'))
		})
	})
})
