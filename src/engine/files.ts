/**
 * Stockfish build served from `engine/`, shared by the app and the vite config that copies it.
 * Single-threaded lite build: it needs no cross-origin isolation, so it runs on any static host.
 */
export const ENGINE_DIR = "engine";
export const ENGINE_SCRIPT = "stockfish-19-lite-single.js";
export const ENGINE_FILES = [ENGINE_SCRIPT, "stockfish-19-lite-single.wasm"] as const;
