import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    E2E_SCHEMA,
    buildE2eDatabaseUrl,
    describeDatabaseUrl,
    loadProjectEnvironment,
    recreateE2eSchema,
    requireDatabaseUrl,
} from "./e2e-database.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverBundle = resolve(repositoryRoot, "apps", "server", "dist", "main.js");
const webEntry = resolve(repositoryRoot, "apps", "web", "dist", "index.html");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function fail(message) {
    console.error(`[e2e] ${message}`);
    process.exit(1);
}

function run(args, environment, label) {
    console.info(`[e2e] ${label}: ${pnpm} ${args.join(" ")}`);
    const result = spawnSync(pnpm, args, {
        cwd: repositoryRoot,
        stdio: "inherit",
        shell: process.platform === "win32",
        env: environment,
    });
    if (result.error !== undefined) {
        fail(`${label} failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
        fail(`${label} exited with status ${String(result.status)}.`);
    }
}

function ensureBuilds() {
    const targets = [];
    if (!existsSync(webEntry)) {
        targets.push("@praxbit/web");
    }
    if (!existsSync(serverBundle)) {
        targets.push("@praxbit/server");
    }
    for (const target of targets) {
        run(["--filter", target, "build"], process.env, `Building ${target}`);
    }
}

function applyServerEnvironment(databaseUrl) {
    const environment = {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: "4173",
        COOKIE_SECURE: "0",
        TRUST_PROXY: "0",
        CORS_ORIGINS: "",
        PRAXBIT_E2E: "1",
        PRAXBIT_MIGRATION_SCHEMA: E2E_SCHEMA,
    };
    for (const key of Object.keys(environment)) {
        if (key.startsWith("AI_")) {
            delete environment[key];
        }
    }
    for (const key of Object.keys(process.env)) {
        if (key.startsWith("AI_")) {
            delete process.env[key];
        }
    }
    Object.assign(process.env, environment);
}

async function start() {
    loadProjectEnvironment();
    const databaseUrl = requireDatabaseUrl();
    const testDatabaseUrl = buildE2eDatabaseUrl(databaseUrl);
    ensureBuilds();

    try {
        await recreateE2eSchema(databaseUrl);
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
    console.info(`[e2e] Using schema ${E2E_SCHEMA} in ${describeDatabaseUrl(databaseUrl)}.`);

    applyServerEnvironment(testDatabaseUrl);
    run(["db:migrate"], process.env, "Migrating the end-to-end schema");

    console.info("[e2e] Starting the production server at http://127.0.0.1:4173.");
    // Running the bundle in this process keeps Playwright's shutdown from orphaning the server on Windows.
    await import(pathToFileURL(serverBundle).href);
}

start().catch(function failed(error) {
    fail(error instanceof Error ? error.message : String(error));
});
