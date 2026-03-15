import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom') || id.includes(`${'node_modules'}${'/'}react${'/'}`)) {
            return 'react'
          }

          if (id.includes('leaflet') || id.includes('react-leaflet')) {
            return 'mapping'
          }

          if (id.includes('recharts')) {
            return 'charts'
          }

          if (id.includes('file-saver') || id.includes('html-to-image')) {
            return 'exports'
          }

          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
