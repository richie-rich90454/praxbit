interface PyodideRuntime {
    runPython(code: string): unknown;
    globals: { get(name: string): unknown };
    setStdout(options: { batched: (text: string) => void }): void;
    setStderr(options: { batched: (text: string) => void }): void;
}

interface PythonTest {
    readonly description: string;
    readonly name: string;
    readonly args: readonly unknown[];
    readonly expected: unknown;
}

interface PythonRequest {
    readonly type: "run";
    readonly source: string;
    readonly tests: readonly PythonTest[];
}

interface PythonOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: string;
    readonly error?: string;
}

function canonicalize(value: unknown, seen: Set<object>): unknown {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (value === undefined) {
        return "__undefined";
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
    return String(value);
}

function normalizedJson(value: unknown): string {
    return JSON.stringify(canonicalize(value, new Set<object>()));
}

let runtimePromise: Promise<PyodideRuntime> | undefined;

async function loadRuntime(): Promise<PyodideRuntime> {
    if (runtimePromise === undefined) {
        runtimePromise = (async function initialize(): Promise<PyodideRuntime> {
            const moduleUrl = new URL("/pyodide/pyodide.mjs", self.location.origin).href;
            const pyodideModule = (await import(/* @vite-ignore */ moduleUrl)) as {
                loadPyodide(options: { indexURL: string }): Promise<PyodideRuntime>;
            };
            return await pyodideModule.loadPyodide({ indexURL: "/pyodide/" });
        })();
    }
    return runtimePromise;
}

self.onmessage = async function handleMessage(event: MessageEvent<PythonRequest>): Promise<void> {
    const request = event.data;
    if (request.type !== "run") {
        return;
    }

    let stdout = "";
    let stderr = "";
    const outcomes: PythonOutcome[] = [];

    try {
        const pyodide = await loadRuntime();
        pyodide.setStdout({
            batched: function onStdout(text: string): void {
                stdout += `${text}\n`;
            },
        });
        pyodide.setStderr({
            batched: function onStderr(text: string): void {
                stderr += `${text}\n`;
            },
        });

        const run = function runPython(source: string): void {
            pyodide.runPython(source);
        };

        for (const test of request.tests) {
            try {
                run(request.source);
                const candidate = pyodide.globals.get(test.name);
                if (typeof candidate !== "function") {
                    outcomes.push({
                        description: test.description,
                        passed: false,
                        error: `No function named ${test.name} was defined.`,
                    });
                    continue;
                }
                let result: unknown = (candidate as (...args: unknown[]) => unknown)(...test.args);
                if (typeof result === "object" && result !== null && "toJs" in result) {
                    const proxy = result as { toJs(): unknown; destroy?(): void };
                    result = proxy.toJs();
                    proxy.destroy?.();
                }
                const passed = normalizedJson(result) === normalizedJson(test.expected);
                outcomes.push({
                    description: test.description,
                    passed,
                    actual: normalizedJson(result),
                    ...(passed ? {} : { error: `Expected ${normalizedJson(test.expected)}, received ${normalizedJson(result)}.` }),
                });
            } catch (error) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    } catch (error) {
        for (const test of request.tests) {
            outcomes.push({
                description: test.description,
                passed: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    (self as unknown as { postMessage(message: unknown): void }).postMessage({
        type: "result",
        outcomes,
        stdout,
        stderr,
    });
};
