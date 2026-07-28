import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

const PORT = Number(process.env.PORT ?? 3000)

const app = createApp()

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`universal-activitymap listening on http://localhost:${info.port}`)
})
