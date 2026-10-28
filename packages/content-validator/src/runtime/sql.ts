import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
import type { CodeTest } from "@praxbit/contracts";
import type { TestOutcome } from "../types.ts";
import { normalizedJson } from "./javascript.ts";

export type SqlTest = Extract<CodeTest, { kind: "sql" }>;

export interface SqlDatabaseFixture {
    readonly schemaSql: string;
    readonly seedSql: string;
}

let modulePromise: Promise<SqlJsStatic> | undefined;

function loadSqlModule(): Promise<SqlJsStatic> {
    if (modulePromise === undefined) {
        modulePromise = (async function initialize(): Promise<SqlJsStatic> {
            const require = createRequire(import.meta.url);
            const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
            return initSqlJs({
                locateFile: function locateFile(): string {
                    return wasmPath;
                },
            });
        })();
    }
    return modulePromise;
}

interface QueryResult {
    readonly rows: readonly (readonly unknown[])[];
    readonly error?: string;
}

function execute(db: Database, source: string): QueryResult {
    try {
        const results = db.exec(source);
        const last = results[results.length - 1];
        if (last === undefined) {
            return { rows: [] };
        }
        const rows: unknown[][] = [];
        for (const row of last.values) {
            rows.push([...row]);
        }
        return { rows };
    } catch (error) {
        return { rows: [], error: error instanceof Error ? error.message : String(error) };
    }
}

function rowsEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (normalizedJson(left[index]) !== normalizedJson(right[index])) {
            return false;
        }
    }
    return true;
}

function resultSetsEqual(
    left: readonly (readonly unknown[])[],
    right: readonly (readonly unknown[])[],
): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftRow = left[index];
        const rightRow = right[index];
        if (leftRow === undefined || rightRow === undefined || !rowsEqual(leftRow, rightRow)) {
            return false;
        }
    }
    return true;
}

export async function runSqlTests(
    source: string,
    database: SqlDatabaseFixture,
    tests: readonly SqlTest[],
): Promise<TestOutcome[]> {
    const SQL = await loadSqlModule();
    const outcomes: TestOutcome[] = [];

    for (const test of tests) {
        const db = new SQL.Database();
        try {
            db.run(database.schemaSql);
            if (database.seedSql.trim().length > 0) {
                db.run(database.seedSql);
            }
        } catch (error) {
            outcomes.push({
                description: test.description,
                passed: false,
                deferred: false,
                error: `Database setup failed: ${error instanceof Error ? error.message : String(error)}`,
            });
            db.close();
            continue;
        }

        const sourceResult = execute(db, source);
        if (sourceResult.error !== undefined) {
            outcomes.push({
                description: test.description,
                passed: false,
                deferred: false,
                error: sourceResult.error,
            });
            db.close();
            continue;
        }

        let rows = sourceResult.rows;
        if (test.verify !== undefined) {
            const verified = execute(db, test.verify);
            if (verified.error !== undefined) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: verified.error,
                });
                db.close();
                continue;
            }
            rows = verified.rows;
        }

        const passed = resultSetsEqual(rows, test.expectedRows);
        outcomes.push({
            description: test.description,
            passed,
            deferred: false,
            actual: normalizedJson(rows),
            ...(passed
                ? {}
                : {
                      error: `Expected ${normalizedJson(test.expectedRows)}, received ${normalizedJson(rows)}.`,
                  }),
        });
        db.close();
    }

    return outcomes;
}
