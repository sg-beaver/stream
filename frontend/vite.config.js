import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 개발 중 /api 요청을 백엔드(FastAPI)로 전달 — CORS 없이 연동
      // (localhost 대신 127.0.0.1: Node가 localhost를 IPv6로 해석해 연결이 실패할 수 있음)
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
