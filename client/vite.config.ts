import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
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
  optimizeDeps: {
    include: [
      "@dojoengine/sdk",
      "@dojoengine/sdk > @dojoengine/torii-wasm",
      "@dojoengine/sdk > @dojoengine/torii-client",
    ],
  },
});
