import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHTTPHandler } from '@trpc/server/adapters/standalone'
import { appRouter } from './src/trpc.js'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'trpc',
      configureServer(server) {
        const handler = createHTTPHandler({ router: appRouter, basePath: '/' })
        server.middlewares.use('/trpc', handler)
      },
    },
  ],
})
