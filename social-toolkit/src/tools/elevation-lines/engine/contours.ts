import { sampleHeight, type Heightfield } from './heightfield.ts'

/** A single 2D point in grid coordinates (x = col, y = row). */
export type ContourPoint = { x: number; y: number }

/**
 * One closed or open contour polyline at a single elevation.
 * Closed rings follow map convention: outer boundaries CCW, holes CW
 * when viewed with y increasing downward (canvas / SVG space).
 */
export type ContourLine = {
	/** Isoline elevation in [0, 1] heightfield units. */
	level: number
	/** Zero-based level index (0 = lowest drawn contour). */
	levelIndex: number
	/** True when every Nth contour is an index (cartographic) line. */
	isIndex: boolean
	/** True when first and last vertices coincide (closed ring). */
	closed: boolean
	/** Polyline vertices in grid coordinates. */
	points: ContourPoint[]
	/**
	 * Signed area in grid space (y-down). Positive ⇒ CCW on screen.
	 * Outer highs / basin walls tend CCW; interior depressions CW.
	 */
	signedArea: number
	/** Nesting depth among closed rings across levels (0 = outermost). */
	nestDepth: number
	/** True when the ring encloses a depression (interior below the isoline). */
	isHole: boolean
}

/** Horizontal grid edge between (col,row) and (col+1,row). */
type HEdge = { kind: 'h'; col: number; row: number }
/** Vertical grid edge between (col,row) and (col,row+1). */
type VEdge = { kind: 'v'; col: number; row: number }
type GridEdge = HEdge | VEdge

/**
 * Stable string key for a grid edge.
 * @param edge - Grid edge
 * @returns Key
 */
const edgeKey = (edge: GridEdge): string =>
	edge.kind === 'h' ? `h:${edge.col},${edge.row}` : `v:${edge.col},${edge.row}`

/**
 * Linear interpolate a crossing on a grid edge.
 * @param field - Height grid
 * @param edge - Edge that crosses the level
 * @param level - Isoline value
 * @returns Crossing point in grid coordinates
 */
const pointOnEdge = (field: Heightfield, edge: GridEdge, level: number): ContourPoint => {
	if (edge.kind === 'h') {
		const h0 = field.data[edge.row * field.cols + edge.col]
		const h1 = field.data[edge.row * field.cols + edge.col + 1]
		const denom = h1 - h0
		const t = Math.abs(denom) < 1e-12 ? 0.5 : (level - h0) / denom
		const u = Math.min(1, Math.max(0, t))
		return { x: edge.col + u, y: edge.row }
	}
	const h0 = field.data[edge.row * field.cols + edge.col]
	const h1 = field.data[(edge.row + 1) * field.cols + edge.col]
	const denom = h1 - h0
	const t = Math.abs(denom) < 1e-12 ? 0.5 : (level - h0) / denom
	const u = Math.min(1, Math.max(0, t))
	return { x: edge.col, y: edge.row + u }
}

/**
 * Signed polygon area with y increasing downward (canvas space).
 * Positive ⇒ counter-clockwise on screen.
 * @param points - Ring vertices (open or with repeated close)
 * @returns Signed area
 */
export const signedAreaYDown = (points: ContourPoint[]): number => {
	if (points.length < 3) {
		return 0
	}
	let area = 0
	const n = points.length
	const last = points[n - 1]
	const first = points[0]
	const count = Math.hypot(last.x - first.x, last.y - first.y) < 1e-6 ? n - 1 : n
	for (let i = 0; i < count; i += 1) {
		const a = points[i]
		const b = points[(i + 1) % count]
		area += a.x * b.y - b.x * a.y
	}
	return area / 2
}

/**
 * Tests whether point p is inside ring (ray cast, y-down space).
 * @param ring - Closed ring vertices
 * @param p - Query point
 * @returns True if inside
 */
export const pointInRing = (ring: ContourPoint[], p: ContourPoint): boolean => {
	const n = ring.length
	const last = ring[n - 1]
	const first = ring[0]
	const count = Math.hypot(last.x - first.x, last.y - first.y) < 1e-6 ? n - 1 : n
	let inside = false
	for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
		const a = ring[i]
		const b = ring[j]
		const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 0.0) + a.x
		if (intersect) {
			inside = !inside
		}
	}
	return inside
}

/**
 * Ring centroid (average of vertices).
 * @param points - Vertices
 * @returns Centroid
 */
const centroid = (points: ContourPoint[]): ContourPoint => {
	const n = points.length
	const last = points[n - 1]
	const first = points[0]
	const count = Math.hypot(last.x - first.x, last.y - first.y) < 1e-6 ? n - 1 : n
	let x = 0
	let y = 0
	for (let i = 0; i < count; i += 1) {
		x += points[i].x
		y += points[i].y
	}
	return { x: x / Math.max(count, 1), y: y / Math.max(count, 1) }
}

