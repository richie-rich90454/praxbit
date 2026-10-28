export interface PythonTestOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: string;
    readonly error?: string;
}

export interface PythonTestReport {
    readonly outcomes: readonly PythonTestOutcome[];
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
}

interface WorkerResult {
    readonly type: "result";
    readonly outcomes: readonly PythonTestOutcome[];
    readonly stdout: string;
    readonly stderr: string;
}

export async function runPythonTests(
    source: string,
    tests: readonly { description: string; name: string; args: readonly unknown[]; expected: unknown }[],
    timeoutMs = 30_000,
): Promise<PythonTestReport> {
    const worker = new Worker(new URL("./python.worker.ts", import.meta.url), { type: "module" });

    return await new Promise<PythonTestReport>(function executor(resolve): void {
        let settled = false;

        function cleanup(): void {
            clearTimeout(timer);
            worker.terminate();
        }

        const timer = setTimeout(function onTimeout(): void {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve({
                outcomes: tests.map(function timedOut(test): PythonTestOutcome {
                    return { description: test.description, passed: false, error: "Python runtime timed out." };
                }),
                stdout: "",
                stderr: "",
                timedOut: true,
            });
        }, timeoutMs);

        worker.onmessage = function onMessage(event: MessageEvent<WorkerResult>): void {
            if (settled || event.data.type !== "result") {
                return;
            }
            settled = true;
            cleanup();
            resolve({
                outcomes: event.data.outcomes,
                stdout: event.data.stdout,
                stderr: event.data.stderr,
                timedOut: false,
            });
        };

        worker.onerror = function onError(event: ErrorEvent): void {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve({
                outcomes: tests.map(function failed(test): PythonTestOutcome {
                    return { description: test.description, passed: false, error: event.message };
                }),
                stdout: "",
                stderr: event.message,
                timedOut: false,
            });
        };

        worker.postMessage({ type: "run", source, tests });
    });
}
