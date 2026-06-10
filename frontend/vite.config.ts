import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// バックエンドの向き先: Docker内では http://backend:4000、ローカル直起動では localhost
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Docker内から外部アクセスを受けるため
    port: 3000,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendUrl,
        ws: true,
      },
    },
  },
})
