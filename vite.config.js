import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND_PORT = parseInt(process.env.COWART_BACKEND_PORT || '43218', 10)
const BACKEND_URL = process.env.COWART_BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 43217,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true
      },
      '/assets': {
        target: BACKEND_URL,
        changeOrigin: true
      },
      '/page-assets': {
        target: BACKEND_URL,
        changeOrigin: true
      }
    }
  }
})
