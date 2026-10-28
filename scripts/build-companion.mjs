import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const entryPoint = path.join(repositoryRoot, "apps", "companion", "src", "main.ts");
const outputFile = path.join(repositoryRoot, "apps", "companion", "dist", "main.js");

await build({
    entryPoints: [entryPoint],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "bundle",
    sourcemap: false,
    legalComments: "none",
    logLevel: "info",
    banner: {
        js: "#!/usr/bin/env node",
    },
});

if (process.platform !== "win32") {
    fs.chmodSync(outputFile, 0o755);
}

process.stdout.write(`Built ${path.relative(repositoryRoot, outputFile)}\n`);
