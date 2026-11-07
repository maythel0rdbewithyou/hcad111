import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // MapLibre 6 loads its worker relative to its own module URL; pre-bundling
  // breaks that path in dev, so serve it untouched.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
