import { For, Show, createSignal, onMount, type JSX } from "solid-js";
import { evaluateStep } from "@praxbit/domain";
import type { GitStep } from "@praxbit/contracts";
import { CodeEditor } from "../../../components/CodeEditor.tsx";
import { GitExercise } from "../../../platform/git-runner.ts";
import type { InteractionProps } from "./types.ts";

function editorLanguage(path: string): string {
    if (path.endsWith(".js")) {
        return "javascript";
    }
    if (path.endsWith(".ts")) {
        return "typescript";
    }
    if (path.endsWith(".json")) {
        return "json";
    }
    if (path.endsWith(".html")) {
        return "html";
    }
    if (path.endsWith(".css")) {
        return "css";
    }
    if (path.endsWith(".py")) {
        return "python";
    }
    if (path.endsWith(".sql")) {
        return "sql";
    }
    return "text";
}

export function GitView(props: { readonly step: GitStep } & InteractionProps): JSX.Element {
    let exercise: GitExercise | undefined;
    let inputElement: HTMLInputElement | undefined;
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal("");
    const [files, setFiles] = createSignal<readonly string[]>([]);
    const [selectedPath, setSelectedPath] = createSignal("");
    const [fileContent, setFileContent] = createSignal("");
    const [output, setOutput] = createSignal("");
    const [command, setCommand] = createSignal("git status");
    const [busy, setBusy] = createSignal(false);
    const [checks, setChecks] = createSignal<Readonly<Record<string, boolean>>>({});
    const [branch, setBranch] = createSignal("");

    async function refreshFiles(): Promise<void> {
        if (exercise === undefined) {
            return;
        }
        const list = await exercise.listFiles();
        setFiles(list);
        if (selectedPath().length === 0 && list.length > 0) {
            await openFile(list[0] ?? "");
        } else if (selectedPath().length > 0) {
            await openFile(selectedPath());
        }
    }

    async function openFile(path: string): Promise<void> {
        if (exercise === undefined || path.length === 0) {
            return;
        }
        setSelectedPath(path);
        try {
            setFileContent(await exercise.readFile(path));
        } catch {
            setFileContent("");
        }
    }

    async function saveFile(): Promise<void> {
        if (exercise === undefined || selectedPath().length === 0) {
            return;
        }
        await exercise.writeFile(selectedPath(), fileContent());
        setOutput(function append(current): string {
            return `${current}\nSaved ${selectedPath()} in the working tree.`;
        });
    }

    let executionQueue: Promise<void> = Promise.resolve();

    async function executeCommand(entry: string): Promise<void> {
        if (exercise === undefined) {
            return;
        }
        setBusy(true);
        try {
            const result = await exercise.execute(entry);
            setOutput(function append(current): string {
                return `${current}\n$ ${entry}\n${result.output}`.trim();
            });
            await refreshFiles();
        } finally {
            setBusy(false);
            inputElement?.focus();
        }
    }

    function enqueueCommand(): void {
        const entry = (inputElement?.value ?? command()).trim();
        if (entry.length === 0) {
            return;
        }
        executionQueue = executionQueue
            .then(function runQueued(): Promise<void> {
                return executeCommand(entry);
            })
            .catch(function report(caught: unknown): void {
                setError(caught instanceof Error ? caught.message : "The Git command failed.");
            });
    }

    async function verify(): Promise<void> {
        if (exercise === undefined) {
            return;
        }
        const result = await exercise.verify();
        setChecks(result.checks);
        setBranch(result.branch ?? "");
        props.onResult(
            evaluateStep(props.step, { kind: "git", checks: result.checks, log: result.log }),
            JSON.stringify(result.checks),
        );
    }

    onMount(function mount(): void {
        void (async function initialize(): Promise<void> {
            try {
                const runner = new GitExercise(props.step);
                await runner.initialize();
                exercise = runner;
                setOutput(
                    `Initialized an in-browser repository on branch ${props.step.initialBranch}.\nType git status to inspect it.`,
                );
                await refreshFiles();
            } catch (caught) {
                setError(
                    caught instanceof Error
                        ? caught.message
                        : "The repository could not be initialized.",
                );
            } finally {
                setLoading(false);
                inputElement?.focus();
            }
        })();
    });

    return (
        <div class="stack">
            <p class="meta">
                Real Git operations run through isomorphic-git against an in-browser repository.
                This is a repository in your browser, not a remote copy on the campus server.
            </p>
            <Show when={error().length > 0}>
                <p class="feedback feedback--error">{error()}</p>
            </Show>
            <Show when={loading()}>
                <p class="muted">Preparing the repository.</p>
            </Show>
            <Show when={!loading() && error().length === 0}>
                <div class="grid grid--two">
                    <div class="surface surface--quiet stack stack--tight">
                        <h3>Repository files</h3>
                        <For each={files()}>
                            {function path(item): JSX.Element {
                                return (
                                    <button
                                        type="button"
                                        class="button button--ghost button--small"
                                        aria-pressed={selectedPath() === item}
                                        onClick={function open(): void {
                                            void openFile(item);
                                        }}
                                    >
                                        {item}
                                    </button>
                                );
                            }}
                        </For>
                        <Show when={branch().length > 0}>
                            <p class="meta">Branch: {branch()}</p>
                        </Show>
                    </div>
                    <div class="surface stack stack--tight">
                        <h3>Git terminal</h3>
                        <div
                            class="terminal"
                            role="log"
                            aria-live="polite"
                            aria-busy={busy()}
                            aria-label="Git output"
                        >
                            <pre class="terminal__line" style={{ "white-space": "pre-wrap" }}>
                                {output()}
                            </pre>
                        </div>
                        <form
                            class="row"
                            onSubmit={function submit(event): void {
                                event.preventDefault();
                                enqueueCommand();
                            }}
                        >
                            <label class="visually-hidden" for={`git-command-${props.step.id}`}>
                                Git command
                            </label>
                            <input
                                id={`git-command-${props.step.id}`}
                                ref={inputElement}
                                class="input mono"
                                value={command()}
                                autocomplete="off"
                                spellcheck={false}
                                onInput={function change(event): void {
                                    setCommand(event.currentTarget.value);
                                }}
                            />
                            <button type="submit" class="button">
                                Run
                            </button>
                        </form>
                    </div>
                </div>

                <Show when={selectedPath().length > 0}>
                    <div class="stack stack--tight">
                        <CodeEditor
                            value={fileContent()}
                            language={editorLanguage(selectedPath())}
                            label={`${selectedPath()} editor`}
                            onChange={setFileContent}
                        />
                        <div class="row">
                            <button
                                type="button"
                                class="button button--secondary button--small"
                                onClick={function save(): void {
                                    void saveFile();
                                }}
                            >
                                Save file in working tree
                            </button>
                        </div>
                    </div>
                </Show>

                <div class="row">
                    <button
                        type="button"
                        class="button"
                        onClick={function check(): void {
                            void verify();
                        }}
                    >
                        Check repository
                    </button>
                    <span class="meta">
                        A merge conflict leaves markers in the file. Resolve them, stage, and
                        commit.
                    </span>
                </div>

                <Show when={Object.keys(checks()).length > 0}>
                    <table class="data-table">
                        <caption class="meta">Repository checks</caption>
                        <thead>
                            <tr>
                                <th scope="col">Check</th>
                                <th scope="col">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={Object.entries(checks())}>
                                {function entry(item): JSX.Element {
                                    return (
                                        <tr>
                                            <td>{item[0]}</td>
                                            <td>
                                                <span
                                                    class={`status ${item[1] ? "status--success" : "status--error"}`}
                                                >
                                                    <span class="status__mark" aria-hidden="true" />
                                                    {item[1] ? "Pass" : "Fail"}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                }}
                            </For>
                        </tbody>
                    </table>
                </Show>
            </Show>
        </div>
    );
}
