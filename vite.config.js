import { defineConfig } from 'vite';

const apiProxy = { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } };

export default defineConfig({
  server: { host: '127.0.0.1', proxy: apiProxy },
  preview: { host: '127.0.0.1', proxy: apiProxy },
  build: {
    rolldownOptions: {
      input: { map: 'index.html', colors: 'docs/color-schemes.html' },
    },
  },
});
