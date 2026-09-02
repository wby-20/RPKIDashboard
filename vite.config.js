import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const asRankProxy = {
  target: 'https://api.asrank.caida.org',
  changeOrigin: true,
  secure: true,
  rewrite: () => '/v2/graphql',
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api/asrank': asRankProxy } },
  preview: { proxy: { '/api/asrank': asRankProxy } },
});
