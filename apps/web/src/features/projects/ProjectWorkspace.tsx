import { A, useParams } from "@solidjs/router";
import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import type { ProjectDefinition } from "@praxbit/contracts";
import { buildPreviewDocument } from "@praxbit/execution/browser";
import { CodeEditor } from "../../components/CodeEditor.tsx";
import { projectById, skillName } from "../../content/index.ts";
import { api } from "../../platform/services.ts";
import { executeChecks, type CheckOutcome } from "../missions/run-checks.ts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";

function editorLanguage(path: string): string {
    if (path.endsWith(".ts")) {
        return "typescript";
    }
    if (path.endsWith(".js")) {
        return "javascript";
    }
    if (path.endsWith(".html")) {
        return "html";
    }
    if (path.endsWith(".css")) {
        return "css";
    }
    if (path.endsWith(".sql")) {
        return "sql";
    }
    if (path.endsWith(".py")) {
        return "python";
    }
    return "text";
}

function runtimeLabel(project: ProjectDefinition): string {
    switch (project.runtime) {
        case "browser-javascript":
            return "JavaScript runs in an isolated browser worker. Tests are executed, not simulated.";
        case "browser-html":
            return "HTML and CSS render in a sandboxed preview. Structural and computed-style checks run against the result.";
        case "browser-sql":
            return "Queries run against SQLite WebAssembly. This is a learning runtime, not PostgreSQL.";
        default:
            return "Checks run against the project according to the stated runtime.";
    }
}

