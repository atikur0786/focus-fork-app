import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = Number(process.env.VITE_DEV_SERVER_PORT) || 5180

export default defineConfig({
  root: resolve('src/renderer'),
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  plugins: [react(), tailwindcss()]
})
