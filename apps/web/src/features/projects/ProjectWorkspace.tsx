import { A, useParams } from "@solidjs/router";
import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    onMount,
    type JSX,
} from "solid-js";
import type { ProjectDetail, ProjectDefinition } from "@praxbit/contracts";
import { ApiError } from "@praxbit/client";
import { buildPreviewDocument } from "@praxbit/execution/browser";
import { announce } from "../../app/AppShell.tsx";
import { CodeEditor } from "../../components/CodeEditor.tsx";
import { TabPanel, Tabs, type TabItem } from "../../components/Tabs.tsx";
import { projectById, skillName } from "../../content/index.ts";
import { api } from "../../platform/services.ts";
import { executeChecks, type CheckOutcome } from "../missions/run-checks.ts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";
import "./projects.css";

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
    let stageHeadingRef: HTMLHeadingElement | undefined;
    let stageFocusPending = false;
    const [files, setFiles] = createSignal<Readonly<Record<string, string>>>(project?.files ?? {});
    const [activePath, setActivePath] = createSignal(project?.entry ?? "");
    const [stageIndex, setStageIndex] = createSignal(0);
    const [outcomes, setOutcomes] = createSignal<readonly CheckOutcome[]>([]);
    const [running, setRunning] = createSignal(false);
    const [passedStages, setPassedStages] = createSignal<readonly string[]>([]);
    const [runtimeError, setRuntimeError] = createSignal("");
    const [savedRevision, setSavedRevision] = createSignal<number | undefined>(undefined);
    const [loadedRevision, setLoadedRevision] = createSignal<number | undefined>(undefined);
    const [revisionError, setRevisionError] = createSignal("");
    const [revisionBusy, setRevisionBusy] = createSignal(false);
    const [completionMessage, setCompletionMessage] = createSignal("");
    const [completionError, setCompletionError] = createSignal("");
    const [completionBusy, setCompletionBusy] = createSignal(false);
    const [draftLoading, setDraftLoading] = createSignal(true);
    const [draftReady, setDraftReady] = createSignal(false);
    const [draftError, setDraftError] = createSignal("");
    const [accountRevisionLoaded, setAccountRevisionLoaded] = createSignal(false);

    const stage = createMemo(function currentStage() {
        return project?.stages[stageIndex()];
    });

    const stageTabs = createMemo(function stageItems(): readonly TabItem[] {
        return (project?.stages ?? []).map(function stageTab(item, index): TabItem {
            return {
                id: item.id,
                label: `${index + 1}. ${item.title}`,
                detail: `${stageIndex() === index ? "Current stage · " : ""}${
                    passedStages().includes(item.id) ? "Passed" : "Not yet passed"
                }`,
            };
        });
    });

    const fileTabs = createMemo(function fileItems(): readonly TabItem[] {
        return Object.keys(project?.files ?? {}).map(function fileTab(path): TabItem {
            return { id: path, label: path };
        });
    });

    createEffect(function focusStageHeading(): void {
        const index = stageIndex();
        if (!stageFocusPending || index < 0) {
            return;
        }
        stageFocusPending = false;
        queueMicrotask(function focus(): void {
            stageHeadingRef?.focus();
        });
    });

    const activeFile = createMemo(function currentFile() {
        return project?.files[activePath()] !== undefined ? activePath() : (project?.entry ?? "");
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

    const failedCount = createMemo(function failedChecks(): number {
        return outcomes().filter(function failed(item): boolean {
            return !item.passed;
        }).length;
    });

    const nextStage = createMemo(function nextUnpassedStage() {
        if (project === undefined) {
            return undefined;
        }
        const index = project.stages.findIndex(function unpassed(item): boolean {
            return !passedStages().includes(item.id);
        });
        if (index === -1 || index === stageIndex()) {
            return undefined;
        }
        const next = project.stages[index];
        return next === undefined ? undefined : { index, stage: next };
    });

    const stageNextStep = createMemo(function nextStep(): string {
        if (completionMessage().length > 0) {
            return "This project is already complete. Keep refining the artifact or review the result below.";
        }
        const current = stage();
        if (current === undefined) {
            return "";
        }
        if (passedStages().includes(current.id)) {
            if (allStagesPassed()) {
                return "Every stage has passed. Record completion to finish the project.";
            }
            const following = nextStage();
            return following === undefined
                ? "This stage passed. Another stage still needs a passing check run."
                : `This stage passed. Next: ${following.stage.title}.`;
        }
        if (outcomes().length > 0) {
            return failedCount() === 0
                ? "All checks for this stage passed."
                : `${failedCount()} of ${outcomes().length} checks failed. Fix the failing rows, then run this stage again.`;
        }
        return "Run the stage checks to test this stage. Every check must pass before the stage counts.";
    });

    const completionRequirement = createMemo(function requirement(): string {
        if (completionMessage().length > 0) {
            return "Completion is already recorded for this project.";
        }
        if (allStagesPassed()) {
            return "All stages passed. Record completion to finish the project.";
        }
        if (project === undefined) {
            return "Completion is unavailable.";
        }
        const remaining = project.stages.length - passedStages().length;
        return `${remaining} ${remaining === 1 ? "stage still needs" : "stages still need"} a passing check run before completion can be recorded.`;
    });

    function stagePassed(stageId: string | undefined): boolean {
        return stageId !== undefined && passedStages().includes(stageId);
    }

    function openStage(index: number): void {
        if (index < 0) {
            return;
        }
        stageFocusPending = true;
        setStageIndex(index);
        setOutcomes([]);
    }

    onMount(function loadDraft(): void {
        void (async function load(): Promise<void> {
            if (project === undefined) {
                setDraftLoading(false);
                return;
            }
            try {
                const draft = await learning.loadProjectDraft(project.id);
                const draftRevision = await learning.loadProjectRevision(project.id);
                setLoadedRevision(draftRevision);
                if (draft !== undefined) {
                    setFiles({ ...project.files, ...draft });
                }
                if (learning.completedProjectIds().includes(project.id)) {
                    setCompletionMessage(
                        "This project is already complete. You can keep refining the artifact.",
                    );
                }
                setDraftReady(true);
            } catch (error) {
                const message =
                    error instanceof Error
                        ? `${error.message} The starter files are shown instead.`
                        : "Your saved draft could not be loaded. The starter files are shown instead.";
                setDraftError(message);
                announce(`Draft error. ${message}`);
            } finally {
                setDraftLoading(false);
            }
        })();
    });

    createEffect(function loadAccountRevision(): void {
        if (
            project === undefined ||
            accountRevisionLoaded() ||
            draftLoading() ||
            !learning.ready() ||
            learning.user() === undefined
        ) {
            return;
        }
        setAccountRevisionLoaded(true);
        void (async function load(): Promise<void> {
            try {
                const detail = await api.getProject(project.id);
                const latest = detail.revisions[detail.revisions.length - 1];
                setLoadedRevision(detail.project.currentRevision);
                if (latest !== undefined) {
                    setFiles({ ...project.files, ...latest.files, ...files() });
                }
            } catch {
                // Keep the local draft usable when the account revision cannot be fetched.
            }
        })();
    });

    onCleanup(function saveDraft(): void {
        if (project !== undefined && draftReady()) {
            void learning.saveProjectDraft(project.id, files());
        }
    });

    async function runStage(): Promise<void> {
        if (project === undefined || stage() === undefined || running() || draftLoading()) {
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
            const passed =
                result.outcomes.length > 0 &&
                result.outcomes.every(function passed(item): boolean {
                    return item.passed;
                });
            if (passed && stage() !== undefined) {
                setPassedStages(function add(current): readonly string[] {
                    return current.includes(stage()?.id ?? "")
                        ? current
                        : [...current, stage()?.id ?? ""];
                });
            }
            const failed = result.outcomes.filter(function failedCheck(item): boolean {
                return !item.passed;
            }).length;
            announce(
                failed === 0
                    ? `All ${result.outcomes.length} checks for this stage passed.`
                    : `${failed} of ${result.outcomes.length} checks failed.`,
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "The project checks could not run.";
            setRuntimeError(message);
            announce(`Runtime error. ${message}`);
        } finally {
            setRunning(false);
        }
    }

    async function completeIfReady(): Promise<void> {
        if (
            project === undefined ||
            !allStagesPassed() ||
            completionMessage().length > 0 ||
            completionBusy()
        ) {
            return;
        }
        setCompletionError("");
        setCompletionBusy(true);
        try {
            const outcome = await learning.recordProjectCompletion(project, passedStages().length);
            const message = outcome.alreadyCompleted
                ? "Project completion was already recorded."
                : `Project complete. ${outcome.experience} experience points recorded.`;
            setCompletionMessage(message);
            announce(message);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Completion could not be recorded. Your stage results are still available; try again.";
            setCompletionError(message);
            announce(`Completion error. ${message}`);
        } finally {
            setCompletionBusy(false);
        }
    }

    async function persistSavedRevision(
        detail: ProjectDetail,
        nextFiles: Readonly<Record<string, string>>,
    ): Promise<void> {
        if (project === undefined) {
            return;
        }
        setFiles(nextFiles);
        setSavedRevision(detail.project.currentRevision);
        setLoadedRevision(detail.project.currentRevision);
        await learning.saveProjectDraft(project.id, nextFiles, detail.project.currentRevision);
    }

    async function queueRevision(
        nextFiles: Readonly<Record<string, string>>,
        baseRevision: number,
    ): Promise<void> {
        if (project === undefined) {
            return;
        }
        await learning.queueProjectRevision(
            project.id,
            nextFiles,
            baseRevision,
            "Project workspace revision",
        );
    }

    async function saveRevision(): Promise<void> {
        if (project === undefined || learning.user() === undefined || revisionBusy()) {
            return;
        }
        setRevisionError("");
        setRevisionBusy(true);
        const baseRevision =
            loadedRevision() ?? (await learning.loadProjectRevision(project.id)) ?? 0;
        try {
            const revision = await api.saveRevision(project.id, {
                baseRevision,
                message: "Project workspace revision",
                files: files(),
            });
            await persistSavedRevision(revision, files());
        } catch (error) {
            if (error instanceof ApiError && error.code === "project_revision_conflict") {
                let mergedFiles = files();
                let mergeBase = loadedRevision() ?? baseRevision;
                try {
                    const latestDetail = await api.getProject(project.id);
                    const latest = latestDetail.revisions[latestDetail.revisions.length - 1];
                    mergedFiles = {
                        ...project.files,
                        ...latest?.files,
                        ...files(),
                    };
                    mergeBase = latestDetail.project.currentRevision;
                    const revision = await api.saveRevision(project.id, {
                        baseRevision: mergeBase,
                        message: "Project workspace revision merged with account changes",
                        files: mergedFiles,
                    });
                    await persistSavedRevision(revision, mergedFiles);
                    const message =
                        "Another device changed this project. The latest account files were merged with your local draft and saved as a new revision.";
                    setRevisionError(message);
                    announce(message);
                } catch {
                    await queueRevision(mergedFiles, mergeBase);
                    const message =
                        "The conflict could not be merged online. Your draft is saved on this device and queued for retry; it remains available for resolution.";
                    setRevisionError(message);
                    announce(message);
                }
            } else if (error instanceof ApiError && error.status < 500) {
                const message =
                    error instanceof Error ? error.message : "The revision could not be saved.";
                setRevisionError(message);
                announce(`Revision error. ${message}`);
            } else {
                await queueRevision(files(), baseRevision);
                const message =
                    "The server could not be reached. Your draft is saved on this device and queued for synchronization.";
                setRevisionError(message);
                announce(message);
            }
        } finally {
            setRevisionBusy(false);
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
                    <span aria-hidden="true">
                        <Pip pose="thinking" size={84} />
                    </span>
                    <div class="stack stack--tight">
                        <h1 ref={headingRef} tabindex="-1">
                            {project.title}
                        </h1>
                        <p class="lede">{project.summary}</p>
                    </div>
                </div>

                <div
                    class="surface surface--quiet stack stack--tight"
                    aria-labelledby="project-progress-heading"
                >
                    <div class="row row--between">
                        <h2 id="project-progress-heading">Project progress</h2>
                        <span class="meta">
                            {passedStages().length} of {project.stages.length} stages passed
                        </span>
                    </div>
                    <p class="small">
                        <strong>Current stage:</strong> {stage()?.title ?? "Not started"}
                    </p>
                    <p class="small muted">{stageNextStep()}</p>
                    <Show when={nextStage()}>
                        {function following(current): JSX.Element {
                            return (
                                <div class="row">
                                    <button
                                        type="button"
                                        class="button button--secondary button--small"
                                        onClick={function advance(): void {
                                            openStage(current().index);
                                        }}
                                    >
                                        Open next unpassed stage: {current().stage.title}
                                    </button>
                                </div>
                            );
                        }}
                    </Show>
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

                <div class="stack stack--tight">
                    <p class="meta">
                        Stages can be reviewed in any order. Completion requires a passing check run
                        for every stage.
                    </p>
                    <Tabs
                        idPrefix="project-stages"
                        label="Project stages"
                        items={stageTabs()}
                        activeId={stage()?.id ?? ""}
                        onSelect={function chooseStage(id): void {
                            const index = project.stages.findIndex(function match(item): boolean {
                                return item.id === id;
                            });
                            openStage(index);
                        }}
                    />
                </div>

                <For each={project.stages}>
                    {function stageItem(item, index): JSX.Element {
                        return (
                            <TabPanel
                                idPrefix="project-stages"
                                id={item.id}
                                activeId={stage()?.id ?? ""}
                                content={function stagePanel(): JSX.Element {
                                    const passed = stagePassed(item.id);
                                    return (
                                        <div class="surface stack stack--tight">
                                            <div class="row row--between">
                                                <h2 ref={stageHeadingRef} tabindex="-1">
                                                    {item.title}
                                                </h2>
                                                <span
                                                    class={`status ${passed ? "status--success" : ""}`}
                                                >
                                                    <span class="status__mark" aria-hidden="true" />
                                                    {passed ? "Passed" : "Not yet passed"}
                                                </span>
                                            </div>
                                            <p class="small">{item.description}</p>
                                            <p class="meta">
                                                Stage {index() + 1} of {project.stages.length}.{" "}
                                                {passed
                                                    ? "This stage has a passing check run."
                                                    : "Run the checks below until every row passes."}
                                            </p>
                                        </div>
                                    );
                                }}
                            />
                        );
                    }}
                </For>

                <Tabs
                    idPrefix="project-files"
                    label="Project files"
                    items={fileTabs()}
                    activeId={activeFile()}
                    onSelect={setActivePath}
                />

                <div class="grid grid--two">
                    <div class="stack stack--tight">
                        <Show when={draftLoading()}>
                            <p class="feedback feedback--info" role="status">
                                Loading your saved draft on this device…
                            </p>
                        </Show>
                        <Show when={draftError().length > 0}>
                            <p class="feedback feedback--error" role="alert">
                                {draftError()}
                            </p>
                        </Show>
                        <For each={Object.keys(project.files)}>
                            {function file(item): JSX.Element {
                                return (
                                    <TabPanel
                                        idPrefix="project-files"
                                        id={item}
                                        activeId={activeFile()}
                                        content={function editorPanel(): JSX.Element {
                                            return (
                                                <CodeEditor
                                                    value={files()[item] ?? ""}
                                                    language={editorLanguage(item)}
                                                    label={`${item} editor`}
                                                    onChange={function change(value): void {
                                                        setFiles(function update(current): Readonly<
                                                            Record<string, string>
                                                        > {
                                                            return { ...current, [item]: value };
                                                        });
                                                    }}
                                                    onRun={function run(): void {
                                                        void runStage();
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
                                disabled={running() || draftLoading()}
                                onClick={function run(): void {
                                    void runStage();
                                }}
                            >
                                {running() ? "Running stage checks…" : "Run stage checks"}
                            </button>
                            <button
                                type="button"
                                class="button button--secondary"
                                disabled={
                                    !allStagesPassed() ||
                                    completionMessage().length > 0 ||
                                    completionBusy()
                                }
                                aria-describedby="completion-requirement"
                                onClick={function complete(): void {
                                    void completeIfReady();
                                }}
                            >
                                {completionBusy()
                                    ? "Recording completion…"
                                    : completionMessage().length > 0
                                      ? "Completion recorded"
                                      : "Record completion"}
                            </button>
                        </div>
                        <p class="meta" id="completion-requirement">
                            {completionRequirement()}
                        </p>
                        <Show when={completionError().length > 0}>
                            <p class="feedback feedback--error" role="alert">
                                {completionError()}
                            </p>
                        </Show>
                        <Show when={learning.user() !== undefined}>
                            <div class="row">
                                <button
                                    type="button"
                                    class="button button--secondary button--small"
                                    disabled={revisionBusy()}
                                    onClick={function save(): void {
                                        void saveRevision();
                                    }}
                                >
                                    {revisionBusy()
                                        ? "Saving revision…"
                                        : "Save revision to account"}
                                </button>
                                <Show when={savedRevision() !== undefined}>
                                    <span class="meta" role="status" aria-live="polite">
                                        Revision {savedRevision()} saved.
                                    </span>
                                </Show>
                            </div>
                            <Show when={revisionError().length > 0}>
                                <p class="feedback feedback--error" role="alert">
                                    {revisionError()}
                                </p>
                            </Show>
                            <Show when={learning.conflictCount() > 0}>
                                <div class="surface surface--quiet stack stack--tight">
                                    <p class="small">
                                        {learning.conflictCount()} local change
                                        {learning.conflictCount() === 1 ? "" : "s"} could not be
                                        applied because the account changed elsewhere. The local
                                        work is kept until you choose what to do.
                                    </p>
                                    <div class="row">
                                        <button
                                            type="button"
                                            class="button button--secondary button--small"
                                            onClick={function retry(): void {
                                                void learning.retryConflicts();
                                            }}
                                        >
                                            Retry queued changes
                                        </button>
                                        <button
                                            type="button"
                                            class="button button--ghost button--small"
                                            onClick={function discard(): void {
                                                void learning.discardConflicts();
                                            }}
                                        >
                                            Discard retained changes
                                        </button>
                                    </div>
                                </div>
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
                        <Show when={outcomes().length === 0 && !running() && !draftLoading()}>
                            <p class="feedback feedback--info" role="status">
                                No checks have run for this stage yet. Use Run stage checks to see
                                each result.
                            </p>
                        </Show>
                        <Show when={outcomes().length > 0}>
                            <p
                                class={`feedback ${
                                    failedCount() === 0 ? "feedback--success" : "feedback--error"
                                }`}
                                role="status"
                            >
                                {failedCount() === 0
                                    ? "All checks for this stage passed."
                                    : `${failedCount()} of ${outcomes().length} checks failed. Fix the failing rows, then run the stage again.`}
                            </p>
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
                                                        <span
                                                            class={`status ${item.passed ? "status--success" : "status--error"}`}
                                                        >
                                                            <span
                                                                class="status__mark"
                                                                aria-hidden="true"
                                                            />
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
                            <p class="feedback feedback--error" role="alert">
                                {runtimeError()} No check results were recorded for this run.
                            </p>
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
                        <button
                            type="button"
                            class="button button--secondary"
                            onClick={function save(): void {
                                void learning.saveProjectDraft(project.id, files());
                            }}
                        >
                            Save draft
                        </button>
                    </div>
                </Show>
            </div>
        </main>
    );
}
