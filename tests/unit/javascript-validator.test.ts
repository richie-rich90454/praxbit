import { describe, expect, it } from "vitest";
import {
    runJavaScriptFunctionTests,
    runJavaScriptTests,
    runStaticTests,
    transpileTypeScript,
} from "../../packages/content-validator/src/index.ts";
import type { CodeTest } from "../../packages/contracts/src/index.ts";

type FunctionTest = Extract<CodeTest, { kind: "function" }>;

function functionTest(
    name: string,
    args: FunctionTest["args"],
    expected: FunctionTest["expected"],
    description = "Case.",
): FunctionTest {
    return { kind: "function", description, name, args, expected };
}

describe("trusted JavaScript validation", function javascriptValidation(): void {
    it("runs functions and deep-compares objects regardless of key order", async function compare(): Promise<void> {
        const source = "function makeOrder() { return { total: 5, items: [{ id: 'a' }] }; }";
        const report = await runJavaScriptFunctionTests(source, [
            functionTest("makeOrder", [], { items: [{ id: "a" }], total: 5 }),
        ]);
        expect(report.outcomes[0]?.passed).toBe(true);
    });

    it("does not expose process or require to solution code", async function isolation(): Promise<void> {
        const source = [
            "function environment() {",
            "  return { process: typeof process, require: typeof require };",
            "}",
        ].join("\n");
        const report = await runJavaScriptFunctionTests(source, [
            functionTest("environment", [], { process: "undefined", require: "undefined" }),
        ]);
        expect(report.outcomes[0]?.passed).toBe(true);
    });

    it("stops synchronous runaway solutions", async function timeout(): Promise<void> {
        const report = await runJavaScriptFunctionTests("function spin() { while (true) {} }", [
            functionTest("spin", [], true),
        ]);
        expect(report.outcomes[0]?.passed).toBe(false);
        expect(report.outcomes[0]?.error).toContain("timed out");
    }, 10_000);

    it("transpiles TypeScript before executing function tests", async function typescript(): Promise<void> {
        const report = await runJavaScriptTests({
            language: "typescript",
            files: { "main.ts": "function add(a: number, b: number): number { return a + b; }" },
            entry: "main.ts",
            tests: [functionTest("add", [2, 3], 5)],
        });
        expect(report.outcomes[0]?.passed).toBe(true);
        expect(transpileTypeScript("const value: string = 'ok';").output).toContain(
            "const value = 'ok';",
        );
    });

    it("reports a missing function once per test", async function missing(): Promise<void> {
        const report = await runJavaScriptFunctionTests("function other() {}", [
            functionTest("missing", [], 1),
        ]);
        expect(report.outcomes[0]?.error).toContain("No function named missing");
    });

    it("runs static, regex, and JSON checks over files", function staticChecks(): void {
        const files = {
            "app.js": "function add(a, b) {\n  return a + b;\n}\n",
            "config.json": '{"feature":{"enabled":true},"items":[1,2]}',
        };
        const tests: CodeTest[] = [
            {
                kind: "static",
                description: "Function present.",
                file: "app.js",
                includes: ["function add"],
                excludes: ["eval("],
            },
            {
                kind: "regex",
                description: "Returns a sum.",
                file: "app.js",
                pattern: "return\\s+a\\s*\\+\\s*b",
                flags: "i",
            },
            {
                kind: "json",
                description: "Flag is enabled.",
                file: "config.json",
                path: ["feature", "enabled"],
                expected: true,
            },
        ];
        const outcomes = runStaticTests(files, tests);
        expect(outcomes).toHaveLength(3);
        expect(
            outcomes.every(function passed(outcome): boolean {
                return outcome.passed;
            }),
        ).toBe(true);
    });

    it("reports missing files and invalid JSON", function staticErrors(): void {
        const tests: CodeTest[] = [
            {
                kind: "static",
                description: "Missing file.",
                file: "missing.js",
                includes: ["x"],
                excludes: [],
            },
            { kind: "json", description: "Invalid JSON.", file: "app.js", path: [], expected: {} },
        ];
        const outcomes = runStaticTests({ "app.js": "not json" }, tests);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[1]?.passed).toBe(false);
        expect(outcomes[1]?.error).toContain("Invalid JSON");
    });
});
