#!/usr/bin/env node
// Restore drill: dump the source database, restore into a new disposable
// database, verify schema and row counts, then drop the disposable database.
// The source is only read. Production-looking databases require an explicit
// PRAXBIT_DRILL_ALLOW_PRODUCTION=yes opt-in.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    describeDatabaseUrl,
    loadProjectEnvironment,
    requireDatabaseUrl,
} from "./e2e-database.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromServer = createRequire(resolve(repositoryRoot, "apps", "server", "package.json"));
const { Client } = requireFromServer("pg");

const DRILL_PREFIX = "praxbit_drill_";
const KEY_TABLES = [
    "users",
    "auth_identities",
    "auth_sessions",
    "worlds",
    "learning_evidence",
    "mission_completions",
    "clubs",
    "event_submissions",
    "sync_operations",
    "pgmigrations",
];

function printHelp() {
    console.log(`Usage: node scripts/restore-drill.mjs [options]

Options:
  --keep-dump       Keep the temporary dump file and print its path
  --keep-database   Keep the disposable database for inspection
  --help            Show this help

Required environment:
  DATABASE_URL                     Source database; the drill only reads it

Optional environment:
  PRAXBIT_DRILL_ADMIN_URL          Maintenance connection for CREATE/DROP DATABASE
                                   (default: DATABASE_URL with database "postgres")
  PRAXBIT_DRILL_DATABASE           Explicit name; must start with ${DRILL_PREFIX}
  PRAXBIT_DRILL_ALLOW_PRODUCTION=yes
                                   Allow a source whose name looks like production
  PRAXBIT_PG_BIN                   Directory containing pg_dump and pg_restore

The drill never restores over the source database. It creates a new database,
restores into it, verifies it, and drops it unless --keep-database is set.
`);
}

function parseArguments(argv) {
    const options = { keepDump: false, keepDatabase: false, help: false };
    for (const argument of argv) {
        if (argument === "--keep-dump") {
            options.keepDump = true;
        } else if (argument === "--keep-database") {
            options.keepDatabase = true;
        } else if (argument === "--help" || argument === "-h") {
            options.help = true;
        } else {
            throw new Error(`Unknown option: ${argument}`);
        }
    }
    return options;
}

function executable(name, binDirectory) {
    const extension = process.platform === "win32" ? ".exe" : "";
    if (binDirectory === undefined) {
        return `${name}${extension}`;
    }
    return join(binDirectory, `${name}${extension}`);
}

function resolvePostgresBin() {
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
        .filter(function numeric(name) {
            return /^\d+$/.test(name);
        })
        .sort(function newestFirst(left, right) {
            return Number(right) - Number(left);
        });
    for (const version of versions) {
        const candidate = join(root, version, "bin");
        if (existsSync(join(candidate, "pg_dump.exe"))) {
            return candidate;
        }
    }
    return undefined;
}

