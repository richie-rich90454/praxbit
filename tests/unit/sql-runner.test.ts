import { describe, expect, it } from "vitest";
import { runSqlTests } from "../../packages/content-validator/src/runtime/sql.ts";
import type { CodeTest } from "../../packages/contracts/src/index.ts";

type SqlTest = Extract<CodeTest, { kind: "sql" }>;

const database = {
    schemaSql: "CREATE TABLE items (id TEXT PRIMARY KEY, stock INTEGER NOT NULL);\n",
    seedSql: "INSERT INTO items (id, stock) VALUES ('pencil', 5), ('notebook', 2), ('lamp', 0);\n",
};

function sqlTest(expectedRows: SqlTest["expectedRows"]): SqlTest {
    return { kind: "sql", description: "Rows match.", expectedRows };
}

describe("runSqlTests", function sqlRunner(): void {
    it("compares query rows in order", async function ordered(): Promise<void> {
        const outcomes = await runSqlTests(
            "SELECT id, stock FROM items WHERE stock > 0 ORDER BY stock DESC;\n",
            database,
            [
                sqlTest([
                    ["pencil", 5],
                    ["notebook", 2],
                ]),
            ],
        );
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0]?.passed).toBe(true);
    });

    it("fails when row order differs", async function orderMismatch(): Promise<void> {
        const outcomes = await runSqlTests(
            "SELECT id, stock FROM items WHERE stock > 0 ORDER BY stock ASC;\n",
            database,
            [
                sqlTest([
                    ["pencil", 5],
                    ["notebook", 2],
                ]),
            ],
        );
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain("Expected");
    });

    it("honors a verify query for schema steps", async function verify(): Promise<void> {
        const outcomes = await runSqlTests(
            "CREATE TABLE archived (id TEXT PRIMARY KEY);\nINSERT INTO archived (id) VALUES ('notebook'), ('pencil');\n",
            database,
            [
                {
                    kind: "sql",
                    description: "The archive contains both products.",
                    verify: "SELECT id FROM archived ORDER BY id;",
                    expectedRows: [["notebook"], ["pencil"]],
                },
            ],
        );
        expect(outcomes[0]?.passed).toBe(true);
    });

    it("reports SQL errors without throwing", async function invalid(): Promise<void> {
        const outcomes = await runSqlTests("SELECT missing FROM items;\n", database, [sqlTest([])]);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain("missing");
    });

    it("reports database setup failures", async function setup(): Promise<void> {
        const outcomes = await runSqlTests("SELECT 1;\n", { schemaSql: "BAD SQL;", seedSql: "" }, [
            sqlTest([[1]]),
        ]);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain("Database setup failed");
    });
});
