import type { CodeTest } from "@praxbit/contracts";
import { runJavaScriptTests } from "@praxbit/execution/browser";
import { runPreviewChecks, type PreviewCheck } from "@praxbit/execution/browser";
import { runSqlChecks } from "@praxbit/execution/wasm";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { runPythonTests } from "../../platform/python-runner.ts";

export interface CheckOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly expected?: string;
    readonly actual?: string;
    readonly error?: string;
}

export interface CheckRunResult {
    readonly outcomes: readonly CheckOutcome[];
    readonly stdout: string;
    readonly stderr: string;
    readonly diagnostics: readonly {
        readonly message: string;
        readonly severity: "error" | "warning";
    }[];
}

export interface CheckRunInput {
    readonly language: string;
    readonly files: Readonly<Record<string, string>>;
    readonly entry: string;
    readonly tests: readonly CodeTest[];
    readonly database?: { readonly schemaSql: string; readonly seedSql: string };
}

type FunctionTest = Extract<CodeTest, { kind: "function" }>;
type SqlTest = Extract<CodeTest, { kind: "sql" }>;

function isFunctionTest(test: CodeTest): test is FunctionTest {
    return test.kind === "function";
}

function isSqlTest(test: CodeTest): test is SqlTest {
    return test.kind === "sql";
}

function normalizeJson(value: unknown): string {
    if (value === undefined) {
        return "undefined";
    }
    try {
        return JSON.stringify(value);
    } catch {
        return "[unserializable value]";
    }
}

function deepEqual(left: unknown, right: unknown): boolean {
    return normalizeJson(left) === normalizeJson(right);
}

function pathValue(root: unknown, path: readonly (string | number)[]): unknown {
    let cursor = root;
    for (const segment of path) {
        if (cursor === null || typeof cursor !== "object") {
            return undefined;
        }
        if (Array.isArray(cursor)) {
            if (typeof segment !== "number") {
                return undefined;
            }
            cursor = cursor[segment];
        } else {
            if (typeof segment !== "string") {
                return undefined;
            }
            cursor = (cursor as Record<string, unknown>)[segment];
        }
    }
    return cursor;
}

function staticChecks(
    files: Readonly<Record<string, string>>,
    tests: readonly CodeTest[],
): CheckOutcome[] {
    const outcomes: CheckOutcome[] = [];
    for (const test of tests) {
        if (test.kind === "static") {
            const content = files[test.file] ?? "";
            const includesOk = test.includes.every(function included(fragment: string): boolean {
                return content.includes(fragment);
            });
            const excludesOk = (test.excludes ?? []).every(function absent(
                fragment: string,
            ): boolean {
                return !content.includes(fragment);
            });
            outcomes.push({
                description: test.description,
                passed: includesOk && excludesOk,
                ...(includesOk && excludesOk
                    ? {}
                    : { error: "The file does not contain the required structure." }),
            });
        }
        if (test.kind === "regex") {
            const content = files[test.file] ?? "";
            let pattern: RegExp | undefined;
            try {
                pattern = new RegExp(test.pattern, test.flags);
            } catch (error) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    error: error instanceof Error ? error.message : "Invalid pattern",
                });
                continue;
            }
            outcomes.push({
                description: test.description,
                passed: pattern.test(content),
                ...(pattern.test(content) ? {} : { error: "The pattern was not found." }),
            });
        }
        if (test.kind === "json") {
            const content = files[test.file] ?? "";
            try {
                const parsed = JSON.parse(content) as unknown;
                const actual = pathValue(parsed, test.path);
                outcomes.push({
                    description: test.description,
                    passed: deepEqual(actual, test.expected),
                    expected: normalizeJson(test.expected),
                    actual: normalizeJson(actual),
                });
            } catch (error) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    error: error instanceof Error ? error.message : "Invalid JSON",
                });
            }
        }
    }
    return outcomes;
}

