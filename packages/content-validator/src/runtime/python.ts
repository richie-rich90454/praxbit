import { loadPyodide } from "pyodide";
import type { CodeTest } from "@praxbit/contracts";
import type { TestOutcome } from "../types.ts";
import { normalizedJson } from "./javascript.ts";

export type PythonTest = Extract<CodeTest, { kind: "function" }>;

type PythonRuntime = Awaited<ReturnType<typeof loadPyodide>>;

let runtimePromise: Promise<PythonRuntime> | undefined;

function loadRuntime(): Promise<PythonRuntime> {
    if (runtimePromise === undefined) {
        runtimePromise = loadPyodide();
    }
    return runtimePromise;
}

export interface PythonRunResult {
    readonly outcomes: readonly TestOutcome[];
    readonly deferred: boolean;
    readonly deferredReason?: string;
}

interface PythonGlobals {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
}

function failAll(
    tests: readonly PythonTest[],
    message: string,
    deferred: boolean,
): PythonRunResult {
    return {
        outcomes: tests.map(function failed(test): TestOutcome {
            return { description: test.description, passed: false, deferred, error: message };
        }),
        deferred,
        ...(deferred ? { deferredReason: message } : {}),
    };
}

export async function runPythonFunctionTests(
    source: string,
    tests: readonly PythonTest[],
): Promise<PythonRunResult> {
    if (tests.length === 0) {
        return { outcomes: [], deferred: false };
    }

    let pyodide: PythonRuntime;
    try {
        pyodide = await loadRuntime();
    } catch (error) {
        return failAll(
            tests,
            `Pyodide is unavailable in this validator environment: ${error instanceof Error ? error.message : String(error)}`,
            true,
        );
    }

    try {
        pyodide.runPython(source);
    } catch (error) {
        return failAll(tests, error instanceof Error ? error.message : String(error), false);
    }

    const outcomes: TestOutcome[] = [];
    const globals = pyodide.globals as unknown as PythonGlobals;
    for (const test of tests) {
        try {
            const candidate: unknown = globals.get(test.name);
            if (typeof candidate !== "function") {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: `No function named ${test.name} was defined.`,
                });
                continue;
            }

            globals.set("__praxbit_fn", candidate);
            globals.set("__praxbit_args_json", JSON.stringify(test.args));
            pyodide.runPython(
                [
                    "import json as __praxbit_json",
                    "__praxbit_result = __praxbit_fn(*__praxbit_json.loads(__praxbit_args_json))",
                    "__praxbit_result_json = __praxbit_json.dumps(__praxbit_result)",
                ].join("\n"),
            );
            const resultText: unknown = globals.get("__praxbit_result_json");
            if (typeof resultText !== "string") {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: "The Python result could not be serialized as JSON.",
                });
                continue;
            }
            const parsed: unknown = JSON.parse(resultText);
            const actual = normalizedJson(parsed);
            const expected = normalizedJson(test.expected);
            if (actual === expected) {
                outcomes.push({
                    description: test.description,
                    passed: true,
                    deferred: false,
                    actual,
                });
            } else {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    actual,
                    error: `Expected ${expected}, received ${actual}.`,
                });
            }
        } catch (error) {
            outcomes.push({
                description: test.description,
                passed: false,
                deferred: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return { outcomes, deferred: false };
}
