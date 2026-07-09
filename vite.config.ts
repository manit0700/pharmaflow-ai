import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4003',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router-dom/')) {
            return 'vendor-react'
          }
          if (id.includes('/node_modules/recharts/')) {
            return 'vendor-charts'
          }
          if (id.includes('/node_modules/@radix-ui/')) {
            return 'vendor-radix'
          }
          if (id.includes('/node_modules/xlsx/')) {
            return 'vendor-xlsx'
          }
          if (id.includes('/node_modules/')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
