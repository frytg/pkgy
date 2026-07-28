import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderChart } from './svg.ts'
import { THEMES } from './themes.ts'

const theme = THEMES.default ?? []

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

	it('maps levels onto theme colors with clamping', () => {
		const svg = renderChart([{ date: '2025-01-06', level: 99 }], theme)
		assert.ok(svg.includes(`fill:${theme[4]}`))
	})

	it('renders weekday and month labels', () => {
		const svg = renderChart([{ date: '2025-03-01', level: 1 }], theme)
		assert.ok(svg.includes('>Mon</text>'))
		assert.ok(svg.includes('>Mar</text>'))
	})
})
