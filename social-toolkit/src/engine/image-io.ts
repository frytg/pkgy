/**
 * Loads an image from a URL or object URL.
 * @param url - Image source URL
 * @returns Resolved HTMLImageElement
 */
export const loadImage = (url: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const image = new Image()
		image.decoding = 'async'
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error(`Failed to load image: ${url}`))
		image.src = url
	})

/**
 * Creates an object URL for a File and loads it as an image.
 * @param file - User-selected image file
 * @returns Loaded image and object URL (caller should revoke when replaced)
 */
export const loadImageFromFile = async (file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> => {
	const objectUrl = URL.createObjectURL(file)
	try {
		const image = await loadImage(objectUrl)
		return { image, objectUrl }
	} catch (error) {
		URL.revokeObjectURL(objectUrl)
		throw error
	}
}

/**
 * Triggers a browser download for a blob.
 * @param blob - File contents
 * @param filename - Suggested download name
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	URL.revokeObjectURL(url)
}

/**
 * Triggers a browser download for a text payload.
 * @param text - File contents
 * @param filename - Suggested download name
 * @param mimeType - MIME type for the blob
 */
export const downloadText = (text: string, filename: string, mimeType = 'image/svg+xml'): void => {
	downloadBlob(new Blob([text], { type: mimeType }), filename)
}

/**
 * Copies an image blob to the system clipboard.
 * @param blob - PNG (or other image) blob
 */
export const copyImageBlob = async (blob: Blob): Promise<void> => {
	await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}
