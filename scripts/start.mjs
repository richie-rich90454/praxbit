import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverBundle = resolve(repositoryRoot, "apps", "server", "dist", "main.js");
const webEntry = resolve(repositoryRoot, "apps", "web", "dist", "index.html");

if (!existsSync(serverBundle) || !existsSync(webEntry)) {
    console.info("Build output is missing. Building Praxbit before starting...");
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const build = spawnSync(pnpm, ["build"], {
        cwd: repositoryRoot,
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
    });
    if (build.error !== undefined) {
        console.error(build.error.message);
        process.exit(1);
    }
    if (build.status !== 0) {
        process.exit(build.status ?? 1);
    }
}

const child = spawn(process.execPath, [serverBundle], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: process.env,
});

child.on("exit", function onExit(code, signal) {
    if (signal !== null) {
        process.kill(process.pid, signal);
        return;
    }
    process.exitCode = code ?? 1;
});
