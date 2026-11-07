import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Keep MapLibre un-prebundled in dev so its worker asset URL stays valid.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
