import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// BASE_PATH permite publicar en una subcarpeta (ej: GitHub Pages → /la-calandria/)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
})