/**
 * Reverses a polyline without mutating the input.
 * @param points - Input
 * @returns Reversed copy
 */
const reversePoints = (points: ContourPoint[]): ContourPoint[] => {
	const out: ContourPoint[] = []
	for (let i = points.length - 1; i >= 0; i -= 1) {
		out.push(points[i])
	}
	return out
}

/**
 * Corner above-or-equal mask for one cell (bit0=BL, bit1=BR, bit2=TR, bit3=TL).
 * @param field - Height grid
 * @param col - Cell column
 * @param row - Cell row
 * @param level - Isoline
 * @returns Case index 0–15
 */
const cellCase = (field: Heightfield, col: number, row: number, level: number): number => {
	const { cols, data } = field
	const hBl = data[row * cols + col]
	const hBr = data[row * cols + col + 1]
	const hTr = data[(row + 1) * cols + col + 1]
	const hTl = data[(row + 1) * cols + col]
	const b0 = hBl >= level ? 1 : 0
	const b1 = hBr >= level ? 1 : 0
	const b2 = hTr >= level ? 1 : 0
	const b3 = hTl >= level ? 1 : 0
	return b0 | (b1 << 1) | (b2 << 2) | (b3 << 3)
}

/**
 * Directed edge pairs for a marching-squares case inside one cell.
 * Edges: 0=bottom(h,col,row), 1=right(v,col+1,row), 2=top(h,col,row+1), 3=left(v,col,row).
 * @param col - Cell column
 * @param row - Cell row
 * @param code - Case 0–15
 * @param field - Height grid (for saddle disambiguation)
 * @param level - Isoline
 * @returns List of [fromEdge, toEdge]
 */
const cellSegments = (
	col: number,
	row: number,
	code: number,
	field: Heightfield,
	level: number,
): Array<[GridEdge, GridEdge]> => {
	const bottom: GridEdge = { kind: 'h', col, row }
	const right: GridEdge = { kind: 'v', col: col + 1, row }
	const top: GridEdge = { kind: 'h', col, row: row + 1 }
	const left: GridEdge = { kind: 'v', col, row }

	/**
	 * Saddle center height.
	 * @returns Average of four corners
	 */
	const center = (): number => {
		const { cols, data } = field
		return (
			(data[row * cols + col] +
				data[row * cols + col + 1] +
				data[(row + 1) * cols + col + 1] +
				data[(row + 1) * cols + col]) /
			4
		)
	}

	switch (code) {
		case 1:
			return [[left, bottom]]
		case 2:
			return [[bottom, right]]
		case 3:
			return [[left, right]]
		case 4:
			return [[right, top]]
		case 5:
			return center() >= level
				? [
						[left, top],
						[bottom, right],
					]
				: [
						[left, bottom],
						[right, top],
					]
		case 6:
			return [[bottom, top]]
		case 7:
			return [[left, top]]
		case 8:
			return [[top, left]]
		case 9:
			return [[top, bottom]]
		case 10:
			return center() >= level
				? [
						[bottom, left],
						[right, top],
					]
				: [
						[bottom, right],
						[top, left],
					]
		case 11:
			return [[top, right]]
		case 12:
			return [[right, left]]
		case 13:
			return [[right, bottom]]
		case 14:
			return [[bottom, left]]
		default:
			return []
	}
}

/**
 * Chains directed grid-edge segments into polylines.
 * Shared edges share identity keys, so adjacent cells join exactly.
 * @param segments - Directed [from, to] edge pairs
 * @param field - Height grid
 * @param level - Isoline value
 * @returns Polylines in grid coordinates
 */
