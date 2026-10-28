import vm from "node:vm";
import ts from "typescript";
import type { CodeTest } from "@praxbit/contracts";
import type { TestOutcome } from "../types.ts";

// Trusted authored-solution validation only. node:vm is not a learner sandbox.
// TypeScript 7 removed transpileModule, so this package pins TypeScript 5.9.3.
export type FunctionTest = Extract<CodeTest, { kind: "function" }>;

export interface FunctionRunResult {
    readonly outcomes: readonly TestOutcome[];
}

export function canonicalize(value: unknown, seen: Set<object>): unknown {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        if (typeof value === "number" && !Number.isFinite(value)) {
            return `__number:${String(value)}`;
        }
        return value;
    }
    if (value === undefined) {
        return "__undefined";
    }
    if (typeof value === "bigint") {
        return `__bigint:${value.toString()}`;
    }
    if (typeof value === "function") {
        return "__function";
    }
    if (typeof value === "object") {
        if (seen.has(value)) {
            return "__circular";
        }
        seen.add(value);
        if (Array.isArray(value)) {
            return value.map(function mapValue(item: unknown): unknown {
                return canonicalize(item, seen);
            });
        }
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(record).sort()) {
            sorted[key] = canonicalize(record[key], seen);
        }
        seen.delete(value);
        return sorted;
    }
    return "__unsupported";
}

export function normalizedJson(value: unknown): string {
    try {
        return JSON.stringify(canonicalize(value, new Set<object>()));
    } catch (error) {
        return `__error:${error instanceof Error ? error.message : "unknown"}`;
    }
}

export function combineSources(
    files: Readonly<Record<string, string>>,
    entry: string,
    extension: string,
): string {
    const parts: string[] = [];
    for (const [filePath, content] of Object.entries(files)) {
        if (filePath !== entry && filePath.endsWith(extension)) {
            parts.push(content);
        }
    }
    parts.push(files[entry] ?? "");
    return parts.join("\n\n");
}

export interface TranspileResult {
    readonly output?: string;
    readonly diagnostics: readonly string[];
}

export function transpileTypeScript(source: string): TranspileResult {
    const result = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.None,
            strict: false,
        },
        reportDiagnostics: true,
    });
    const diagnostics: string[] = [];
    for (const diagnostic of result.diagnostics ?? []) {
        if (diagnostic.category === ts.DiagnosticCategory.Error) {
            diagnostics.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        }
    }
    return diagnostics.length === 0 ? { output: result.outputText, diagnostics } : { diagnostics };
}

function timeoutPromise(milliseconds: number): Promise<never> {
    return new Promise(function rejectAfter(resolve, reject): void {
        void resolve;
        const timer = setTimeout(function onTimeout(): void {
            reject(new Error(`The trusted solution did not finish within ${milliseconds}ms.`));
        }, milliseconds);
        timer.unref();
    });
}

async function runSingleFunction(
    context: vm.Context,
    contextGlobals: Record<string, unknown>,
    test: FunctionTest,
): Promise<TestOutcome> {
    const started = Date.now();
    try {
        const candidate: unknown = vm.runInContext(
            `typeof ${test.name} === "function" ? ${test.name} : undefined`,
            context,
            { timeout: 1000 },
        );
        if (typeof candidate !== "function") {
            return {
                description: test.description,
                passed: false,
                deferred: false,
                error: `No function named ${test.name} was defined.`,
            };
        }
        contextGlobals["__praxbitArgs"] = test.args;
        const callStarted = Date.now();
        const result: unknown = vm.runInContext(
            `__praxbitArgs === undefined ? undefined : ${test.name}.apply(undefined, __praxbitArgs)`,
            context,
            { timeout: 1000 },
        );
        const remaining = Math.max(50, 1000 - (Date.now() - callStarted));
        const awaited = await Promise.race([Promise.resolve(result), timeoutPromise(remaining)]);
        const actual = normalizedJson(awaited);
        const expected = normalizedJson(test.expected);
        if (actual === expected) {
            return { description: test.description, passed: true, deferred: false, actual };
        }
        return {
            description: test.description,
            passed: false,
            deferred: false,
            actual,
            error: `Expected ${expected}, received ${actual} (${Date.now() - started}ms).`,
        };
    } catch (error) {
        return {
            description: test.description,
            passed: false,
            deferred: false,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
    } finally {
        delete contextGlobals["__praxbitArgs"];
    }
}

export async function runJavaScriptFunctionTests(
    source: string,
    tests: readonly FunctionTest[],
): Promise<FunctionRunResult> {
    if (tests.length === 0) {
        return { outcomes: [] };
    }

    const contextGlobals: Record<string, unknown> = {
        console: {
            log: function log(): void {
                return;
            },
            error: function error(): void {
                return;
            },
            warn: function warn(): void {
                return;
            },
        },
    };
    const context = vm.createContext(contextGlobals);

    try {
        vm.runInContext(source, context, { timeout: 1000, filename: "reference-solution.js" });
    } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        return {
            outcomes: tests.map(function failed(test): TestOutcome {
                return {
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: message,
                };
            }),
        };
    }

    const outcomes: TestOutcome[] = [];
    for (const test of tests) {
        outcomes.push(await runSingleFunction(context, contextGlobals, test));
    }
    return { outcomes };
}

export interface JavaScriptRunInput {
    readonly language: "javascript" | "typescript";
    readonly files: Readonly<Record<string, string>>;
    readonly entry: string;
    readonly tests: readonly CodeTest[];
}

export async function runJavaScriptTests(input: JavaScriptRunInput): Promise<FunctionRunResult> {
    const functionTests = input.tests.filter(function isFunction(
        test: CodeTest,
    ): test is FunctionTest {
        return test.kind === "function";
    });
    if (functionTests.length === 0) {
        return { outcomes: [] };
    }

    const extension = input.language === "typescript" ? ".ts" : ".js";
    const source = combineSources(input.files, input.entry, extension);
    if (input.language === "typescript") {
        const transpiled = transpileTypeScript(source);
        if (transpiled.output === undefined) {
            return {
                outcomes: functionTests.map(function failed(test): TestOutcome {
                    return {
                        description: test.description,
                        passed: false,
                        deferred: false,
                        error: `TypeScript diagnostics: ${transpiled.diagnostics.join("; ")}`,
                    };
                }),
            };
        }
        return runJavaScriptFunctionTests(transpiled.output, functionTests);
    }
    return runJavaScriptFunctionTests(source, functionTests);
}