export function ProjectWorkspace(): JSX.Element {
    const params = useParams<{ id: string }>();
    const learning = useLearning();
    const project = projectById(params.id);

    let headingRef: HTMLHeadingElement | undefined;
    const [files, setFiles] = createSignal<Readonly<Record<string, string>>>(project?.files ?? {});
    const [activePath, setActivePath] = createSignal(project?.entry ?? "");
    const [stageIndex, setStageIndex] = createSignal(0);
    const [outcomes, setOutcomes] = createSignal<readonly CheckOutcome[]>([]);
    const [running, setRunning] = createSignal(false);
    const [passedStages, setPassedStages] = createSignal<readonly string[]>([]);
    const [runtimeError, setRuntimeError] = createSignal("");
    const [savedRevision, setSavedRevision] = createSignal<number | undefined>(undefined);
    const [revisionError, setRevisionError] = createSignal("");
    const [completionMessage, setCompletionMessage] = createSignal("");

    const stage = createMemo(function currentStage() {
        return project?.stages[stageIndex()];
    });

    const activeFile = createMemo(function currentFile() {
        return project?.files[activePath()] !== undefined ? activePath() : project?.entry ?? "";
    });

    const previewDocument = createMemo(function preview(): string {
        if (project === undefined || (project.preview !== "html" && project.preview !== "css")) {
            return "";
        }
        return buildPreviewDocument(files());
    });

    const allStagesPassed = createMemo(function allPassed(): boolean {
        if (project === undefined) {
            return false;
        }
        return project.stages.every(function passed(item): boolean {
            return passedStages().includes(item.id);
        });
    });

    onMount(function loadDraft(): void {
        void (async function load(): Promise<void> {
            if (project === undefined) {
                return;
            }
            const draft = await learning.loadProjectDraft(project.id);
            if (draft !== undefined) {
                setFiles({ ...project.files, ...draft });
            }
            if (learning.completedProjectIds().includes(project.id)) {
                setCompletionMessage("This project is already complete. You can keep refining the artifact.");
            }
        })();
    });

    onCleanup(function saveDraft(): void {
        if (project !== undefined) {
            void learning.saveProjectDraft(project.id, files());
        }
    });

    async function runStage(): Promise<void> {
        if (project === undefined || stage() === undefined || running()) {
            return;
        }
        setRunning(true);
        setRuntimeError("");
        setOutcomes([]);
        await learning.saveProjectDraft(project.id, files());
        try {
            const result = await executeChecks({
                language: project.language,
                files: files(),
                entry: project.entry,
                tests: stage()?.tests ?? [],
                ...(project.database === undefined ? {} : { database: project.database }),
            });
            setOutcomes(result.outcomes);
            const passed = result.outcomes.length > 0 && result.outcomes.every(function passed(item): boolean {
                return item.passed;
            });
            if (passed && stage() !== undefined) {
                setPassedStages(function add(current): readonly string[] {
                    return current.includes(stage()?.id ?? "")
                        ? current
                        : [...current, stage()?.id ?? ""];
                });
            }
        } catch (error) {
            setRuntimeError(error instanceof Error ? error.message : "The project checks could not run.");
        } finally {
            setRunning(false);
        }
    }

    async function completeIfReady(): Promise<void> {
        if (project === undefined || !allStagesPassed() || completionMessage().length > 0) {
            return;
        }
        const outcome = await learning.recordProjectCompletion(project, passedStages().length);
        setCompletionMessage(
            outcome.alreadyCompleted
                ? "Project completion was already recorded."
                : `Project complete. ${outcome.experience} experience points recorded.`,
        );
    }

    async function saveRevision(): Promise<void> {
        if (project === undefined || learning.user() === undefined) {
            return;
        }
        setRevisionError("");
        try {
            const current = await api.getProject(project.id);
            const revision = await api.saveRevision(project.id, {
                baseRevision: current.project.currentRevision,
                message: "Project workspace revision",
                files: files(),
            });
            setSavedRevision(revision.project.currentRevision);
        } catch (error) {
            setRevisionError(error instanceof Error ? error.message : "The revision could not be saved.");
        }
    }

    if (project === undefined) {
        return (
            <main class="page page--narrow">
                <h1>Project not found</h1>
                <A class="button" href="/projects">
                    Back to Projects
                </A>
            </main>
        );
    }

    return (
        <main class="page">
            <div class="row row--between" style={{ "margin-bottom": "var(--space-4)" }}>
                <A class="button button--ghost button--small" href="/projects">
                    Back to Projects
                </A>
                <span class="meta">
                    {project.difficulty} · {project.estimatedMinutes} min
                </span>
            </div>

            <div class="stack stack--wide">
                <div class="row" style={{ "align-items": "flex-start" }}>
                    <Pip pose="thinking" size={84} />
                    <div class="stack stack--tight">
                        <h1 ref={headingRef} tabindex="-1">
                            {project.title}
                        </h1>
                        <p class="lede">{project.summary}</p>
                    </div>
                </div>

                <div class="surface surface--quiet stack stack--tight">
                    <h2>Brief</h2>
                    <For each={project.brief}>
                        {function paragraph(item): JSX.Element {
                            return <p>{item}</p>;
                        }}
                    </For>
                    <p class="meta">{runtimeLabel(project)}</p>
                    <p class="meta">Skills: {project.skills.map(skillName).join(", ")}</p>
                </div>

                <div class="method-tabs" role="tablist" aria-label="Project stages">
                    <For each={project.stages}>
                        {function stageTab(item, index): JSX.Element {
                            return (
                                <button
                                    type="button"
                                    role="tab"
                                    class="method-tab"
                                    aria-selected={stageIndex() === index()}
                                    onClick={function choose(): void {
                                        setStageIndex(index());
                                        setOutcomes([]);
                                    }}
                                >
                                    <span class="method-tab__name">
                                        {index() + 1}. {item.title}
                                    </span>
                                    <span class="method-tab__detail">
                                        {passedStages().includes(item.id) ? "Passed" : "Not yet passed"}
                                    </span>
                                </button>
                            );
                        }}
                    </For>
                </div>

                <Show when={stage() !== undefined}>
                    <div class="surface stack stack--tight">
                        <h2>{stage()?.title}</h2>
                        <p class="small">{stage()?.description}</p>
                    </div>
                </Show>

                <div class="method-tabs" role="tablist" aria-label="Project files">
                    <For each={Object.keys(project.files)}>
                        {function path(item): JSX.Element {
                            return (
                                <button
                                    type="button"
                                    role="tab"
                                    class="method-tab"
                                    aria-selected={activeFile() === item}
                                    onClick={function open(): void {
                                        setActivePath(item);
                                    }}
                                >
                                    <span class="method-tab__name">{item}</span>
                                </button>
                            );
                        }}
                    </For>
                </div>

                <div class="grid grid--two">
                    <div class="stack stack--tight">
                        <CodeEditor
                            value={files()[activeFile()] ?? ""}
                            language={editorLanguage(activeFile())}
                            label={`${activeFile()} editor`}
                            onChange={function change(value): void {
                                setFiles(function update(current): Readonly<Record<string, string>> {
                                    return { ...current, [activeFile()]: value };
                                });
                            }}
                            onRun={function run(): void {
                                void runStage();
                            }}
                        />
                        <div class="row">
                            <button type="button" class="button" disabled={running()} onClick={function run(): void {
                                void runStage();
                            }}>
                                {running() ? "Running stage checks" : "Run stage checks"}
                            </button>
                            <button type="button" class="button button--secondary" onClick={function complete(): void {
                                void completeIfReady();
                            }}>
                                Record completion
                            </button>
                        </div>
                        <Show when={learning.user() !== undefined}>
                            <div class="row">
                                <button type="button" class="button button--secondary button--small" onClick={function save(): void {
                                    void saveRevision();
                                }}>
                                    Save revision to account
                                </button>
                                <Show when={savedRevision() !== undefined}>
                                    <span class="meta">Revision {savedRevision()} saved.</span>
                                </Show>
                            </div>
                            <Show when={revisionError().length > 0}>
                                <p class="feedback feedback--error">{revisionError()}</p>
                            </Show>
                        </Show>
                    </div>

                    <div class="stack stack--tight">
                        <Show when={project.preview === "html" || project.preview === "css"}>
                            <span class="meta">Live preview</span>
                            <iframe
                                class="preview-frame"
                                sandbox="allow-scripts"
                                title="Project preview"
                                srcdoc={previewDocument()}
                            />
                        </Show>
                        <Show when={project.preview === "sql"}>
                            <p class="feedback feedback--info">
                                SQL runs in SQLite WebAssembly. Stage checks show the returned rows.
                            </p>
                        </Show>
                        <Show when={outcomes().length > 0}>
                            <table class="data-table">
                                <caption class="meta">Stage checks</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Check</th>
                                        <th scope="col">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={outcomes()}>
                                        {function outcome(item): JSX.Element {
                                            return (
                                                <tr>
                                                    <td>
                                                        {item.description}
                                                        <Show when={item.error !== undefined}>
                                                            <span class="meta">{item.error}</span>
                                                        </Show>
                                                    </td>
                                                    <td>
                                                        <span class={`status ${item.passed ? "status--success" : "status--error"}`}>
                                                            <span class="status__mark" aria-hidden="true" />
                                                            {item.passed ? "Pass" : "Fail"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        }}
                                    </For>
                                </tbody>
                            </table>
                        </Show>
                        <Show when={runtimeError().length > 0}>
                            <p class="feedback feedback--error">{runtimeError()}</p>
                        </Show>
                    </div>
                </div>

                <Show when={completionMessage().length > 0}>
                    <div class="surface stack">
                        <h2>Project result</h2>
                        <p>{completionMessage()}</p>
                        <div class="stack stack--tight">
                            <h3>What the checks established</h3>
                            <For each={project.explanation}>
                                {function item(paragraph): JSX.Element {
                                    return <p class="small muted">{paragraph}</p>;
                                }}
                            </For>
                        </div>
                        <button type="button" class="button button--secondary" onClick={function save(): void {
                            void learning.saveProjectDraft(project.id, files());
                        }}>
                            Save draft
                        </button>
                    </div>
                </Show>
            </div>
        </main>
    );
}
