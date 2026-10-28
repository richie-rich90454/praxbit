import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const configuredEnvironmentPath = process.env["PRAXBIT_ENV_FILE"];
const environmentPath =
    configuredEnvironmentPath === undefined || configuredEnvironmentPath.trim() === ""
        ? resolve(repositoryRoot, ".env")
        : resolve(configuredEnvironmentPath);
if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
}

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error(
        `DATABASE_URL is missing. Set it in ${environmentPath} or the process environment.`,
    );
}

const direction = process.argv[2] === "down" ? "down" : "up";
await runner({
    databaseUrl,
    dir: resolve(repositoryRoot, "database", "migrations"),
    direction,
    migrationsTable: "pgmigrations",
    ...(direction === "down" ? { count: 1 } : {}),
    log: function logMigration(message: string): void {
        console.info(message);
    },
});
