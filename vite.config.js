import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps the build working on GitHub Pages under /repo-name/
export default defineConfig({
  plugins: [react()],
  base: './',
})
