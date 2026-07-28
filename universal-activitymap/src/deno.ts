import { createApp } from './app.ts'

const app = createApp()

// PORT override for local runs; on Deno Deploy the platform handles routing either way
const port = Number(Deno.env.get('PORT') ?? 8000)
Deno.serve({ port }, app.fetch)