const chainEdgeSegments = (
	segments: Array<[GridEdge, GridEdge]>,
	field: Heightfield,
	level: number,
): ContourPoint[][] => {
	const outgoing = new Map<string, string[]>()
	const edgeByKey = new Map<string, GridEdge>()

	for (const [from, to] of segments) {
		const fk = edgeKey(from)
		const tk = edgeKey(to)
		edgeByKey.set(fk, from)
		edgeByKey.set(tk, to)
		const list = outgoing.get(fk)
		if (list) {
			list.push(tk)
		} else {
			outgoing.set(fk, [tk])
		}
	}

	const inbound = new Map<string, number>()
	for (const targets of outgoing.values()) {
		for (const tk of targets) {
			inbound.set(tk, (inbound.get(tk) ?? 0) + 1)
		}
	}

	/**
	 * Pops one unused outgoing target from a key.
	 * @param fromKey - Start edge key
	 * @returns Target key or null
	 */
	const takeNext = (fromKey: string): string | null => {
		const list = outgoing.get(fromKey)
		if (!list || list.length === 0) {
			return null
		}
		return list.pop() ?? null
	}

	/**
	 * Whether any unused segment remains.
	 * @returns True if work left
	 */
	const hasOutgoing = (): boolean => {
		for (const list of outgoing.values()) {
			if (list.length > 0) {
				return true
			}
		}
		return false
	}

	/**
	 * Picks a start edge key, preferring dangling starts (open contours).
	 * @returns Edge key or null
	 */
	const pickStart = (): string | null => {
		let fallback: string | null = null
		for (const [key, list] of outgoing) {
			if (list.length === 0) {
				continue
			}
			if ((inbound.get(key) ?? 0) === 0) {
				return key
			}
			if (fallback === null) {
				fallback = key
			}
		}
		return fallback
	}

	const polylines: ContourPoint[][] = []

	while (hasOutgoing()) {
		const startKey = pickStart()
		if (!startKey) {
			break
		}

		const keys: string[] = [startKey]
		let current = startKey
		let guard = 0
		const maxSteps = segments.length + 2
		while (guard < maxSteps) {
			guard += 1
			const next = takeNext(current)
			if (!next) {
				break
			}
			keys.push(next)
			current = next
			if (next === startKey) {
				break
			}
		}

		const points: ContourPoint[] = []
		for (const key of keys) {
			const edge = edgeByKey.get(key)
			if (!edge) {
				continue
			}
			points.push(pointOnEdge(field, edge, level))
		}
		if (points.length >= 2) {
			polylines.push(points)
		}
	}

	return polylines
}

/**
 * Extracts raw polylines for one isolevel via marching squares.
 * @param field - Height grid
 * @param level - Isoline value
 * @returns Open and closed polylines in grid coords
 */
const extractLevelPolylines = (field: Heightfield, level: number): ContourPoint[][] => {
	const segments: Array<[GridEdge, GridEdge]> = []
	const { cols, rows } = field

	for (let row = 0; row < rows - 1; row += 1) {
		for (let col = 0; col < cols - 1; col += 1) {
			const code = cellCase(field, col, row, level)
			if (code === 0 || code === 15) {
				continue
			}
			for (const pair of cellSegments(col, row, code, field, level)) {
				segments.push(pair)
			}
		}
	}

	return chainEdgeSegments(segments, field, level)
}

/**
 * Closes a ring endpoint if it is already geometrically closed.
 * @param points - Polyline
 * @returns Points with matching end vertex when closed
 */
const ensureClosedEndpoint = (points: ContourPoint[]): ContourPoint[] => {
	if (points.length < 3) {
		return points
	}
	const first = points[0]
	const last = points[points.length - 1]
	if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-3) {
		const copy = points.slice()
		copy[copy.length - 1] = { ...first }
		return copy
	}
	return points
}

/**
 * Orients a single closed ring so higher ground lies to the left while walking
 * (y-down). That matches topo convention: hills wind CCW, depressions CW, and
 * every neighbor in a concentric family keeps the same left-side relationship.
 * @param points - Ring vertices
 * @param field - Height grid
 * @returns Oriented points + signed area
 */
const orientRingBySlope = (
	points: ContourPoint[],
	field: Heightfield,
): { points: ContourPoint[]; signedArea: number } => {
	const closedPts = ensureClosedEndpoint(points)
	const n =
		Math.hypot(
			closedPts[closedPts.length - 1].x - closedPts[0].x,
			closedPts[closedPts.length - 1].y - closedPts[0].y,
		) < 1e-3
			? closedPts.length - 1
			: closedPts.length
	if (n < 3) {
		return { points: closedPts, signedArea: signedAreaYDown(closedPts) }
	}

	let votes = 0
	let samples = 0
	const step = Math.max(1, Math.floor(n / 32))
	for (let i = 0; i < n; i += step) {
		const a = closedPts[i]
		const b = closedPts[(i + 1) % n]
		const dx = b.x - a.x
		const dy = b.y - a.y
		const len = Math.hypot(dx, dy) || 1
		// Left normal in y-down space.
		const nx = -dy / len
		const ny = dx / len
		const mx = (a.x + b.x) / 2
		const my = (a.y + b.y) / 2
		const eps = 0.4
		const hLeft = sampleHeight(field, mx + nx * eps, my + ny * eps)
		const hRight = sampleHeight(field, mx - nx * eps, my - ny * eps)
		if (hLeft !== hRight) {
			votes += hLeft > hRight ? 1 : -1
			samples += 1
		}
	}

	let oriented = closedPts
	if (samples > 0 && votes < 0) {
		// Higher ground is on the right — flip so neighbors share left-side uphill.
		oriented = ensureClosedEndpoint(reversePoints(closedPts))
	}
	return { points: oriented, signedArea: signedAreaYDown(oriented) }
}

