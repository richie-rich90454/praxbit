import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { evaluateStep } from "@praxbit/domain";
import type { CodeStep } from "@praxbit/contracts";
import { buildPreviewDocument } from "@praxbit/execution/browser";
import { announce } from "../../../app/AppShell.tsx";
import { CodeEditor } from "../../../components/CodeEditor.tsx";
import { TabPanel, Tabs, type TabItem } from "../../../components/Tabs.tsx";
import { db } from "../../../platform/services.ts";
import { executeChecks, type CheckOutcome } from "../run-checks.ts";
import type { InteractionProps } from "./types.ts";

export interface CodeViewProps extends InteractionProps {
    readonly step: CodeStep;
    readonly draftKey: string;
}

function runtimeLabel(language: string): string {
    switch (language) {
        case "javascript":
            return "Real execution in an isolated browser worker. Network access is blocked on a best-effort basis.";
        case "typescript":
            return "Browser TypeScript transpilation with syntax diagnostics and behavioral tests. Full type checking is available in the local companion.";
        case "html":
        case "css":
            return "Real rendering in a sandboxed preview frame. DOM and computed-style checks run inside the frame.";
        case "python":
            return "Real Python execution in Pyodide WebAssembly. The runtime is bundled and runs locally.";
        case "sql":
            return "SQL executed against SQLite WebAssembly. PostgreSQL-specific behavior is not implied.";
        default:
            return "Structural checks only. This exercise is not executing code.";
    }
}

function statusLabel(passed: boolean): string {
    return passed ? "Pass" : "Fail";
}

