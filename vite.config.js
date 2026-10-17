import { defineConfig, loadEnv } from 'vite';

// PORT belongs to the server configuration; only this target enters Vite's
// configuration. No provider credentials are exposed as browser environment.
export default defineConfig(({ mode }) => {
  const port = Number(process.env.PORT || loadEnv(mode, process.cwd(), 'PORT').PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid assistant API port (1–65535).');
  const apiProxy = { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: false } };

  return {
    server: { host: '127.0.0.1', proxy: apiProxy },
    preview: { host: '127.0.0.1', proxy: apiProxy },
    build: {
      rolldownOptions: {
        input: { map: 'index.html', colors: 'docs/color-schemes.html', admin: 'admin.html' },
      },
    },
  };
});
