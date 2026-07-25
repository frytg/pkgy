import { generate_github_chart } from 'https://esm.sh/githubchart-rust@5.1.4/githubchart_rust_deno.js'

/**
 * Parses `/{username}` or `/{username}/{color}` from the request path.
 * @param pathname - URL pathname from the incoming request.
 * @returns username plus optional color scheme, or null when username is missing.
 */
const parsePath = (pathname: string): { username: string; color: string } | null => {
	const segments = pathname.split('/').filter(Boolean)
	const username = segments[0]
	if (!username) return null
	return {
		username,
		color: segments[1] || 'default',
	}
}

/**
 * Handles chart requests for Deno Deploy and local `deno run`.
 * @param req - Incoming Fetch API request.
 * @returns SVG chart response, or an error status response.
 */
const handler = async (req: Request): Promise<Response> => {
	try {
		const url = new URL(req.url)
		const parsed = parsePath(url.pathname)
		if (!parsed) {
			return new Response('No username provided', { status: 400 })
		}

		const { username, color } = parsed
		const chart = await generate_github_chart(username, color)

		return new Response(chart, {
			headers: {
				'Content-Type': 'image/svg+xml',
				'Cache-Control': 'max-age=300',
				'x-generated-by': 'githubchart-rust',
				'x-username': username,
			},
		})
	} catch (error) {
		console.error(req.method, req.url, error)
		return new Response('Internal Server Error', { status: 500 })
	}
}

// Deno Deploy: `deno deploy` (entrypoint from deno.json)
// Local: `deno task start` or `deno run --allow-net --allow-read web/deno.ts`
Deno.serve(handler)
