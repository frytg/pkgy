/** One GPS sample from a GPX track point. */
export type GpxPoint = {
	lat: number
	lon: number
	ele: number | null
	time: string | null
	hr: number | null
}

/** Parsed GPX activity summary. */
export type GpxTrack = {
	name: string
	points: GpxPoint[]
	hasElevation: boolean
	hasHeartRate: boolean
	distanceMeters: number
	elevationGainMeters: number
	minEle: number | null
	maxEle: number | null
	minHr: number | null
	maxHr: number | null
}

const EARTH_RADIUS_M = 6_371_000

/**
 * Degrees to radians.
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/**
 * Haversine distance between two lat/lon points in meters.
 * @param a - First point
 * @param b - Second point
 * @returns Distance in meters
 */
export const haversineMeters = (a: Pick<GpxPoint, 'lat' | 'lon'>, b: Pick<GpxPoint, 'lat' | 'lon'>): number => {
	const dLat = toRadians(b.lat - a.lat)
	const dLon = toRadians(b.lon - a.lon)
	const lat1 = toRadians(a.lat)
	const lat2 = toRadians(b.lat)
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Reads the first numeric text content matching any of the selectors under a node.
 * @param parent - Parent element
 * @param selectors - CSS selectors to try in order
 * @returns Parsed number or null
 */
const readNumber = (parent: Element, selectors: string[]): number | null => {
	for (const selector of selectors) {
		const node = parent.querySelector(selector)
		const text = node?.textContent?.trim()
		if (!text) {
			continue
		}
		const value = Number(text)
		if (Number.isFinite(value)) {
			return value
		}
	}
	return null
}

/**
 * Reads optional text content from the first matching selector.
 * @param parent - Parent element
 * @param selectors - CSS selectors to try in order
 * @returns Trimmed text or null
 */
const readText = (parent: Element, selectors: string[]): string | null => {
	for (const selector of selectors) {
		const node = parent.querySelector(selector)
		const text = node?.textContent?.trim()
		if (text) {
			return text
		}
	}
	return null
}

/**
 * Parses a single trackpoint element into a GpxPoint.
 * @param node - trkpt element
 * @returns Parsed point or null if lat/lon missing
 */
const parseTrackPoint = (node: Element): GpxPoint | null => {
	const lat = Number(node.getAttribute('lat'))
	const lon = Number(node.getAttribute('lon'))
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
		return null
	}

	return {
		lat,
		lon,
		ele: readNumber(node, ['ele']),
		time: readText(node, ['time']),
		hr: readNumber(node, ['gpxtpx\\:hr', 'ns3\\:hr', 'hr', '*|hr']),
	}
}

/**
 * Falls back to scanning child nodes for heart-rate when CSS selectors miss namespaces.
 * @param points - Points already parsed (mutated in place for missing hr)
 * @param trkpts - Raw trkpt elements in the same order
 */
const backfillHeartRateFromExtensions = (points: GpxPoint[], trkpts: Element[]): void => {
	for (let index = 0; index < points.length; index += 1) {
		if (points[index].hr !== null) {
			continue
		}
		const extensions = trkpts[index]?.getElementsByTagNameNS('*', 'hr')
		if (!extensions?.length) {
			continue
		}
		const value = Number(extensions[0].textContent?.trim())
		if (Number.isFinite(value)) {
			points[index] = { ...points[index], hr: value }
		}
	}
}

/**
 * Aggregates distance, elevation gain, and min/max stats from points.
 * @param points - Track points
 * @returns Summary fields
 */
const summarizePoints = (
	points: GpxPoint[],
): Pick<
	GpxTrack,
	'distanceMeters' | 'elevationGainMeters' | 'hasElevation' | 'hasHeartRate' | 'minEle' | 'maxEle' | 'minHr' | 'maxHr'
> => {
	let distanceMeters = 0
	let elevationGainMeters = 0
	let minEle: number | null = null
	let maxEle: number | null = null
	let minHr: number | null = null
	let maxHr: number | null = null
	let previousEle: number | null = null

	for (let index = 0; index < points.length; index += 1) {
		const point = points[index]
		if (index > 0) {
			distanceMeters += haversineMeters(points[index - 1], point)
		}

		if (point.ele !== null) {
			minEle = minEle === null ? point.ele : Math.min(minEle, point.ele)
			maxEle = maxEle === null ? point.ele : Math.max(maxEle, point.ele)
			if (previousEle !== null && point.ele > previousEle) {
				elevationGainMeters += point.ele - previousEle
			}
			previousEle = point.ele
		}

		if (point.hr !== null) {
			minHr = minHr === null ? point.hr : Math.min(minHr, point.hr)
			maxHr = maxHr === null ? point.hr : Math.max(maxHr, point.hr)
		}
	}

	return {
		distanceMeters,
		elevationGainMeters,
		hasElevation: points.some((point) => point.ele !== null),
		hasHeartRate: points.some((point) => point.hr !== null),
		minEle,
		maxEle,
		minHr,
		maxHr,
	}
}

/**
 * Parses GPX XML text into a track with derived stats.
 * @param xmlText - Raw GPX file contents
 * @param fallbackName - Name used when the GPX has no <name>
 * @returns Parsed track
 */
export const parseGpx = (xmlText: string, fallbackName = 'activity'): GpxTrack => {
	const document = new DOMParser().parseFromString(xmlText, 'application/xml')
	const parseError = document.querySelector('parsererror')
	if (parseError) {
		throw new Error('Invalid GPX file')
	}

	const trkpts = [...document.getElementsByTagName('trkpt')]
	const rtepts = trkpts.length === 0 ? [...document.getElementsByTagName('rtept')] : []
	const sourcePoints = trkpts.length > 0 ? trkpts : rtepts

	const points: GpxPoint[] = []
	for (const node of sourcePoints) {
		const point = parseTrackPoint(node)
		if (point) {
			points.push(point)
		}
	}

	if (points.length < 2) {
		throw new Error('GPX needs at least two track points')
	}

	backfillHeartRateFromExtensions(points, sourcePoints)

	const name = readText(document.documentElement, ['trk > name', 'metadata > name', 'name']) ?? fallbackName

	return {
		name,
		points,
		...summarizePoints(points),
	}
}

/**
 * Loads and parses a GPX File from disk.
 * @param file - User-selected .gpx file
 * @returns Parsed track
 */
export const parseGpxFile = async (file: File): Promise<GpxTrack> => {
	const text = await file.text()
	const fallbackName = file.name.replace(/\.gpx$/i, '') || 'activity'
	return parseGpx(text, fallbackName)
}

/**
 * Cumulative distance along the track for each point (meters).
 * @param points - Track points
 * @returns Parallel array of cumulative meters
 */
export const cumulativeDistances = (points: GpxPoint[]): number[] => {
	const distances = [0]
	for (let index = 1; index < points.length; index += 1) {
		distances.push(distances[index - 1] + haversineMeters(points[index - 1], points[index]))
	}
	return distances
}
