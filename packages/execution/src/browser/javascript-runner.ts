export interface JavaScriptTestCase {
    readonly description: string;
    readonly name: string;
    readonly args: readonly unknown[];
    readonly expected: unknown;
}

export interface JavaScriptTestOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: string;
    readonly error?: string;
}

export interface JavaScriptTestRequest {
    readonly source: string;
    readonly tests: readonly JavaScriptTestCase[];
    readonly timeoutMs?: number;
    readonly maximumOutputBytes?: number;
}

export interface JavaScriptTestReport {
    readonly outcomes: readonly JavaScriptTestOutcome[];
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
}

interface WorkerResultMessage {
    readonly type: "result";
    readonly outcomes: readonly JavaScriptTestOutcome[];
    readonly stdout: string;
    readonly stderr: string;
}

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_OUTPUT_BYTES = 20_000;

export async function runJavaScriptTests(
    request: JavaScriptTestRequest,
    signal?: AbortSignal,
): Promise<JavaScriptTestReport> {
    const worker = new Worker(new URL("./javascript.worker.ts", import.meta.url), {
        type: "module",
    });
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maximumOutputBytes = request.maximumOutputBytes ?? DEFAULT_OUTPUT_BYTES;

    return await new Promise<JavaScriptTestReport>(function executor(resolve, reject): void {
        let settled = false;

        const timer = setTimeout(function onTimeout(): void {
            if (settled) {
                return;
            }
            settled = true;
            worker.terminate();
            resolve({
                outcomes: request.tests.map(function timedOut(test): JavaScriptTestOutcome {
                    return { description: test.description, passed: false, error: "Timed out." };
                }),
                stdout: "",
                stderr: "",
                timedOut: true,
            });
        }, timeoutMs);

        function finish(report: JavaScriptTestReport): void {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            worker.terminate();
            resolve(report);
        }

        function fail(error: unknown): void {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            worker.terminate();
            reject(error instanceof Error ? error : new Error(String(error)));
        }

        worker.onmessage = function onMessage(event: MessageEvent<WorkerResultMessage>): void {
            if (event.data.type !== "result") {
                return;
            }
            finish({
                outcomes: event.data.outcomes,
                stdout: event.data.stdout,
                stderr: event.data.stderr,
                timedOut: false,
            });
        };

        worker.onerror = function onError(event: ErrorEvent): void {
            fail(new Error(event.message));
        };

        if (signal !== undefined) {
            signal.addEventListener("abort", function onAbort(): void {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                worker.terminate();
                resolve({ outcomes: [], stdout: "", stderr: "", timedOut: false });
            });
        }

        worker.postMessage({
            type: "run",
            source: request.source,
            tests: request.tests,
            maximumOutputBytes,
        });
    });
}
