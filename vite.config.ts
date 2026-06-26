import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works under a GitHub Pages project subpath
// (https://<user>.github.io/AA-art/) as well as when opened locally.
export default defineConfig({
  base: './',
  plugins: [react()],
})
