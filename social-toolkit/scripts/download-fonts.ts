/**
 * Downloads Geist variable fonts into src/style for local and CI builds.
 * Fonts are gitignored — run via `deno task fonts` or `just fonts`.
 */

const GEIST_VERSION = '1.5.1'
const OUT_DIR = new URL('../src/style/', import.meta.url)

const FONTS = [
	{
		file: 'geist-sans.woff2',
		url: `https://esm.sh/geist@${GEIST_VERSION}/dist/fonts/geist-sans/Geist-Variable.woff2?raw`,
	},
	{
		file: 'geist-mono.woff2',
		url: `https://esm.sh/geist@${GEIST_VERSION}/dist/fonts/geist-mono/GeistMono-Variable.woff2?raw`,
	},
] as const

/**
 * Fetches one font file and writes it under src/style.
 * @param file - Destination filename
 * @param url - Source URL
 */
const downloadFont = async (file: string, url: string): Promise<void> => {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to download ${file}: ${response.status} ${response.statusText}`)
	}
	const bytes = new Uint8Array(await response.arrayBuffer())
	await Deno.writeFile(new URL(file, OUT_DIR), bytes)
}

await Deno.mkdir(OUT_DIR, { recursive: true })
for (const font of FONTS) {
	await downloadFont(font.file, font.url)
}
