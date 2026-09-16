import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-v20260812-3-[hash].js',
        chunkFileNames: 'assets/[name]-v20260812-3-[hash].js',
        assetFileNames: 'assets/[name]-v20260812-3-[hash][extname]',

      },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    css: true,
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