function sourceForJavaScript(files: Readonly<Record<string, string>>, entry: string): string {
    const parts: string[] = [];
    for (const [path, content] of Object.entries(files)) {
        if (path !== entry && path.endsWith(".js")) {
            parts.push(content);
        }
    }
    parts.push(files[entry] ?? "");
    return parts.join("\n\n");
}

async function executeJavaScript(
    input: CheckRunInput,
    extraDiagnostics: readonly { message: string; severity: "error" | "warning" }[],
): Promise<CheckRunResult> {
    const functionTests = input.tests.filter(isFunctionTest);
    const staticOutcomes = staticChecks(input.files, input.tests);
    if (functionTests.length === 0) {
        return { outcomes: staticOutcomes, stdout: "", stderr: "", diagnostics: extraDiagnostics };
    }
    const report = await runJavaScriptTests({
        source: sourceForJavaScript(input.files, input.entry),
        tests: functionTests.map(function toWorkerTest(test): {
            description: string;
            name: string;
            args: readonly unknown[];
            expected: unknown;
        } {
            return {
                description: test.description,
                name: test.name,
                args: test.args,
                expected: test.expected,
            };
        }),
    });
    const outcomes: CheckOutcome[] = report.outcomes.map(
        function toOutcome(outcome, index): CheckOutcome {
            const test = functionTests[index];
            return {
                description: outcome.description,
                passed: outcome.passed,
                ...(test === undefined ? {} : { expected: normalizeJson(test.expected) }),
                ...(outcome.actual === undefined ? {} : { actual: outcome.actual }),
                ...(outcome.error === undefined ? {} : { error: outcome.error }),
            };
        },
    );
    return {
        outcomes: [...outcomes, ...staticOutcomes],
        stdout: report.stdout,
        stderr: report.stderr,
        diagnostics: extraDiagnostics,
    };
}

async function executeTypeScript(input: CheckRunInput): Promise<CheckRunResult> {
    const typescript = await import("typescript");
    const combined = sourceForJavaScript(input.files, input.entry);
    const result = typescript.transpileModule(combined, {
        compilerOptions: {
            target: typescript.ScriptTarget.ES2020,
            module: typescript.ModuleKind.None,
            strict: false,
        },
        reportDiagnostics: true,
    });
    const diagnostics = (result.diagnostics ?? []).map(function toDiagnostic(diagnostic): {
        message: string;
        severity: "error" | "warning";
    } {
        return {
            message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
            severity:
                diagnostic.category === typescript.DiagnosticCategory.Error ? "error" : "warning",
        };
    });
    const hasErrors = diagnostics.some(function error(item): boolean {
        return item.severity === "error";
    });
    if (hasErrors) {
        return {
            outcomes: input.tests.map(function failed(test): CheckOutcome {
                return {
                    description: test.description,
                    passed: false,
                    error: "TypeScript syntax diagnostics must be fixed first.",
                };
            }),
            stdout: "",
            stderr: "",
            diagnostics,
        };
    }
    return executeJavaScript(
        { ...input, files: { ...input.files, [input.entry]: result.outputText } },
        diagnostics,
    );
}

async function executePreview(input: CheckRunInput): Promise<CheckRunResult> {
    const checks: PreviewCheck[] = [];
    for (const test of input.tests) {
        if (test.kind === "dom") {
            checks.push({
                kind: "dom",
                description: test.description,
                selector: test.selector,
                property: test.property,
                ...(test.attribute === undefined ? {} : { attribute: test.attribute }),
                ...(test.click === undefined ? {} : { click: test.click }),
                ...(test.clickCount === undefined ? {} : { clickCount: test.clickCount }),
                expected: test.expected,
            });
        }
        if (test.kind === "css") {
            checks.push({
                kind: "css",
                description: test.description,
                selector: test.selector,
                property: test.property,
                expected: test.expected,
            });
        }
    }
    const previewReport = await runPreviewChecks(input.files, checks);
    const outcomes: CheckOutcome[] = previewReport.outcomes.map(
        function toOutcome(outcome): CheckOutcome {
            const converted: {
                description: string;
                passed: boolean;
                actual?: string;
                error?: string;
            } = {
                description: outcome.description,
                passed: outcome.passed,
            };
            if (outcome.actual !== undefined) {
                converted.actual = outcome.actual;
            }
            if (outcome.error !== undefined) {
                converted.error = outcome.error;
            }
            return converted;
        },
    );
    return {
        outcomes: [...outcomes, ...staticChecks(input.files, input.tests)],
        stdout: "",
        stderr: "",
        diagnostics: [],
    };
}

