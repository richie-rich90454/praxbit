import type { CodeTest } from "@praxbit/contracts";
import type { TestOutcome, TestRunResult } from "../types.ts";
import { runJavaScriptTests } from "./javascript.ts";
import { runCssDeferred, runDomTests } from "./html.ts";
import { runPythonFunctionTests } from "./python.ts";
import { runSqlTests, type SqlDatabaseFixture } from "./sql.ts";
import { runStaticTests } from "./static.ts";

export type CodeLanguage =
    | "javascript"
    | "typescript"
    | "html"
    | "css"
    | "json"
    | "python"
    | "sql"
    | "text";

export interface CodeRunInput {
    readonly language: CodeLanguage;
    readonly files: Readonly<Record<string, string>>;
    readonly entry: string;
    readonly tests: readonly CodeTest[];
    readonly database?: SqlDatabaseFixture;
}

function unsupported(test: CodeTest, message: string): TestOutcome {
    return { description: test.description, passed: false, deferred: false, error: message };
}

export async function runCodeTests(input: CodeRunInput): Promise<TestRunResult> {
    const outcomes: TestOutcome[] = [];
    const functionTests = input.tests.filter(function isFunction(
        test: CodeTest,
    ): test is Extract<CodeTest, { kind: "function" }> {
        return test.kind === "function";
    });
    const domTests = input.tests.filter(function isDom(test: CodeTest): boolean {
        return test.kind === "dom";
    });
    const sqlTests = input.tests.filter(function isSql(test: CodeTest): boolean {
        return test.kind === "sql";
    });
    const staticTests = input.tests.filter(function isStatic(test: CodeTest): boolean {
        return test.kind === "static" || test.kind === "regex" || test.kind === "json";
    });

    if (functionTests.length > 0) {
        if (input.language === "javascript" || input.language === "typescript") {
            const report = await runJavaScriptTests({
                language: input.language,
                files: input.files,
                entry: input.entry,
                tests: functionTests,
            });
            outcomes.push(...report.outcomes);
        } else if (input.language === "python") {
            const report = await runPythonFunctionTests(
                input.files[input.entry] ?? "",
                functionTests,
            );
            outcomes.push(...report.outcomes);
        } else {
            outcomes.push(
                ...functionTests.map(function invalid(test): TestOutcome {
                    return unsupported(
                        test,
                        `Function tests are not executable for ${input.language}.`,
                    );
                }),
            );
        }
    }

    if (domTests.length > 0) {
        outcomes.push(...runDomTests(input.files, domTests.filter(isDomTest)));
    }

    outcomes.push(...runCssDeferred(input.tests));

    if (sqlTests.length > 0) {
        if (input.database === undefined) {
            outcomes.push(
                ...sqlTests.map(function missing(test): TestOutcome {
                    return unsupported(test, "The SQL step has no database fixture.");
                }),
            );
        } else {
            const report = await runSqlTests(
                input.files[input.entry] ?? "",
                input.database,
                sqlTests.filter(isSqlTest),
            );
            outcomes.push(...report);
        }
    }

    if (staticTests.length > 0) {
        outcomes.push(...runStaticTests(input.files, staticTests));
    }

    const handled = new Set<CodeTest["kind"]>([
        "function",
        "dom",
        "css",
        "sql",
        "static",
        "regex",
        "json",
    ]);
    for (const test of input.tests) {
        if (!handled.has(test.kind)) {
            outcomes.push(unsupported(test, `Unknown test kind: ${String(test.kind)}`));
        }
    }

    return { outcomes };
}

function isDomTest(test: CodeTest): test is Extract<CodeTest, { kind: "dom" }> {
    return test.kind === "dom";
}

function isSqlTest(test: CodeTest): test is Extract<CodeTest, { kind: "sql" }> {
    return test.kind === "sql";
}
