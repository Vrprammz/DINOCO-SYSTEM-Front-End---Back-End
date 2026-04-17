import { defineConfig } from "vite";
import { resolve } from "path";

// Build config for LIFF frontends — separate from main vite.config.js (brand-voice-ext).
//
// Goal: Migrate inline LIFF JS/CSS out of PHP snippets (B2B Snippet 4, B2F Snippet 8,
// LIFF AI Snippet 2) into proper build artifacts under dist/liff/*.
// WP snippets will enqueue built assets via wp_enqueue_script with immutable
// cache headers once Phase 2+ migration runs.
//
// Status: V.0.1 FOUNDATION — no LIFF code migrated yet. Entry points below
// point at placeholder stubs. See liff-src/README.md for migration plan.

export default defineConfig({
    root: "liff-src",
    publicDir: false,
    build: {
        outDir: "../dist/liff",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                "b2b-catalog": resolve(__dirname, "liff-src/b2b/catalog/entry.js"),
                "b2f-catalog": resolve(__dirname, "liff-src/b2f/catalog/entry.js"),
                "b2f-maker": resolve(__dirname, "liff-src/b2f/maker/entry.js"),
                "liff-ai": resolve(__dirname, "liff-src/liff-ai/frontend/entry.js"),
            },
            output: {
                entryFileNames: "[name].[hash].js",
                chunkFileNames: "chunks/[name].[hash].js",
                assetFileNames: "assets/[name].[hash][extname]",
            },
        },
        sourcemap: true,
        target: "es2020",
        // Vite 8+ uses oxc by default (esbuild is optional peer dep).
        // Keep true to enable default minifier — no extra install needed.
        minify: true,
        reportCompressedSize: true,
    },
    server: {
        port: 5173,
        strictPort: false,
    },
});
