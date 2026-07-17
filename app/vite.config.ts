import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.API_URL || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/uploads': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
})