/**
 * Assigns nesting depth across all closed rings (all levels) and marks
 * depressions: rings whose interior samples below the isoline (basin), as
 * opposed to hills whose interior sits above. Nested hill families share
 * winding; basin rings oppose them — the neighbor relationship on a real map.
 * @param contours - Fully built contour list (mutated)
 * @param field - Height grid for interior classification
 */
const assignNeighborhood = (contours: ContourLine[], field: Heightfield): void => {
	const closedIdx: number[] = []
	for (let i = 0; i < contours.length; i += 1) {
		if (contours[i].closed) {
			closedIdx.push(i)
		}
	}

	const areas = closedIdx.map((i) => Math.abs(contours[i].signedArea))
	const parents = closedIdx.map(() => -1)

	for (let a = 0; a < closedIdx.length; a += 1) {
		const ring = contours[closedIdx[a]]
		const c = centroid(ring.points)
		let best = -1
		let bestArea = Infinity
		for (let b = 0; b < closedIdx.length; b += 1) {
			if (a === b) {
				continue
			}
			const other = contours[closedIdx[b]]
			const otherArea = areas[b]
			if (otherArea <= areas[a]) {
				continue
			}
			if (pointInRing(other.points, c) && otherArea < bestArea) {
				bestArea = otherArea
				best = b
			}
		}
		parents[a] = best
	}

	/**
	 * Depth of closed ring a among nested neighbors.
	 * @param a - Index into closedIdx
	 * @returns Nest depth
	 */
	const depthOf = (a: number): number => {
		let depth = 0
		let cursor = a
		for (let step = 0; step < closedIdx.length + 1; step += 1) {
			const p = parents[cursor]
			if (p < 0) {
				return depth
			}
			depth += 1
			cursor = p
		}
		return depth
	}

	for (let a = 0; a < closedIdx.length; a += 1) {
		const line = contours[closedIdx[a]]
		line.nestDepth = depthOf(a)
		// Classify hill vs depression from interior height vs isoline.
		const c = centroid(line.points)
		// Nudge sample off the exact centroid toward ring interior mean.
		const hIn = sampleHeight(field, c.x, c.y)
		line.isHole = hIn < line.level
	}
}

/**
 * Builds contour lines for a heightfield.
 * @param field - Sampled terrain
 * @param levels - Number of contour intervals across the used height range
 * @param indexEvery - Every Nth contour is an index line (0/1 disables)
 * @returns Oriented contour polylines
 */
export const buildContours = (field: Heightfield, levels: number, indexEvery: number): ContourLine[] => {
	const count = Math.max(2, Math.floor(levels))
	// Trim extremes so we don't hug the frame with empty edge contours.
	const lo = 0.14
	const hi = 0.88
	const result: ContourLine[] = []

	for (let levelIndex = 0; levelIndex < count; levelIndex += 1) {
		const t = (levelIndex + 1) / (count + 1)
		const level = lo + (hi - lo) * t
		const polylines = extractLevelPolylines(field, level)
		const isIndex = indexEvery > 1 && (levelIndex + 1) % indexEvery === 0

		for (const raw of polylines) {
			if (raw.length < 2) {
				continue
			}
			const first = raw[0]
			const last = raw[raw.length - 1]
			const closed = raw.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-3

			if (closed) {
				const oriented = orientRingBySlope(raw, field)
				if (Math.abs(oriented.signedArea) < 0.35) {
					continue
				}
				result.push({
					level,
					levelIndex,
					isIndex,
					closed: true,
					points: oriented.points,
					signedArea: oriented.signedArea,
					nestDepth: 0,
					isHole: false,
				})
			} else {
				// Open contours that exit the sheet — still slope-orient when long enough.
				let points = raw
				if (raw.length >= 4) {
					const probe = orientRingBySlope([...raw, raw[0]], field)
					// If orientation flipped the synthetic close, flip the open run too.
					const flipped =
						probe.points.length > 1 &&
						Math.hypot(probe.points[0].x - raw[0].x, probe.points[0].y - raw[0].y) > 1e-3
					points = flipped ? reversePoints(raw) : raw
				}
				result.push({
					level,
					levelIndex,
					isIndex,
					closed: false,
					points,
					signedArea: 0,
					nestDepth: 0,
					isHole: false,
				})
			}
		}
	}

	assignNeighborhood(result, field)
	return result
}
