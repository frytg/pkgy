import { blueskyProvider } from './bluesky.ts'
import { githubProvider } from './github.ts'
import { mastodonProvider } from './mastodon.ts'
import { tangledProvider } from './tangled.ts'
import type { ActivityProvider } from './types.ts'

/**
 * Registry of all activity providers, keyed by URL path segment.
 * Add new tools here — each entry is mounted at `/<key>` in `src/index.ts`.
 */
export const providers: Record<string, ActivityProvider> = {
	bluesky: blueskyProvider,
	github: githubProvider,
	mastodon: mastodonProvider,
	tangled: tangledProvider,
}
