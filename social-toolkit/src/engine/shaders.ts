/** Fullscreen clip-space quad. */
export const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Samples the source image into the viewport with contain/cover framing.
 * fitMode: 0 = contain, 1 = cover.
 */
export const IMAGE_PASS_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uSource;
uniform vec2 uImageSize;
uniform vec2 uViewSize;
uniform float uZoom;
uniform float uContrast;
uniform float uFitMode;

varying vec2 vUv;

vec2 framedUv(vec2 uv, float imageAspect, float viewAspect, float fitMode) {
	vec2 mapped = uv;
	bool imageIsWider = imageAspect > viewAspect;

	if (fitMode > 0.5) {
		// Cover: scale the shorter axis so the frame is filled.
		if (imageIsWider) {
			float axis = viewAspect / imageAspect;
			mapped.x = (uv.x - 0.5) * axis + 0.5;
		} else {
			float axis = imageAspect / viewAspect;
			mapped.y = (uv.y - 0.5) * axis + 0.5;
		}
	} else if (imageIsWider) {
		float axis = viewAspect / imageAspect;
		mapped.y = (uv.y - 0.5) / axis + 0.5;
	} else {
		float axis = imageAspect / viewAspect;
		mapped.x = (uv.x - 0.5) / axis + 0.5;
	}

	return (mapped - 0.5) / max(uZoom, 0.001) + 0.5;
}

void main() {
	float imageAspect = uImageSize.x / max(uImageSize.y, 1.0);
	float viewAspect = uViewSize.x / max(uViewSize.y, 1.0);
	vec2 sampleUv = framedUv(vUv, imageAspect, viewAspect, uFitMode);

	float inside =
		step(0.0, sampleUv.x) * step(sampleUv.x, 1.0) *
		step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);

	vec4 texel = texture2D(uSource, clamp(sampleUv, 0.0, 1.0));
	vec3 graded = (texel.rgb - 0.5) * uContrast + 0.5;

	gl_FragColor = vec4(clamp(graded, 0.0, 1.0), inside * texel.a);
}
`

/**
 * Rasterizes a luminance field into a grid of ink motifs.
 * uShape: 0 bar, 1 circle, 2 square, 3 vertical, 4 cross, 5 diamond.
 */
export const HALFTONE_PASS_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uField;
uniform vec2 uPixelSize;
uniform vec2 uLogicalSize;
uniform float uCellPx;
uniform float uBias;
uniform float uStroke;
uniform float uNoise;
uniform float uInvert;
uniform float uFloor;
uniform float uActive;
uniform float uShape;
uniform vec3 uInk;
uniform float uDensityScale;
uniform float uClipEmpty;

varying vec2 vUv;

float softEdge(float distanceField, float aa) {
	return 1.0 - smoothstep(0.0, max(aa, 0.0001), distanceField);
}

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float motifBar(vec2 local, float extent, float weight, bool upright) {
	vec2 centered = local - 0.5;
	vec2 box = upright
		? abs(centered) - vec2(weight * extent * 0.5, extent)
		: abs(centered) - vec2(extent, weight * extent * 0.5);
	float outside = length(max(box, 0.0));
	float inside = min(max(box.x, box.y), 0.0);
	return outside + inside;
}

float motifDisk(vec2 local, float radius) {
	return length(local - 0.5) - radius;
}

float motifBox(vec2 local, float halfExtent) {
	vec2 d = abs(local - 0.5) - vec2(halfExtent);
	return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float motifDiamond(vec2 local, float halfExtent) {
	vec2 d = abs(local - 0.5);
	return (d.x + d.y) - halfExtent;
}

float motifForShape(vec2 local, float amount, float weight, float shapeId) {
	float w = clamp(weight, 0.05, 1.4);
	float fill = mix(0.5, 1.0, (w - 0.05) / 1.35);

	if (shapeId < 0.5) {
		return motifBar(local, amount, w, false);
	}
	if (shapeId < 1.5) {
		return motifDisk(local, amount * fill * 0.5);
	}
	if (shapeId < 2.5) {
		return motifBox(local, amount * mix(0.42, 0.9, fill) * 0.5);
	}
	if (shapeId < 3.5) {
		return motifBar(local, amount, w, true);
	}
	if (shapeId < 4.5) {
		return min(motifBar(local, amount, w, false), motifBar(local, amount, w, true));
	}
	return motifDiamond(local, amount * mix(0.5, 1.0, fill) * 0.5);
}

float luma(vec3 rgb) {
	return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
	if (uClipEmpty > 0.5) {
		float fieldAlpha = texture2D(uField, vUv).a;
		if (fieldAlpha < 0.01) {
			gl_FragColor = vec4(0.0);
			return;
		}
	}

	if (uActive < 0.5) {
		gl_FragColor = texture2D(uField, vUv);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
		return;
	}

	vec2 pixel = (gl_FragCoord.xy / max(uPixelSize, vec2(1.0))) * uLogicalSize;
	float cell = max(uCellPx * max(uDensityScale, 0.001), 1.0);
	vec2 cellId = floor(pixel / cell);
	vec2 probeUv = clamp((cellId + 0.5) * cell / uLogicalSize, vec2(0.0), vec2(1.0));
	vec2 local = fract(pixel / cell);

	vec4 probe = texture2D(uField, probeUv);
	float presence = smoothstep(0.015, 0.09, probe.a);
	float tone = luma(probe.rgb);
	if (uInvert > 0.5) {
		tone = 1.0 - tone;
	}

	// Noise = per-cell random bias (same units as uBias), no scatter/rotation.
	float noise = clamp(uNoise, 0.0, 1.0);
	float toneJitter = (hash21(cellId) - 0.5) * 2.0 * noise;
	float biased = clamp(tone + (uBias + toneJitter) * 0.33, 0.0, 1.0);
	float amount = max(biased, uFloor) * 0.92;

	float coverage = 0.0;
	if (amount > 0.0001) {
		float distanceField = motifForShape(local, amount, uStroke, uShape);
		coverage = softEdge(distanceField, 0.018) * presence;
	}

	gl_FragColor = vec4(uInk * coverage, coverage);

	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`
