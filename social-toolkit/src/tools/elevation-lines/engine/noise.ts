/**
 * Hashes three integers into a 32-bit unit float in [0, 1).
 * @param x - X lattice coordinate
 * @param y - Y lattice coordinate
 * @param seed - Terrain seed
 * @returns Pseudo-random value in [0, 1)
 */
const hash2 = (x: number, y: number, seed: number): number => {
	let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
	n = Math.imul(n ^ (n >>> 13), 1274126177)
	n = n ^ (n >>> 16)
	return (n >>> 0) / 4294967296
}

/**
 * Quintic smoothstep for C2-continuous value noise.
 * @param t - Interpolation factor in [0, 1]
 * @returns Smoothed factor
 */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/**
 * Linear interpolation.
 * @param a - Start
 * @param b - End
 * @param t - Mix factor
 * @returns Interpolated value
 */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * 2D value noise with quintic interpolation.
 * @param x - World X
 * @param y - World Y
 * @param seed - Terrain seed
 * @returns Noise in roughly [0, 1]
 */
export const valueNoise2 = (x: number, y: number, seed: number): number => {
	const x0 = Math.floor(x)
	const y0 = Math.floor(y)
	const fx = fade(x - x0)
	const fy = fade(y - y0)
	const v00 = hash2(x0, y0, seed)
	const v10 = hash2(x0 + 1, y0, seed)
	const v01 = hash2(x0, y0 + 1, seed)
	const v11 = hash2(x0 + 1, y0 + 1, seed)
	return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy)
}

/**
 * Fractal Brownian motion from stacked value-noise octaves.
 * @param x - World X
 * @param y - World Y
 * @param seed - Terrain seed
 * @param octaves - Number of octaves (≥1)
 * @param lacunarity - Frequency multiplier per octave
 * @param gain - Amplitude multiplier per octave
 * @returns Noise roughly in [0, 1]
 */
export const fbm2 = (x: number, y: number, seed: number, octaves: number, lacunarity = 2, gain = 0.5): number => {
	let sum = 0
	let amp = 0.5
	let freq = 1
	let norm = 0
	const count = Math.max(1, Math.floor(octaves))
	for (let octave = 0; octave < count; octave += 1) {
		sum += valueNoise2(x * freq, y * freq, seed + octave * 1013) * amp
		norm += amp
		freq *= lacunarity
		amp *= gain
	}
	return sum / Math.max(norm, 1e-9)
}

/**
 * Ridged multifractal — absolute noise folded into sharp crests.
 * @param x - World X
 * @param y - World Y
 * @param seed - Terrain seed
 * @param octaves - Number of octaves
 * @returns Ridged signal roughly in [0, 1]
 */
export const ridgedFbm2 = (x: number, y: number, seed: number, octaves: number): number => {
	let sum = 0
	let amp = 0.5
	let freq = 1
	let weight = 1
	let norm = 0
	const count = Math.max(1, Math.floor(octaves))
	for (let octave = 0; octave < count; octave += 1) {
		let signal = valueNoise2(x * freq, y * freq, seed + 7001 + octave * 131)
		signal = 1 - Math.abs(signal * 2 - 1)
		signal *= signal
		signal *= weight
		weight = Math.min(1, Math.max(0, signal * 1.5))
		sum += signal * amp
		norm += amp
		freq *= 2
		amp *= 0.5
	}
	return sum / Math.max(norm, 1e-9)
}

/**
 * A few large gaussian hills/basins so nested contour families form.
 * @param x - Normalized X
 * @param y - Normalized Y
 * @param seed - Terrain seed
 * @returns Bias in roughly [-0.35, 0.55]
 */
const featureHills = (x: number, y: number, seed: number): number => {
	let sum = 0
	const features = 5
	for (let i = 0; i < features; i += 1) {
		const px = hash2(i * 3 + 1, 11, seed)
		const py = hash2(i * 3 + 2, 29, seed)
		const sign = hash2(i * 3 + 3, 47, seed) > 0.55 ? -1 : 1
		const radius = 0.12 + hash2(i * 3 + 4, 67, seed) * 0.22
		const amp = (0.18 + hash2(i * 3 + 5, 89, seed) * 0.32) * sign
		const dx = x - px
		const dy = y - py
		const d2 = (dx * dx + dy * dy) / (radius * radius)
		sum += amp * Math.exp(-d2 * 2.4)
	}
	return sum
}

/**
 * Domain-warped terrain height in [0, 1].
 * Combines smooth fBm with optional ridged peaks so contours nest like real topo.
 * @param x - Normalized X in roughly [0, 1] domain (may extend slightly)
 * @param y - Normalized Y
 * @param seed - Terrain seed
 * @param frequency - Base frequency
 * @param octaves - Detail octaves
 * @param warp - Domain warp strength
 * @param ridged - Mix toward ridged multifractal [0, 1]
 * @returns Height in [0, 1]
 */
export const terrainHeight = (
	x: number,
	y: number,
	seed: number,
	frequency: number,
	octaves: number,
	warp: number,
	ridged: number,
): number => {
	const fx = x * frequency
	const fy = y * frequency
	const warpScale = Math.max(0, warp)
	const wx = fbm2(fx + 19.1, fy + 7.3, seed + 17, Math.max(1, octaves - 1))
	const wy = fbm2(fx + 41.2, fy + 23.8, seed + 91, Math.max(1, octaves - 1))
	const ux = fx + (wx * 2 - 1) * warpScale
	const uy = fy + (wy * 2 - 1) * warpScale

	const smooth = fbm2(ux, uy, seed, octaves)
	const ridge = ridgedFbm2(ux * 0.85, uy * 0.85, seed + 303, octaves)
	const mix = Math.min(1, Math.max(0, ridged))
	let h = smooth * (1 - mix) + ridge * mix

	// Macro hills / bowls give nested contour families like a real sheet.
	h = h * 0.62 + 0.38 * (featureHills(x, y, seed) * 0.5 + 0.5)

	// Soft radial vignette so edge contours tend to close inside the frame,
	// the way a mapped sheet crops a local high rather than a flat plateau.
	const cx = x - 0.5
	const cy = y - 0.5
	const r = Math.sqrt(cx * cx + cy * cy)
	const edge = Math.min(1, Math.max(0, (r - 0.12) / 0.62))
	const edgeEase = edge * edge * (3 - 2 * edge)
	h = h * (1 - edgeEase * 0.72) + 0.04 * edgeEase

	return Math.min(1, Math.max(0, h))
}
