interface WorkerTest {
    readonly description: string;
    readonly name: string;
    readonly args: readonly unknown[];
    readonly expected: unknown;
}

interface WorkerRequest {
    readonly type: "run";
    readonly source: string;
    readonly tests: readonly WorkerTest[];
    readonly maximumOutputBytes: number;
}

interface TestOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: string;
    readonly error?: string;
}

interface WorkerResponse {
    readonly type: "result";
    readonly outcomes: readonly TestOutcome[];
    readonly stdout: string;
    readonly stderr: string;
}

function canonicalize(value: unknown, seen: Set<object>): unknown {
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

function normalizedJson(value: unknown): string {
    try {
        return JSON.stringify(canonicalize(value, new Set<object>()));
    } catch (error) {
        return `__error:${error instanceof Error ? error.message : "unknown"}`;
    }
}

function installNetworkBlocks(): void {
    const blocked = function blockedNetwork(): never {
        throw new Error("Network access is disabled inside the exercise worker.");
    };
    const scope = self as unknown as Record<string, unknown>;
    scope["fetch"] = blocked;
    scope["XMLHttpRequest"] = blocked;
    scope["WebSocket"] = blocked;
    scope["EventSource"] = blocked;
    scope["importScripts"] = blocked;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon = function blockedBeacon(): boolean {
            throw new Error("Network access is disabled inside the exercise worker.");
        };
    }
}

function evaluateSource(source: string): unknown {
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval -- The worker exists to execute learner source; this is the intended execution boundary, bounded by a timeout and no DOM access.
    const factory: unknown = new Function(source);
    if (typeof factory !== "function") {
        throw new Error("The exercise source did not produce a callable function.");
    }
    return Reflect.apply(factory, undefined, []);
}

self.onmessage = async function handleMessage(event: MessageEvent<WorkerRequest>): Promise<void> {
    installNetworkBlocks();
    const request = event.data;
    if (request.type !== "run") {
        return;
    }

    let stdout = "";
    let stderr = "";
    const limit = request.maximumOutputBytes;

    function append(current: string, text: string): string {
        const next = `${current}${text}\n`;
        return next.length > limit ? `${next.slice(0, limit)}\n[output truncated]` : next;
    }

    console.log = function log(...args: unknown[]): void {
        stdout = append(
            stdout,
            args
                .map(function stringify(value: unknown): string {
                    if (typeof value === "string") {
                        return value;
                    }
                    try {
                        return JSON.stringify(value);
                    } catch {
                        return String(value);
                    }
                })
                .join(" "),
        );
    };
    console.error = function error(...args: unknown[]): void {
        stderr = append(
            stderr,
            args
                .map(function stringify(value: unknown): string {
                    return value instanceof Error ? value.message : String(value);
                })
                .join(" "),
        );
    };

    const outcomes: TestOutcome[] = [];

    for (const test of request.tests) {
        try {
            const fn = evaluateSource(
                `${request.source}\n;return typeof ${test.name} === "function" ? ${test.name} : undefined;`,
            );
            if (typeof fn !== "function") {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    error: `No function named ${test.name} was defined.`,
                });
                continue;
            }
            const actual: unknown = await Promise.resolve(
                Reflect.apply(fn, undefined, [...test.args]),
            );
            const passed = normalizedJson(actual) === normalizedJson(test.expected);
            outcomes.push({
                description: test.description,
                passed,
                actual: normalizedJson(actual),
                ...(passed
                    ? {}
                    : {
                          error: `Expected ${normalizedJson(test.expected)}, received ${normalizedJson(actual)}.`,
                      }),
            });
        } catch (error) {
            outcomes.push({
                description: test.description,
                passed: false,
                error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            });
        }
    }

    const response: WorkerResponse = { type: "result", outcomes, stdout, stderr };
    (self as unknown as { postMessage(message: WorkerResponse): void }).postMessage(response);
};