async function executePython(input: CheckRunInput): Promise<CheckRunResult> {
    const functionTests = input.tests.filter(isFunctionTest);
    const report = await runPythonTests(
        input.files[input.entry] ?? "",
        functionTests.map(function toTest(test): {
            description: string;
            name: string;
            args: readonly unknown[];
            expected: unknown;
        } {
            return {
                description: test.description,
                name: test.name,
                args: test.args,
                expected: test.expected,
            };
        }),
    );
    return {
        outcomes: [
            ...report.outcomes.map(function toOutcome(outcome, index): CheckOutcome {
                const test = functionTests[index];
                return {
                    description: outcome.description,
                    passed: outcome.passed,
                    ...(test === undefined ? {} : { expected: normalizeJson(test.expected) }),
                    ...(outcome.actual === undefined ? {} : { actual: outcome.actual }),
                    ...(outcome.error === undefined ? {} : { error: outcome.error }),
                };
            }),
            ...staticChecks(input.files, input.tests),
        ],
        stdout: report.stdout,
        stderr: report.stderr,
        diagnostics: [],
    };
}

async function executeSql(input: CheckRunInput): Promise<CheckRunResult> {
    if (input.database === undefined) {
        return {
            outcomes: input.tests.map(function failed(test): CheckOutcome {
                return {
                    description: test.description,
                    passed: false,
                    error: "No database fixture is defined.",
                };
            }),
            stdout: "",
            stderr: "",
            diagnostics: [],
        };
    }
    const sqlTests = input.tests.filter(isSqlTest);
    const report = await runSqlChecks(
        input.files[input.entry] ?? "",
        input.database,
        sqlTests.map(function toCheck(test): {
            description: string;
            verify?: string;
            expectedRows: readonly (readonly unknown[])[];
        } {
            const check: {
                description: string;
                verify?: string;
                expectedRows: readonly (readonly unknown[])[];
            } = {
                description: test.description,
                expectedRows: test.expectedRows,
            };
            if (test.verify !== undefined) {
                check.verify = test.verify;
            }
            return check;
        }),
        sqlWasmUrl,
    );
    return {
        outcomes: report.outcomes.map(function toOutcome(outcome): CheckOutcome {
            const converted: {
                description: string;
                passed: boolean;
                actual?: string;
                error?: string;
            } = {
                description: outcome.description,
                passed: outcome.passed,
            };
            if (outcome.actual !== undefined) {
                converted.actual = JSON.stringify(outcome.actual);
            }
            if (outcome.error !== undefined) {
                converted.error = outcome.error;
            }
            return converted;
        }),
        stdout: "",
        stderr: "",
        diagnostics: [],
    };
}

export async function executeChecks(input: CheckRunInput): Promise<CheckRunResult> {
    if (input.language === "typescript") {
        return executeTypeScript(input);
    }
    if (input.language === "javascript") {
        return executeJavaScript(input, []);
    }
    if (input.language === "python") {
        return executePython(input);
    }
    if (input.language === "sql") {
        return executeSql(input);
    }
    if (input.language === "html" || input.language === "css") {
        return executePreview(input);
    }
    return {
        outcomes: staticChecks(input.files, input.tests),
        stdout: "",
        stderr: "",
        diagnostics: [],
    };
}
