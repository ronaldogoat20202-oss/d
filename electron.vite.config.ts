import { defineConfig } from 'electron-vite'
import { resolveClientId } from './src/main/services/auth-config'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    define: { __ORBIT_MICROSOFT_CLIENT_ID__: JSON.stringify(resolveClientId(process.env.ORBIT_MICROSOFT_CLIENT_ID || '', '') || '') },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } }
  },
  preload: {
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } }
  },
  renderer: {
    root: resolve('src/renderer'),
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
