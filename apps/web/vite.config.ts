import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import path from "node:path";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const pyodideDirectory = realpathSync(path.join(rootDirectory, "node_modules", "pyodide"));

export default defineConfig({
    plugins: [
        solid(),
        viteStaticCopy({
            targets: [
                {
                    src: `${pyodideDirectory.replace(/\\/g, "/")}/*`,
                    dest: "pyodide",
                    // The Pyodide package is flat; keep pyodide.mjs at /pyodide/.
                    rename: { stripBase: true },
                },
            ],
        }),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icon.svg"],
            manifest: {
                name: "Praxbit",
                short_name: "Praxbit",
                description:
                    "The computer science learning game. Start knowing nothing. Learn to understand everything you build.",
                theme_color: "#FFFFFF",
                background_color: "#FFFFFF",
                display: "standalone",
                start_url: "/",
                icons: [
                    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
                    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,woff2}"],
                globIgnores: ["pyodide/**/*"],
                maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
                navigateFallback: "/index.html",
                cleanupOutdatedCaches: true,
            },
            devOptions: { enabled: false },
        }),
    ],
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8787",
                changeOrigin: true,
            },
        },
        fs: { allow: [path.resolve(rootDirectory, "../..")] },
    },
    build: {
        target: "es2022",
        sourcemap: true,
        chunkSizeWarningLimit: 1500,
    },
    worker: { format: "es" },
});