export function CodeView(props: CodeViewProps): JSX.Element {
    const tabPrefix = `code-files-${props.step.id}`;
    const initialFiles: Record<string, string> = {};
    for (const file of props.step.files) {
        initialFiles[file.path] = file.content;
    }
    const [files, setFiles] = createSignal<Readonly<Record<string, string>>>(initialFiles);
    const [activePath, setActivePath] = createSignal(props.step.entry);
    const [running, setRunning] = createSignal(false);
    const [outcomes, setOutcomes] = createSignal<readonly CheckOutcome[]>([]);
    const [diagnostics, setDiagnostics] = createSignal<
        readonly { message: string; severity: string }[]
    >([]);
    const [stdout, setStdout] = createSignal("");
    const [stderr, setStderr] = createSignal("");
    const [runtimeError, setRuntimeError] = createSignal("");
    const [saved, setSaved] = createSignal(false);

    const tabItems = createMemo(function tabs(): readonly TabItem[] {
        return props.step.files.map(function tab(file): TabItem {
            return {
                id: file.path,
                label: file.path,
                detail: file.editable ? "editable" : "read only",
            };
        });
    });

    const previewDocument = createMemo(function preview(): string {
        if (props.step.preview !== "html" && props.step.preview !== "css") {
            return "";
        }
        return buildPreviewDocument(files());
    });

    const structuralOnly = createMemo(function structural(): boolean {
        return props.step.tests.every(function check(test): boolean {
            return test.kind === "static" || test.kind === "regex" || test.kind === "json";
        });
    });

    onMount(function loadDraft(): void {
        void (async function load(): Promise<void> {
            const draft = await db.drafts.get(props.draftKey);
            if (draft === undefined) {
                return;
            }
            const allowed = new Set(
                props.step.files.map(function pathOf(file): string {
                    return file.path;
                }),
            );
            const next: Record<string, string> = { ...initialFiles };
            for (const [path, content] of Object.entries(draft.files)) {
                if (allowed.has(path)) {
                    next[path] = content;
                }
            }
            setFiles(next);
        })();
    });

    async function saveDraft(): Promise<void> {
        await db.drafts.put({
            key: props.draftKey,
            files: files(),
            updatedAt: new Date().toISOString(),
        });
        setSaved(true);
        setTimeout(function quiet(): void {
            setSaved(false);
        }, 1200);
    }

    onCleanup(function cleanup(): void {
        void saveDraft();
    });

    async function run(): Promise<void> {
        if (running()) {
            return;
        }
        setRunning(true);
        setRuntimeError("");
        setOutcomes([]);
        setDiagnostics([]);
        setStdout("");
        setStderr("");
        await saveDraft();

        try {
            const result = await executeChecks({
                language: props.step.language,
                files: files(),
                entry: props.step.entry,
                tests: props.step.tests,
                ...(props.step.database === undefined ? {} : { database: props.step.database }),
            });
            setOutcomes(result.outcomes);
            setDiagnostics(result.diagnostics);
            setStdout(result.stdout);
            setStderr(result.stderr);
            const passed = result.outcomes
                .filter(function successful(outcome): boolean {
                    return outcome.passed;
                })
                .map(function descriptionOf(outcome): string {
                    return outcome.description;
                });
            const failed = result.outcomes
                .filter(function unsuccessful(outcome): boolean {
                    return !outcome.passed;
                })
                .map(function descriptionOf(outcome): string {
                    return outcome.description;
                });
            const firstDiagnostic = result.diagnostics[0];
            announce(
                `${passed.length} of ${result.outcomes.length} checks passed.` +
                    (failed.length === 0 ? "" : ` ${failed.length} failed.`) +
                    (firstDiagnostic === undefined
                        ? ""
                        : ` ${result.diagnostics.length} diagnostics. First: ${firstDiagnostic.message}`),
            );
            props.onResult(
                evaluateStep(props.step, {
                    kind: "code",
                    passedTests: passed,
                    failedTests: failed,
                    totalTests: result.outcomes.length,
                }),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setRuntimeError(message);
            announce(`Runtime error. ${message}`);
            props.onResult(
                {
                    ...evaluateStep(props.step, {
                        kind: "code",
                        passedTests: [],
                        failedTests: props.step.tests.map(function descriptionOf(test): string {
                            return test.description;
                        }),
                        totalTests: props.step.tests.length,
                    }),
                    diagnostic: message,
                },
            );
        } finally {
            setRunning(false);
        }
    }

    return (
        <div class="stack">
            <p class="meta">{runtimeLabel(props.step.language)}</p>
            <Tabs
                idPrefix={tabPrefix}
                label="Project files"
                items={tabItems()}
                activeId={activePath()}
                onSelect={setActivePath}
            />

            <For each={props.step.files}>
                {function file(item): JSX.Element {
                    return (
                        <TabPanel
                            idPrefix={tabPrefix}
                            id={item.path}
                            activeId={activePath()}
                            content={function editorPanel(): JSX.Element {
                                return (
                                    <CodeEditor
                                        value={files()[item.path] ?? ""}
                                        language={item.language ?? "text"}
                                        label={`${item.path} editor`}
                                        readOnly={item.editable === false}
                                        onChange={function change(value): void {
                                            setFiles(function update(current): Readonly<
                                                Record<string, string>
                                            > {
                                                return { ...current, [item.path]: value };
                                            });
                                        }}
                                        onRun={function runEditor(): void {
                                            void run();
                                        }}
                                    />
                                );
                            }}
                        />
                    );
                }}
            </For>

            <div class="row">
                <button
                    type="button"
                    class="button"
                    disabled={running()}
                    onClick={function runTests(): void {
                        void run();
                    }}
                >
                    {running()
                        ? structuralOnly()
                            ? "Running checks"
                            : "Running tests"
                        : structuralOnly()
                          ? "Run checks"
                          : "Run tests"}
                </button>
                <span class="meta">
                    Ctrl+Enter runs the {structuralOnly() ? "checks" : "tests"}.{" "}
                    {saved() ? "Draft saved on this device." : ""}
                </span>
            </div>

            <Show when={props.step.preview === "html" || props.step.preview === "css"}>
                <div class="stack stack--tight">
                    <span class="meta">Live preview</span>
                    <iframe
                        class="preview-frame"
                        sandbox="allow-scripts"
                        title="Exercise preview"
                        srcdoc={previewDocument()}
                    />
                </div>
            </Show>

            <Show when={runtimeError().length > 0}>
                <p class="feedback feedback--error" role="alert">
                    {runtimeError()}
                </p>
            </Show>

            <Show when={diagnostics().length > 0}>
                <div class="surface surface--quiet stack stack--tight">
                    <h3>Diagnostics</h3>
                    <ul class="stack stack--tight">
                        <For each={diagnostics()}>
                            {function diagnostic(item): JSX.Element {
                                return (
                                    <li class="small">
                                        <strong>
                                            {item.severity === "error" ? "Error" : "Warning"}:
                                        </strong>{" "}
                                        {item.message}
                                    </li>
                                );
                            }}
                        </For>
                    </ul>
                </div>
            </Show>

            <Show when={outcomes().length > 0}>
                <div class="surface surface--quiet stack stack--tight" aria-busy={running()}>
                    <h3>Test results</h3>
                    <table class="data-table">
                        <caption class="meta">Test results for the current run</caption>
                        <thead>
                            <tr>
                                <th scope="col">Check</th>
                                <th scope="col">Result</th>
                                <th scope="col">Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={outcomes()}>
                                {function outcome(item): JSX.Element {
                                    return (
                                        <tr>
                                            <td>{item.description}</td>
                                            <td>
                                                <span
                                                    class={`status ${item.passed ? "status--success" : "status--error"}`}
                                                >
                                                    <span class="status__mark" aria-hidden="true" />
                                                    {statusLabel(item.passed)}
                                                </span>
                                            </td>
                                            <td class="small">
                                                <Show when={item.error !== undefined}>
                                                    {item.error}
                                                </Show>
                                                <Show
                                                    when={
                                                        item.error === undefined &&
                                                        item.actual !== undefined
                                                    }
                                                >
                                                    Actual: {item.actual}
                                                </Show>
                                            </td>
                                        </tr>
                                    );
                                }}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>

            <Show when={stdout().length > 0 || stderr().length > 0}>
                <div class="surface surface--quiet stack stack--tight">
                    <h3>Program output</h3>
                    <Show when={stdout().length > 0}>
                        <pre class="mono" aria-label="Standard output">
                            {stdout()}
                        </pre>
                    </Show>
                    <Show when={stderr().length > 0}>
                        <pre class="mono" aria-label="Standard error">
                            {stderr()}
                        </pre>
                    </Show>
                </div>
            </Show>
        </div>
    );
}
