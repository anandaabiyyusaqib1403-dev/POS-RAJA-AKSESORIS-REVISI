import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function shouldServeAppShell(request) {
  const pathname = String(request.url || '').split('?')[0]
  const accept = String(request.headers.accept || '')

  return request.method === 'GET' &&
    accept.includes('text/html') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/@') &&
    !pathname.startsWith('/src/') &&
    !pathname.startsWith('/node_modules/') &&
    !/\.[^/]+$/.test(pathname)
}

function spaDocumentFallback() {
  const rewriteToIndex = (server) => {
    server.middlewares.use((request, _response, next) => {
      if (shouldServeAppShell(request)) {
        request.url = '/index.html'
      }
      next()
    })
  }

  return {
    name: 'pos-raja-spa-document-fallback',
    configureServer: rewriteToIndex,
    configurePreviewServer: rewriteToIndex,
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  appType: 'spa',
  plugins: [spaDocumentFallback(), react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || process.env.VITE_API_BASE_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
