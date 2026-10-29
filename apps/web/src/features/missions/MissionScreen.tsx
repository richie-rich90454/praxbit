import { A, useLocation, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createSignal, onMount, type JSX } from "solid-js";
import type { Interest, Mission, Misconception } from "@praxbit/contracts";
import {
    evaluateMission,
    findMisconception,
    type MissionEvaluation,
    type StepEvaluation,
} from "@praxbit/domain";
import { ApiError } from "@praxbit/client";
import { Pip } from "../../design/Pip.tsx";
import { useLearning, type CompletionOutcome } from "../learning/learning-store.tsx";
import { getMission, nextMission, skillName, trackForMission } from "../../content/index.ts";
import { api, db } from "../../platform/services.ts";
import { StepView } from "./interactions/StepView.tsx";

interface SavedMissionProgress {
    readonly stepIndex: number;
    readonly hints: Readonly<Record<string, number>>;
}

interface FeedbackState {
    readonly evaluation: StepEvaluation;
    readonly misconception?: Misconception;
}

interface CompletionState {
    readonly outcome: CompletionOutcome;
    readonly evaluation: MissionEvaluation;
}

const INTEREST_CHOICES: readonly { id: Interest; label: string; detail: string }[] = [
    {
        id: "web",
        label: "Websites and applications",
        detail: "Build pages, interfaces, and services.",
    },
    {
        id: "games",
        label: "Games and interactive worlds",
        detail: "Simulation, graphics, and interaction.",
    },
    {
        id: "systems",
        label: "How computers work",
        detail: "Memory, networks, operating systems, and infrastructure.",
    },
    {
        id: "ai",
        label: "AI and automation",
        detail: "Models, evaluation, and responsible delegation.",
    },
    {
        id: "professional",
        label: "Professional development",
        detail: "Testing, collaboration, architecture, and delivery.",
    },
    { id: "everything", label: "Explore everything", detail: "Follow the whole map." },
];

function runtimeText(mission: Mission): string {
    switch (mission.runtime.kind) {
        case "browser-javascript":
            return "Real JavaScript execution in a browser worker";
        case "browser-typescript":
            return "Transpiled TypeScript with behavioral tests";
        case "browser-html":
        case "browser-css":
            return "Sandboxed browser preview with structural checks";
        case "browser-python":
            return "Pyodide WebAssembly Python";
        case "browser-sql":
            return "SQLite WebAssembly";
        case "browser-git":
            return "isomorphic-git in-browser repository";
        case "simulated-linux":
            return "Deterministic Linux simulation";
        case "static-analysis":
            return "Static and structural analysis";
        case "guided-simulation":
            return "Guided simulation";
        default:
            return "Interactive exercise";
    }
}

