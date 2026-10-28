#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const port = 55432;
const databaseName = "praxbit_test";

interface RunOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly shell?: boolean;
}

interface TestCluster {
    readonly databaseUrl: string;
    stop(): Promise<void>;
}

function executable(name: string, binDirectory: string | undefined): string {
    const extension = process.platform === "win32" ? ".exe" : "";
    if (binDirectory === undefined) {
        return `${name}${extension}`;
    }
    return join(binDirectory, `${name}${extension}`);
}

function resolvePostgresBin(): string | undefined {
    const configured = process.env["PRAXBIT_PG_BIN"];
    if (configured !== undefined && configured.length > 0) {
        return configured;
    }
    if (process.platform !== "win32") {
        return undefined;
    }
    const root = "C:\\Program Files\\PostgreSQL";
    if (!existsSync(root)) {
        return undefined;
    }
    const versions = readdirSync(root)
        .filter(function numeric(name: string): boolean {
            return /^\d+$/.test(name);
        })
        .sort(function newestFirst(left: string, right: string): number {
            return Number(right) - Number(left);
        });
    for (const version of versions) {
        const candidate = join(root, version, "bin");
        if (existsSync(join(candidate, "initdb.exe"))) {
            return candidate;
        }
    }
    return undefined;
}

function run(command: string, args: readonly string[], options?: RunOptions): void {
    const result = spawnSync(command, [...args], {
        stdio: "inherit",
        cwd: repositoryRoot,
        env: options?.env ?? process.env,
        shell: options?.shell === true,
    });
    if (result.error !== undefined) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited with status ${String(result.status)}.`);
    }
}

async function waitForPostgres(connectionUrl: string): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        const client = new Client({ connectionString: connectionUrl });
        try {
            await client.connect();
            await client.query("SELECT 1");
            await client.end();
            return;
        } catch {
            await client.end().catch(function ignore(): void {
                return undefined;
            });
            await delay(250);
        }
    }
    throw new Error(`PostgreSQL did not become ready on port ${String(port)}.`);
}

async function recreateDatabase(adminUrl: string): Promise<void> {
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
        await client.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await client.query(`CREATE DATABASE ${databaseName}`);
    } finally {
        await client.end();
    }
}

async function migrate(databaseUrl: string): Promise<void> {
    await runner({
        databaseUrl,
        dir: resolve(repositoryRoot, "database/migrations"),
        direction: "up",
        migrationsTable: "pgmigrations",
    });
}

async function startCluster(): Promise<TestCluster> {
    const bin = resolvePostgresBin();
    const dataDirectory = await mkdtemp(join(tmpdir(), "praxbit-pg-"));
    const logFile = join(dataDirectory, "postgres.log");
    const initdb = executable("initdb", bin);
    const pgCtl = executable("pg_ctl", bin);

    run(initdb, [
        "-D",
        dataDirectory,
        "-U",
        "postgres",
        "-A",
        "trust",
        "--encoding=UTF8",
        "--locale=C",
        "--no-sync",
    ]);
    run(pgCtl, ["-D", dataDirectory, "-o", `-p ${String(port)}`, "-l", logFile, "start"]);

    const adminUrl = `postgresql://postgres@127.0.0.1:${String(port)}/postgres`;
    const databaseUrl = `postgresql://postgres@127.0.0.1:${String(port)}/${databaseName}`;
    await waitForPostgres(adminUrl);
    await recreateDatabase(adminUrl);

    return {
        databaseUrl,
        async stop(): Promise<void> {
            try {
                run(pgCtl, ["-D", dataDirectory, "-m", "immediate", "stop"]);
            } catch (error) {
                const log = await readFile(logFile, "utf8").catch(function fallback(): string {
                    return "";
                });
                console.error(log);
                throw error;
            } finally {
                await rm(dataDirectory, { recursive: true, force: true });
            }
        },
    };
}

function runTests(databaseUrl: string): void {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
    };
    run(
        process.execPath,
        [
            "node_modules/vitest/vitest.mjs",
            "run",
            "--config",
            "tests/integration/server/vitest.config.ts",
        ],
        { env },
    );
}

async function main(): Promise<void> {
    const configured = process.env["PRAXBIT_TEST_DATABASE_URL"];
    if (configured !== undefined && configured.length > 0) {
        await migrate(configured);
        runTests(configured);
        return;
    }

    const cluster = await startCluster();
    try {
        await migrate(cluster.databaseUrl);
        runTests(cluster.databaseUrl);
    } finally {
        await cluster.stop();
    }
}

main().catch(function failed(error: unknown): void {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
