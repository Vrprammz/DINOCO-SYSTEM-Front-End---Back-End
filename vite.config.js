import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'src/css/main.css',
        b2c: 'src/js/b2c.js',
        b2b: 'src/js/b2b.js',
      },
      output: {
        entryFileNames: 'js/[name].js',
        assetFileNames: 'css/[name].[ext]',
      }
    }
  }
})
