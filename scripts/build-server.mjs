#!/usr/bin/env node
import { build } from "esbuild";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = resolve(repositoryRoot, "apps/server/src/main.ts");
const outputFile = resolve(repositoryRoot, "apps/server/dist/main.js");

async function main() {
    await mkdir(dirname(outputFile), { recursive: true });
    await build({
        entryPoints: [entryPoint],
        outfile: outputFile,
        bundle: true,
        platform: "node",
        target: "node22",
        format: "esm",
        external: ["pg-native"],
        sourcemap: false,
        minify: false,
        legalComments: "none",
        logLevel: "info",
        banner: {
            js: "import { createRequire as __praxbitCreateRequire } from 'node:module';\nconst require = __praxbitCreateRequire(import.meta.url);",
        },
    });
    const info = await stat(outputFile);
    console.log(`Built ${outputFile} (${String(info.size)} bytes).`);
}

main().catch(function failed(error) {
    console.error(error);
    process.exitCode = 1;
});
