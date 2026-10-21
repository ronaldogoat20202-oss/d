import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({ root: resolve('src/renderer'), server: { host: '127.0.0.1', port: 4173, strictPort: true, hmr: false, fs: { allow: [resolve('.')] } } })
