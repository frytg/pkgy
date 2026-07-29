import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_THEME, THEMES } from './themes.ts'

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

describe('THEMES', () => {
	it('has the fallback theme', () => {
		assert.ok(THEMES[DEFAULT_THEME])
	})

	it('gives every theme 5 hex cell colors', () => {
		for (const [name, theme] of Object.entries(THEMES)) {
			assert.equal(theme.cells.length, 5, `${name} cells`)
			for (const color of theme.cells) {
				assert.match(color, HEX_COLOR, `${name} cell ${color}`)
			}
		}
	})

	it('gives every dark override 5 hex cell colors and a text color', () => {
		for (const [name, theme] of Object.entries(THEMES)) {
			if (!theme.dark) continue
			assert.equal(theme.dark.cells.length, 5, `${name} dark cells`)
			for (const color of theme.dark.cells) {
				assert.match(color, HEX_COLOR, `${name} dark cell ${color}`)
			}
			assert.match(theme.dark.text, HEX_COLOR, `${name} dark text`)
		}
	})
})
