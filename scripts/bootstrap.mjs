import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuredEnvironmentPath = process.env["PRAXBIT_ENV_FILE"];
const environmentPath =
    configuredEnvironmentPath === undefined || configuredEnvironmentPath.trim() === ""
        ? resolve(repositoryRoot, ".env")
        : resolve(configuredEnvironmentPath);

if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
    console.info(`Loaded ${environmentPath}.`);
} else {
    console.warn(`No ${environmentPath} found. Copy .env.example to .env and edit DATABASE_URL.`);
}

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.trim() === "") {
    console.error("DATABASE_URL is missing. Set it in the project root .env file.");
    process.exit(1);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const flags = new Set(process.argv.slice(2));

function run(args) {
    console.info(`\n> ${pnpm} ${args.join(" ")}`);
    const result = spawnSync(pnpm, args, {
        cwd: repositoryRoot,
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
    });
    if (result.error !== undefined) {
        console.error(result.error.message);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

if (!flags.has("--skip-install")) {
    run(["install", "--frozen-lockfile"]);
}

run(["--filter", "@praxbit/server", "db:migrate"]);

if (!flags.has("--skip-build")) {
    run(["build"]);
}

console.info("\nPraxbit is ready. Start it with:");
console.info("  pnpm start");
