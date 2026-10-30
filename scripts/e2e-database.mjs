import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const E2E_SCHEMA = "praxbit_e2e";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromServer = createRequire(resolve(repositoryRoot, "apps", "server", "package.json"));
const { Client } = requireFromServer("pg");

export function loadProjectEnvironment() {
    const configuredPath = process.env["PRAXBIT_ENV_FILE"];
    const environmentPath =
        configuredPath === undefined || configuredPath.trim() === ""
            ? resolve(repositoryRoot, ".env")
            : resolve(configuredPath);
    if (existsSync(environmentPath)) {
        process.loadEnvFile(environmentPath);
    }
    return environmentPath;
}

export function requireDatabaseUrl() {
    const value = process.env["DATABASE_URL"];
    if (value === undefined || value.trim() === "") {
        throw new Error(
            "DATABASE_URL is missing. Set it in the project root .env file or the process environment.",
        );
    }
    return value.trim();
}

export function describeDatabaseUrl(value) {
    const parsed = new URL(value);
    const database = parsed.pathname.replace(/^\/+/, "");
    return `${parsed.hostname}:${parsed.port === "" ? "5432" : parsed.port}/${database}`;
}

export function buildE2eDatabaseUrl(value) {
    const parsed = new URL(value);
    parsed.searchParams.set("options", `-c search_path=${E2E_SCHEMA}`);
    return parsed.toString();
}

export async function recreateE2eSchema(databaseUrl) {
    const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
    });
    try {
        await client.connect();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Could not connect to PostgreSQL at ${describeDatabaseUrl(databaseUrl)}. Check that the database is running and DATABASE_URL is correct. Original error: ${message}`,
            { cause: error },
        );
    }
    try {
        await client.query(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
        await client.query(`CREATE SCHEMA "${E2E_SCHEMA}"`);
    } finally {
        await client.end().catch(function ignore() {
            return undefined;
        });
    }
}

async function main() {
    loadProjectEnvironment();
    const databaseUrl = requireDatabaseUrl();
    await recreateE2eSchema(databaseUrl);
    console.info(`Recreated schema ${E2E_SCHEMA} in ${describeDatabaseUrl(databaseUrl)}.`);
}

const invokedDirectly =
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
    main().catch(function failed(error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
