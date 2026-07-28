/**
 * Runtime-conditional HTTP client: undici on node (repo convention: no global fetch in
 * backend code), native fetch on Deno Deploy where undici is unnecessary weight.
 * The undici import is dynamic so Deno never has to resolve it.
 */
export const httpFetch: typeof globalThis.fetch =
	'Deno' in globalThis
		? globalThis.fetch.bind(globalThis)
		: ((await import('undici')).fetch as unknown as typeof globalThis.fetch)