export function MissionScreen(): JSX.Element {
    const params = useParams<{ id: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const learning = useLearning();

    const mission = getMission(params.id);
    const practice = new URLSearchParams(location.search).get("practice") === "1";
    const alreadyCompleted = learning.completedMissionIds().has(params.id);

    let headingRef: HTMLHeadingElement | undefined;
    const [phase, setPhase] = createSignal<"briefing" | "steps" | "complete">("briefing");
    const [stepIndex, setStepIndex] = createSignal(0);
    const [feedback, setFeedback] = createSignal<FeedbackState | undefined>(undefined);
    const [hintLevel, setHintLevel] = createSignal(0);
    const [hints, setHints] = createSignal<Readonly<Record<string, number>>>({});
    const [evaluations, setEvaluations] = createSignal<Readonly<Record<string, StepEvaluation>>>(
        {},
    );
    const [completion, setCompletion] = createSignal<CompletionState | undefined>(undefined);
    const [attemptId, setAttemptId] = createSignal("");
    const [savedStep, setSavedStep] = createSignal(0);
    const [beginError, setBeginError] = createSignal("");
    const [interestSaved, setInterestSaved] = createSignal(false);
    const [aiQuestion, setAiQuestion] = createSignal("");
    const [aiAnswer, setAiAnswer] = createSignal("");
    const [aiError, setAiError] = createSignal("");
    const [aiBusy, setAiBusy] = createSignal(false);

    const currentStep = function currentStep(): Mission["steps"][number] | undefined {
        return mission?.steps[stepIndex()];
    };

    function saveProgress(): void {
        if (mission === undefined) {
            return;
        }
        const value: SavedMissionProgress = { stepIndex: stepIndex(), hints: hints() };
        void db.meta.put({ key: `mission-progress:${mission.id}`, value: JSON.stringify(value) });
    }

    onMount(function restore(): void {
        if (mission === undefined) {
            return;
        }
        void (async function load(): Promise<void> {
            const row = await db.meta.get(`mission-progress:${mission.id}`);
            if (row === undefined) {
                return;
            }
            try {
                const parsed = JSON.parse(row.value) as SavedMissionProgress;
                if (
                    Number.isInteger(parsed.stepIndex) &&
                    parsed.stepIndex >= 0 &&
                    parsed.stepIndex < mission.steps.length
                ) {
                    setSavedStep(parsed.stepIndex);
                    setHints(parsed.hints ?? {});
                }
            } catch {
                return;
            }
        })();
    });

    createEffect(function focusStep(): void {
        if (phase() === "steps") {
            headingRef?.focus();
        }
    });

    async function begin(): Promise<void> {
        if (mission === undefined) {
            return;
        }
        setBeginError("");
        let id: string = crypto.randomUUID();
        if (learning.user() !== undefined) {
            try {
                const attempt = await api.startAttempt({
                    missionId: mission.id,
                    missionVersion: mission.version,
                });
                id = attempt.attemptId;
            } catch (error) {
                setBeginError(
                    error instanceof Error
                        ? `${error.message} The mission will still run and save on this device.`
                        : "The attempt could not be registered. The mission will still run on this device.",
                );
            }
        }
        setAttemptId(id);
        setStepIndex(savedStep());
        setPhase("steps");
        saveProgress();
    }

    async function handleResult(evaluation: StepEvaluation, answerKey?: string): Promise<void> {
        if (mission === undefined) {
            return;
        }
        const step = currentStep();
        if (step === undefined) {
            return;
        }
        const misconception = evaluation.passed
            ? undefined
            : findMisconception(mission, step.id, answerKey);
        setFeedback({ evaluation, ...(misconception === undefined ? {} : { misconception }) });
        setEvaluations(function update(current): Readonly<Record<string, StepEvaluation>> {
            return { ...current, [step.id]: evaluation };
        });
        if (step.kind === "lesson") {
            saveProgress();
            await continueStep();
            return;
        }
        const hintsUsed = hints()[step.id] ?? hintLevel();
        await learning.recordStepEvidence(mission, step, evaluation, hintsUsed);
        saveProgress();
    }

    async function finish(): Promise<void> {
        if (mission === undefined) {
            return;
        }
        const stepResults = evaluations();
        const evaluation = evaluateMission(mission, stepResults);
        let outcome: CompletionOutcome;
        if (practice && alreadyCompleted) {
            await learning.recordPracticeReview(mission);
            outcome = {
                alreadyCompleted: true,
                experience: 0,
                independent: true,
                newAchievements: [],
                worldChanged: false,
            };
        } else {
            outcome = await learning.completeMission(mission, attemptId(), hints());
        }
        if (mission !== undefined) {
            await db.meta.delete(`mission-progress:${mission.id}`);
        }
        setCompletion({ outcome, evaluation });
        setPhase("complete");
    }

    async function continueStep(): Promise<void> {
        const state = feedback();
        if (state === undefined || !state.evaluation.passed) {
            return;
        }
        if (mission === undefined) {
            return;
        }
        if (stepIndex() >= mission.steps.length - 1) {
            await finish();
            return;
        }
        setStepIndex(function next(current): number {
            return current + 1;
        });
        setFeedback(undefined);
        setHintLevel(0);
        saveProgress();
    }

    function showHint(): void {
        const step = currentStep();
        if (step === undefined) {
            return;
        }
        const nextLevel = Math.min(4, hintLevel() + 1);
        setHintLevel(nextLevel);
        if (nextLevel > (hints()[step.id] ?? 0)) {
            setHints(function update(current): Readonly<Record<string, number>> {
                return { ...current, [step.id]: nextLevel };
            });
        }
        saveProgress();
    }

    function hintText(): string {
        const step = currentStep();
        if (step === undefined || hintLevel() === 0) {
            return "";
        }
        const stepHints = step.hints;
        if (stepHints !== undefined) {
            return stepHints[hintLevel() - 1] ?? "";
        }
        return mission?.hints[hintLevel() - 1] ?? "";
    }

    function nextReviewLabel(): string {
        const skillIds = mission?.skills ?? [];
        const dueDates = learning
            .reviews()
            .filter(function relevant(review): boolean {
                return skillIds.includes(review.skillId);
            })
            .map(function dueDate(review): number {
                return new Date(review.dueAt).getTime();
            });
        if (dueDates.length === 0) {
            return "Review will be scheduled when progress synchronizes.";
        }
        return new Date(Math.min(...dueDates)).toLocaleDateString();
    }

    async function chooseInterest(interest: Interest): Promise<void> {
        const current = learning.preferences();
        await learning.savePreferences({ ...current, interests: [interest] });
        await learning.setOnboarded(true);
        setInterestSaved(true);
    }

    async function askLiveTutor(): Promise<void> {
        const step = currentStep();
        if (mission === undefined || step === undefined || aiQuestion().trim().length === 0) {
            return;
        }
        setAiBusy(true);
        setAiError("");
        setAiAnswer("");
        try {
            const response = await api.requestAiHint({
                missionId: mission.id,
                stepId: step.id,
                question: aiQuestion().trim(),
            });
            setAiAnswer(response.text);
        } catch (error) {
            if (error instanceof ApiError && error.code === "ai_unavailable") {
                setAiError(
                    "The live tutor is not configured on this deployment. The curated hints remain available.",
                );
            } else {
                setAiError(
                    error instanceof Error ? error.message : "The live tutor request failed.",
                );
            }
        } finally {
            setAiBusy(false);
        }
    }

    if (mission === undefined) {
        return (
            <main class="page page--narrow">
                <h1>Mission not found</h1>
                <p class="lede">This mission does not exist in the current content catalog.</p>
                <A class="button" href="/learn">
                    Return to Learn
                </A>
            </main>
        );
    }

    const track = trackForMission(mission.id);
    const follow = nextMission(mission.id);

    return (
        <main class="page page--narrow">
            <div class="row row--between" style={{ "margin-bottom": "var(--space-5)" }}>
                <A class="button button--ghost button--small" href="/learn">
                    Back to Learn
                </A>
                <span class="meta">
                    {track?.title ?? "Campus"} · {mission.estimatedMinutes} min ·{" "}
                    {mission.difficulty}
                </span>
            </div>

            <Show when={phase() === "briefing"}>
                <div class="stack stack--wide">
                    <div class="stack stack--tight">
                        <span class="meta">Mission {mission.sequence}</span>
                        <h1>{mission.title}</h1>
                        <p class="lede">{mission.summary}</p>
                    </div>
                    <div class="surface stack">
                        <div class="row" style={{ "align-items": "flex-start" }}>
                            <Pip pose="explaining" size={72} />
                            <div class="stack stack--tight">
                                <h2>Briefing</h2>
                                <p>{mission.scenario.briefing}</p>
                            </div>
                        </div>
                        <hr class="divider" />
                        <div class="stack stack--tight">
                            <h3>Objectives</h3>
                            <ul class="stack stack--tight">
                                <For each={mission.objectives}>
                                    {function objective(item): JSX.Element {
                                        return <li>{item.description}</li>;
                                    }}
                                </For>
                            </ul>
                        </div>
                        <div class="grid grid--two">
                            <div class="stack stack--tight">
                                <h3>Skills</h3>
                                <p class="small muted">
                                    {mission.skills
                                        .map(function nameOf(skillId): string {
                                            return skillName(skillId);
                                        })
                                        .join(", ")}
                                </p>
                            </div>
                            <div class="stack stack--tight">
                                <h3>Runs here</h3>
                                <p class="small muted">{runtimeText(mission)}</p>
                            </div>
                        </div>
                        <Show when={savedStep() > 0}>
                            <p class="notice">
                                A saved attempt resumes at step {savedStep() + 1}. Mission answers
                                are checked, not remembered as proof of understanding.
                            </p>
                        </Show>
                        <Show when={beginError().length > 0}>
                            <p class="notice notice--error">{beginError()}</p>
                        </Show>
                        <div class="row">
                            <button
                                type="button"
                                class="button"
                                onClick={function start(): void {
                                    void begin();
                                }}
                            >
                                {savedStep() > 0
                                    ? `Resume at step ${savedStep() + 1}`
                                    : "Start mission"}
                            </button>
                            <A class="button button--secondary" href="/placement">
                                I already know this
                            </A>
                        </div>
                    </div>
                </div>
            </Show>

            <Show when={phase() === "steps" && currentStep() !== undefined}>
                <div class="stack">
                    <div class="row row--between">
                        <span class="meta">
                            Step {stepIndex() + 1} of {mission.steps.length}
                        </span>
                        <span class="meta">{mission.title}</span>
                    </div>
                    <div class="progress-bar" aria-hidden="true">
                        <div
                            class="progress-bar__fill"
                            style={{
                                width: `${((stepIndex() + 1) / mission.steps.length) * 100}%`,
                            }}
                        />
                    </div>

                    <div class="stack stack--tight">
                        <h1
                            ref={headingRef}
                            tabindex="-1"
                            style={{ "font-size": "var(--text-section)" }}
                        >
                            {currentStep()?.title}
                        </h1>
                        <h2 class="visually-hidden">Step content</h2>
                        <p>{currentStep()?.prompt}</p>
                    </div>

                    <Show keyed when={currentStep()}>
                        {function stepContent(step): JSX.Element {
                            return (
                                <StepView
                                    step={step}
                                    draftKey={`mission:${mission.id}:${step.id}`}
                                    onResult={function result(evaluation, answerKey): void {
                                        void handleResult(evaluation, answerKey);
                                    }}
                                />
                            );
                        }}
                    </Show>

                    <div class="surface surface--quiet stack stack--tight">
                        <div class="row row--between">
                            <h3>Hints</h3>
                            <button
                                type="button"
                                class="button button--secondary button--small"
                                disabled={hintLevel() >= 4}
                                onClick={showHint}
                            >
                                {hintLevel() === 0
                                    ? "Show a hint"
                                    : hintLevel() >= 4
                                      ? "All hints shown"
                                      : "Next hint"}
                            </button>
                        </div>
                        <Show
                            when={hintLevel() > 0}
                            fallback={
                                <p class="small muted">
                                    Hints are available without penalty to your XP. Assisted work
                                    counts as weaker mastery evidence.
                                </p>
                            }
                        >
                            <p class="small">{hintText()}</p>
                            <p class="meta">Hint {hintLevel()} of 4</p>
                        </Show>
                    </div>

                    <Show when={learning.preferences().aiTutor && learning.user() !== undefined}>
                        <div class="surface surface--quiet stack stack--tight">
                            <div class="row row--between">
                                <h3>Live AI tutor</h3>
                                <span class="meta">Optional, external provider</span>
                            </div>
                            <p class="small muted">
                                Ask a question about this step. Only the mission identifier, step
                                identifier, and your question are sent to the configured provider.
                                The answer is guidance, not an authoritative evaluator.
                            </p>
                            <label class="field">
                                <span>Your question</span>
                                <textarea
                                    class="textarea"
                                    value={aiQuestion()}
                                    maxlength={1000}
                                    onInput={function change(event): void {
                                        setAiQuestion(event.currentTarget.value);
                                    }}
                                />
                            </label>
                            <div class="row">
                                <button
                                    type="button"
                                    class="button button--secondary button--small"
                                    disabled={aiBusy() || aiQuestion().trim().length === 0}
                                    onClick={function ask(): void {
                                        void askLiveTutor();
                                    }}
                                >
                                    {aiBusy() ? "Asking" : "Ask live tutor"}
                                </button>
                                <Show when={aiError().length > 0}>
                                    <span class="meta">{aiError()}</span>
                                </Show>
                            </div>
                            <Show when={aiAnswer().length > 0}>
                                <p class="feedback feedback--info">{aiAnswer()}</p>
                            </Show>
                        </div>
                    </Show>

                    <Show when={feedback() !== undefined}>
                        <div
                            class={`feedback ${feedback()?.evaluation.passed === true ? "feedback--success" : "feedback--error"}`}
                            role="status"
                        >
                            <div class="stack stack--tight">
                                <strong>
                                    {feedback()?.evaluation.passed === true
                                        ? "That works"
                                        : "Not yet"}
                                </strong>
                                <p>{feedback()?.evaluation.detail}</p>
                                <Show when={feedback()?.misconception !== undefined}>
                                    <p>{feedback()?.misconception?.feedback}</p>
                                </Show>
                                <Show when={feedback()?.evaluation.passed === true}>
                                    <div class="row">
                                        <button
                                            type="button"
                                            class="button"
                                            onClick={function next(): void {
                                                void continueStep();
                                            }}
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </Show>
                            </div>
                        </div>
                    </Show>
                </div>
            </Show>

            <Show when={phase() === "complete" && completion() !== undefined}>
                <div class="stack stack--wide">
                    <div class="row" style={{ "align-items": "flex-start" }}>
                        <Pip pose="celebrating" size={104} />
                        <div class="stack stack--tight">
                            <h1>
                                {practice && completion()?.outcome.alreadyCompleted === true
                                    ? "Practice complete"
                                    : "Mission complete"}
                            </h1>
                            <p class="lede">
                                {completion()?.outcome.alreadyCompleted === true
                                    ? "The review is recorded. The schedule will bring this skill back when it is useful."
                                    : `${mission.title} is complete.`}
                            </p>
                        </div>
                    </div>

                    <div class="surface stack">
                        <div class="grid grid--two">
                            <div class="stack stack--tight">
                                <h2>Result</h2>
                                <p class="small">
                                    {completion()?.outcome.independent === true
                                        ? "Independent success"
                                        : "Completed with assistance"}
                                </p>
                                <p class="meta">
                                    {completion()?.outcome.experience ?? 0} experience points.
                                    Experience is separate from mastery.
                                </p>
                                <p class="meta">
                                    {practice && completion()?.outcome.alreadyCompleted === true
                                        ? "Review interval updated."
                                        : `Next review: ${nextReviewLabel()}`}
                                </p>
                            </div>
                            <div class="stack stack--tight">
                                <h3>Evidence</h3>
                                <p class="small">
                                    Evidence was recorded for prediction, construction, debugging,
                                    testing, or explanation as each step required. Attempt outcomes
                                    are saved on this device and synchronized when an account is
                                    connected.
                                </p>
                            </div>
                        </div>
                        <Show
                            when={
                                completion()?.outcome.newAchievements !== undefined &&
                                (completion()?.outcome.newAchievements.length ?? 0) > 0
                            }
                        >
                            <div class="stack stack--tight">
                                <h3>Achievements</h3>
                                <ul class="stack stack--tight">
                                    <For each={completion()?.outcome.newAchievements ?? []}>
                                        {function achievement(item): JSX.Element {
                                            return (
                                                <li>
                                                    <strong>{item.title}</strong>:{" "}
                                                    {item.description}
                                                </li>
                                            );
                                        }}
                                    </For>
                                </ul>
                            </div>
                        </Show>
                        <Show when={completion()?.outcome.worldChanged === true}>
                            <p class="notice">
                                The campus world changed as a result of this repair. Open World to
                                see the new system state and its evidence.
                            </p>
                        </Show>
                        <Show when={!learning.onboarded()}>
                            <div class="stack stack--tight">
                                <h3>What do you want to explore next?</h3>
                                <p class="small muted">
                                    This changes recommendations, not the curriculum. You can change
                                    it any time.
                                </p>
                                <div class="grid grid--two">
                                    <For each={INTEREST_CHOICES}>
                                        {function interest(item): JSX.Element {
                                            return (
                                                <button
                                                    type="button"
                                                    class="surface surface--quiet interest-option"
                                                    onClick={function choose(): void {
                                                        void chooseInterest(item.id);
                                                    }}
                                                >
                                                    <strong>{item.label}</strong>
                                                    <span class="meta">{item.detail}</span>
                                                </button>
                                            );
                                        }}
                                    </For>
                                </div>
                                <Show when={interestSaved()}>
                                    <p class="small">
                                        Interest saved. Recommendations will use it.
                                    </p>
                                </Show>
                            </div>
                        </Show>
                    </div>

                    <div class="surface stack">
                        <h2>What you learned</h2>
                        <For each={mission.lesson.sections}>
                            {function section(item): JSX.Element {
                                return (
                                    <div class="stack stack--tight">
                                        <h3>{item.title}</h3>
                                        <p>{item.body}</p>
                                    </div>
                                );
                            }}
                        </For>
                        <div class="stack stack--tight">
                            <h3>Vocabulary</h3>
                            <dl class="stack stack--tight">
                                <For each={mission.lesson.vocabulary}>
                                    {function term(item): JSX.Element {
                                        return (
                                            <div>
                                                <dt>
                                                    <strong>{item.term}</strong>
                                                </dt>
                                                <dd class="small muted">{item.definition}</dd>
                                            </div>
                                        );
                                    }}
                                </For>
                            </dl>
                        </div>
                    </div>

                    <div class="row row--between">
                        <A class="button button--secondary" href="/learn">
                            Back to Learn
                        </A>
                        <Show when={follow}>
                            <A class="button" href={`/missions/${follow?.id}`}>
                                Next: {follow?.title}
                            </A>
                        </Show>
                        <Show when={follow === undefined}>
                            <A class="button" href="/practice">
                                Practice this skill
                            </A>
                        </Show>
                    </div>
                    <button
                        type="button"
                        class="button button--ghost"
                        onClick={function again(): void {
                            navigate(`/missions/${mission.id}?practice=1`);
                            window.location.reload();
                        }}
                    >
                        Practice this mission again
                    </button>
                </div>
            </Show>
        </main>
    );
}
