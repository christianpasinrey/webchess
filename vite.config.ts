import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Content Security Policy for the production build only (dev needs the HMR websocket).
 * The page may only talk to itself and the Anthropic API; 'wasm-unsafe-eval' is for
 * the meshopt decoder, which compiles a small WebAssembly module.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://api.anthropic.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig({
  // Served from the root of its own subdomain; override with VITE_BASE for a sub-path deploy.
  base: process.env.VITE_BASE ?? "/",
  plugins: [contentSecurityPolicy()],
  build: {
    target: "es2022",
    sourcemap: true,
    // three.js alone is ~600 kB; it is split out below, so only warn above that.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Vendor chunks change far less often than app code, so they stay cached across deploys.
        codeSplitting: {
          groups: [
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            { name: "anthropic", test: /node_modules[\\/]@anthropic-ai[\\/]/ },
            { name: "chess", test: /node_modules[\\/]chess\.js[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
