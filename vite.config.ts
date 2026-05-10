import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('react-dom') || id.includes('react-router')) return 'react-vendor'
          if (id.includes('@react-google-maps')) return 'maps'
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