function run(command, args, label) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        cwd: repositoryRoot,
    });
    if (result.error !== undefined) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${label} exited with status ${String(result.status)}.`);
    }
}

function databaseNameOf(value) {
    return new URL(value).pathname.replace(/^\/+/, "");
}

function drillNameFromEnvironment() {
    const configured = process.env["PRAXBIT_DRILL_DATABASE"]?.trim();
    if (configured === undefined || configured.length === 0) {
        const timestamp = new Date()
            .toISOString()
            .replace(/[-:.TZ]/g, "")
            .slice(0, 14);
        return `${DRILL_PREFIX}${timestamp}_${process.pid}`;
    }
    if (!new RegExp(`^${DRILL_PREFIX}[a-z0-9_]+$`).test(configured)) {
        throw new Error(`PRAXBIT_DRILL_DATABASE must match ^${DRILL_PREFIX}[a-z0-9_]+$.`);
    }
    return configured;
}

function looksLikeProduction(databaseName) {
    return (
        databaseName === "praxbit" ||
        databaseName.endsWith("_prod") ||
        databaseName.includes("production")
    );
}

function assertSafeToRun(databaseUrl, adminUrl, drillName) {
    const allowProduction = process.env["PRAXBIT_DRILL_ALLOW_PRODUCTION"] === "yes";
    const sourceName = databaseNameOf(databaseUrl);
    const adminName = databaseNameOf(adminUrl);

    if (process.env["NODE_ENV"] === "production" && !allowProduction) {
        throw new Error(
            "NODE_ENV is production. Set PRAXBIT_DRILL_ALLOW_PRODUCTION=yes to run a read-only drill against the production source.",
        );
    }
    if (looksLikeProduction(sourceName) && !allowProduction) {
        throw new Error(
            `Refusing to drill against "${sourceName}" because it looks like a production database. Set PRAXBIT_DRILL_ALLOW_PRODUCTION=yes only after confirming the target.`,
        );
    }
    if (sourceName === drillName || adminName === drillName) {
        throw new Error(
            "The drill database name must differ from the source and maintenance databases.",
        );
    }
    if (sourceName === adminName) {
        throw new Error(
            "PRAXBIT_DRILL_ADMIN_URL must point at a maintenance database, not the source database.",
        );
    }
}

async function connect(connectionString) {
    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 5000,
    });
    await client.connect();
    return client;
}

async function databaseExists(client, name) {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return (result.rowCount ?? 0) > 0;
}

async function countRows(client, table) {
    const result = await client.query(`SELECT count(*)::bigint AS count FROM "${table}"`);
    const row = result.rows[0];
    if (typeof row !== "object" || row === null) {
        throw new Error(`No count returned for ${table}.`);
    }
    return Number(row.count);
}

async function publicTableCount(client) {
    const result = await client.query(
        "SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const row = result.rows[0];
    if (typeof row !== "object" || row === null) {
        throw new Error("No public table count returned.");
    }
    return Number(row.count);
}

async function orphanCount(client, sql) {
    const result = await client.query(sql);
    const row = result.rows[0];
    if (typeof row !== "object" || row === null) {
        throw new Error("No orphan count returned.");
    }
    return Number(row.count);
}

async function verifyRestore(sourceClient, drillClient, sourceName, drillName) {
    const sourceTables = await publicTableCount(sourceClient);
    const restoredTables = await publicTableCount(drillClient);
    console.log("");
    console.log(`Public tables: source ${sourceTables}, restored ${restoredTables}`);
    if (restoredTables === 0) {
        throw new Error("The restored database has no public tables.");
    }

    console.log("");
    console.log("Table counts (source -> restored):");
    for (const table of KEY_TABLES) {
        const present = await drillClient.query("SELECT to_regclass($1) IS NOT NULL AS present", [
            `public.${table}`,
        ]);
        const row = present.rows[0];
        if (typeof row !== "object" || row === null || row.present !== true) {
            throw new Error(`Expected table ${table} is missing after restore.`);
        }
        const sourceCount = await countRows(sourceClient, table);
        const restoredCount = await countRows(drillClient, table);
        console.log(
            `  ${table.padEnd(22)} ${String(sourceCount).padStart(8)} -> ${String(restoredCount).padStart(8)}`,
        );
        if (table === "pgmigrations" && sourceCount !== restoredCount) {
            throw new Error(
                `Migration ledger mismatch for ${drillName}: ${String(sourceCount)} -> ${String(restoredCount)}.`,
            );
        }
        if (sourceCount > 0 && restoredCount === 0) {
            throw new Error(`Table ${table} lost all rows during the restore.`);
        }
    }

    const orphanChecks = [
        [
            "worlds without a user",
            "SELECT count(*)::bigint AS count FROM worlds w LEFT JOIN users u ON u.id = w.user_id WHERE u.id IS NULL",
        ],
        [
            "auth identities without a user",
            "SELECT count(*)::bigint AS count FROM auth_identities i LEFT JOIN users u ON u.id = i.user_id WHERE u.id IS NULL",
        ],
        [
            "completions without a user",
            "SELECT count(*)::bigint AS count FROM mission_completions c LEFT JOIN users u ON u.id = c.user_id WHERE u.id IS NULL",
        ],
    ];
    for (const [label, sql] of orphanChecks) {
        const count = await orphanCount(drillClient, sql);
        console.log(`  ${label}: ${count}`);
        if (count !== 0) {
            throw new Error(`Referential check failed in ${drillName}: ${label}.`);
        }
    }

    const sourceAdmin = await sourceClient.query(
        "SELECT count(*)::bigint AS count FROM users WHERE role = 'admin'",
    );
    const restoredAdmin = await drillClient.query(
        "SELECT count(*)::bigint AS count FROM users WHERE role = 'admin'",
    );
    const sourceAdminRow = sourceAdmin.rows[0];
    const restoredAdminRow = restoredAdmin.rows[0];
    const sourceAdmins =
        typeof sourceAdminRow === "object" && sourceAdminRow !== null
            ? Number(sourceAdminRow.count)
            : 0;
    const restoredAdmins =
        typeof restoredAdminRow === "object" && restoredAdminRow !== null
            ? Number(restoredAdminRow.count)
            : 0;
    console.log(
        `  admin accounts:          ${String(sourceAdmins).padStart(8)} -> ${String(restoredAdmins).padStart(8)}`,
    );
    if (sourceAdmins > 0 && restoredAdmins === 0) {
        throw new Error("The restore lost every administrator account.");
    }

    console.log("");
    console.log(`Restore verified in ${drillName}.`);
    console.log(
        "Counts can differ if the source accepted writes after the dump; the dump is a point-in-time copy.",
    );
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return 0;
    }

    loadProjectEnvironment();
    const databaseUrl = requireDatabaseUrl();
    const adminUrl =
        process.env["PRAXBIT_DRILL_ADMIN_URL"]?.trim() ??
        (function maintenanceUrl() {
            const parsed = new URL(databaseUrl);
            parsed.pathname = "/postgres";
            return parsed.toString();
        })();
    const drillName = drillNameFromEnvironment();
    assertSafeToRun(databaseUrl, adminUrl, drillName);

    const bin = resolvePostgresBin();
    const pgDump = executable("pg_dump", bin);
    const pgRestore = executable("pg_restore", bin);

    console.log("Praxbit restore drill");
    console.log(`  Source: ${describeDatabaseUrl(databaseUrl)}`);
    console.log(`  Maintenance database: ${describeDatabaseUrl(adminUrl)}`);
    console.log(`  Drill database: ${drillName}`);

    const workDirectory = await mkdtemp(join(tmpdir(), "praxbit-drill-"));
    const dumpPath = join(workDirectory, `${drillName}.dump`);
    const startedAt = performance.now();
    let admin;
    let drillCreated = false;
    let failure;
    try {
        console.log("");
        console.log("1. Dumping the source database");
        run(
            pgDump,
            [
                `--dbname=${databaseUrl}`,
                "--format=custom",
                "--compress=1",
                "--no-owner",
                "--no-privileges",
                "--no-password",
                `--file=${dumpPath}`,
            ],
            "pg_dump",
        );
        const dumpStats = await stat(dumpPath);
        if (dumpStats.size === 0) {
            throw new Error("pg_dump produced an empty file.");
        }
        console.log(`  Dump size: ${(dumpStats.size / 1048576).toFixed(1)} MB`);

        admin = await connect(adminUrl);
        if (await databaseExists(admin, drillName)) {
            throw new Error(`Drill database ${drillName} already exists. Choose another name.`);
        }
        console.log("");
        console.log("2. Creating the disposable database");
        await admin.query(`CREATE DATABASE "${drillName}"`);
        drillCreated = true;

        const parsedAdmin = new URL(adminUrl);
        parsedAdmin.pathname = `/${drillName}`;
        const drillUrl = parsedAdmin.toString();
        console.log(`  Created ${drillName}`);

        console.log("");
        console.log("3. Restoring the dump");
        run(
            pgRestore,
            [
                `--dbname=${drillUrl}`,
                "--no-owner",
                "--no-privileges",
                "--exit-on-error",
                "--single-transaction",
                dumpPath,
            ],
            "pg_restore",
        );
        console.log("  Restore completed.");

        console.log("");
        console.log("4. Verifying the restored database");
        const sourceClient = await connect(databaseUrl);
        const drillClient = await connect(drillUrl);
        try {
            await verifyRestore(sourceClient, drillClient, databaseUrl, drillName);
        } finally {
            await sourceClient.end().catch(function ignore() {
                return undefined;
            });
            await drillClient.end().catch(function ignore() {
                return undefined;
            });
        }

        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
        console.log("");
        console.log(`Drill passed in ${elapsed} seconds.`);
    } catch (error) {
        failure = error;
    } finally {
        if (drillCreated && admin !== undefined && !options.keepDatabase) {
            console.log("");
            console.log(`5. Dropping ${drillName}`);
            try {
                await admin.query(`DROP DATABASE IF EXISTS "${drillName}" WITH (FORCE)`);
                console.log("  Dropped.");
            } catch (error) {
                console.log(
                    `  Could not drop with FORCE: ${error instanceof Error ? error.message : String(error)}`,
                );
                try {
                    await admin.query(`DROP DATABASE IF EXISTS "${drillName}"`);
                    console.log("  Dropped without FORCE.");
                } catch (dropError) {
                    console.log(
                        `  Drop failed: ${dropError instanceof Error ? dropError.message : String(dropError)}`,
                    );
                    console.log(`  Remove it manually: DROP DATABASE "${drillName}";`);
                }
            }
        } else if (drillCreated && options.keepDatabase) {
            console.log(`Kept drill database ${drillName}.`);
        }
        if (admin !== undefined) {
            await admin.end().catch(function ignore() {
                return undefined;
            });
        }
        if (options.keepDump) {
            console.log(`Kept dump: ${dumpPath}`);
        } else {
            await rm(workDirectory, { recursive: true, force: true });
        }
    }

    if (failure !== undefined) {
        throw failure;
    }
    return 0;
}

try {
    const exitCode = await main();
    process.exitCode = exitCode;
} catch (error) {
    console.error(
        `Restore drill failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
}
