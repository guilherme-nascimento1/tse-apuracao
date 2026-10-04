import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL || 'http://localhost:3001', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: { vendor: ['react', 'react-dom', '@tanstack/react-query'], charts: ['recharts'], motion: ['framer-motion'] } },
    },
  },
})
