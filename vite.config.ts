import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { ENGINE_DIR, ENGINE_FILES } from "./src/engine/files";

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

/**
 * Serves the Stockfish worker and its .wasm straight from node_modules, so the engine version
 * is the one pinned in package.json. The GPL text travels with the engine binaries.
 */
function stockfishEngine(): Plugin {
  const pkgDir = dirname(createRequire(import.meta.url).resolve("stockfish/package.json"));
  const sources: Record<string, string> = {
    ...Object.fromEntries(ENGINE_FILES.map((file) => [file, join(pkgDir, "bin", file)])),
    "COPYING.txt": join(pkgDir, "Copying.txt"),
  };
  const types: Record<string, string> = { js: "text/javascript", wasm: "application/wasm", txt: "text/plain" };
  return {
    name: "stockfish-engine",
    configureServer(server) {
      const prefix = `${server.config.base}${ENGINE_DIR}/`;
      server.middlewares.use((req, res, next) => {
        const file = req.url?.startsWith(prefix) ? req.url.slice(prefix.length).split("?")[0] : null;
        const source = file ? sources[file] : undefined;
        if (!file || !source) return next();
        res.setHeader("Content-Type", types[file.split(".").pop() ?? ""] ?? "application/octet-stream");
        res.end(readFileSync(source));
      });
    },
    generateBundle() {
      for (const [file, source] of Object.entries(sources)) {
        this.emitFile({ type: "asset", fileName: `${ENGINE_DIR}/${file}`, source: readFileSync(source) });
      }
    },
  };
}

export default defineConfig({
  // Served from the root of its own subdomain; override with VITE_BASE for a sub-path deploy.
  base: process.env.VITE_BASE ?? "/",
  plugins: [contentSecurityPolicy(), stockfishEngine()],
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
