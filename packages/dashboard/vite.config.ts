import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    // Bind all interfaces (IPv4 127.0.0.1 + IPv6 ::1) so the iframe in the
    // Electron renderer can reach :5174 regardless of which stack DNS picks
    // for `localhost`. Without this vite default-binds to a single stack and
    // cross-origin fetch from the renderer fails intermittently.
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
