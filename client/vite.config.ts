import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";
import mkcert from "vite-plugin-mkcert";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    ...(process.env.VITE_E2E_TEST ? [] : [mkcert()]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: path.resolve(__dirname, './node_modules/buffer/'),
      'pino/browser.js': path.resolve(__dirname, './node_modules/pino/browser.js'),
      'pino': path.resolve(__dirname, './src/shim/pino-browser.ts'),
    },
  },
  define: { global: 'globalThis' },
  optimizeDeps: {
    include: ['buffer', 'react', 'react-dom'],
    exclude: ['@aztec/bb.js', '@noir-lang/noir_js'],
    esbuildOptions: { define: { global: 'globalThis' } },
  },
  server: {
    port: 3000,
    hmr: {
      protocol: 'wss',
      host: 'localhost',
      port: 3000,
    },
    proxy: {
      '/ws': { target: 'http://localhost:3001', ws: true },
    },
  },
});
