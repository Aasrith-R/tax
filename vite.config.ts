import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow external access
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000', // Internal proxy to localhost
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  optimizeDeps: {
    include: ['@pdf-lib/fontkit'],
    exclude: [],
  },
})
