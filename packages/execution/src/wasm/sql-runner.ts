import type { Database, SqlJsStatic } from "sql.js";

export interface SqlCheck {
    readonly description: string;
    readonly verify?: string;
    readonly expectedRows: readonly (readonly unknown[])[];
}

export interface SqlCheckOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: readonly unknown[][];
    readonly error?: string;
}

export interface SqlTestReport {
    readonly outcomes: readonly SqlCheckOutcome[];
}

export interface SqlDatabaseSeed {
    readonly schemaSql: string;
    readonly seedSql: string;
}

let sqlModulePromise: Promise<SqlJsStatic> | undefined;

function loadSqlModule(wasmUrl: string): Promise<SqlJsStatic> {
    if (sqlModulePromise === undefined) {
        sqlModulePromise = import("sql.js").then(function initialize(module): Promise<SqlJsStatic> {
            return module.default({
                locateFile: function locateFile(): string {
                    return wasmUrl;
                },
            });
        });
    }
    return sqlModulePromise;
}

interface QueryOutcome {
    readonly rows: unknown[][];
    readonly error?: string;
}

function execute(db: Database, source: string): QueryOutcome {
    try {
        const results = db.exec(source);
        const last = results[results.length - 1];
        if (last === undefined) {
            return { rows: [] };
        }
        return { rows: last.values.map(function toRow(row): unknown[] { return [...row]; }) };
    } catch (error) {
        return {
            rows: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function rowsEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) {
            return false;
        }
    }
    return true;
}

function resultSetsEqual(left: readonly (readonly unknown[])[], right: readonly (readonly unknown[])[]): boolean {
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

export async function runSqlChecks(
    source: string,
    database: SqlDatabaseSeed,
    checks: readonly SqlCheck[],
    wasmUrl: string,
): Promise<SqlTestReport> {
    const SQL = await loadSqlModule(wasmUrl);
    const outcomes: SqlCheckOutcome[] = [];

    for (const check of checks) {
        const db = new SQL.Database();
        try {
            db.run(database.schemaSql);
            if (database.seedSql.trim().length > 0) {
                db.run(database.seedSql);
            }
        } catch (error) {
            outcomes.push({
                description: check.description,
                passed: false,
                error: `Database setup failed: ${error instanceof Error ? error.message : String(error)}`,
            });
            db.close();
            continue;
        }

        const sourceResult = execute(db, source);
        if (sourceResult.error !== undefined) {
            outcomes.push({ description: check.description, passed: false, error: sourceResult.error });
            db.close();
            continue;
        }

        let rows = sourceResult.rows;
        if (check.verify !== undefined) {
            const verified = execute(db, check.verify);
            if (verified.error !== undefined) {
                outcomes.push({ description: check.description, passed: false, error: verified.error });
                db.close();
                continue;
            }
            rows = verified.rows;
        }

        outcomes.push({
            description: check.description,
            passed: resultSetsEqual(rows, check.expectedRows),
            actual: rows,
        });
        db.close();
    }

    return { outcomes };
}
