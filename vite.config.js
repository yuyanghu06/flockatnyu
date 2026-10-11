import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rolldownOptions: {
      input: { map: 'index.html', colors: 'docs/color-schemes.html' },
    },
  },
});
