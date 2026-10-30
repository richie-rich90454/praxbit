import { A, useNavigate } from "@solidjs/router";
import { For, Show, createEffect, createSignal, type JSX } from "solid-js";
import { gradePlacement, type PlacementResult } from "@praxbit/domain";
import { announce } from "../../app/AppShell.tsx";
import { placement, missions } from "../../content/index.ts";
import { useLearning } from "../learning/learning-store.tsx";

export function PlacementScreen(): JSX.Element {
    const learning = useLearning();
    const navigate = useNavigate();
    let resultHeadingRef: HTMLHeadingElement | undefined;
    const [answers, setAnswers] = createSignal<Readonly<Record<string, string>>>({});
    const [result, setResult] = createSignal<PlacementResult | undefined>(undefined);
    const [saving, setSaving] = createSignal(false);

    createEffect(function focusResult(): void {
        const graded = result();
        if (graded === undefined) {
            return;
        }
        announce(
            `Placement complete. ${graded.correct} of ${graded.total} correct. Review the suggested start.`,
        );
        queueMicrotask(function focus(): void {
            resultHeadingRef?.focus();
        });
    });

    const allAnswered = function allAnswered(): boolean {
        return placement.questions.every(function answered(question): boolean {
            return (answers()[question.id] ?? "").length > 0;
        });
    };

    async function submit(): Promise<void> {
        const graded = gradePlacement(placement, answers());
        setResult(graded);
        setSaving(true);
        await learning.applyPlacement({
            recommendedMissionId: graded.recommendedMissionId,
            skippedSkills: graded.skippedSkills,
            correct: graded.correct,
            total: graded.total,
        });
        await learning.setOnboarded(true);
        setSaving(false);
    }

    async function skip(): Promise<void> {
        await learning.setOnboarded(true);
        navigate("/learn");
    }

    const recommendedMission = function recommendedMission() {
        const graded = result();
        if (graded === undefined) {
            return undefined;
        }
        return missions.find(function match(mission): boolean {
            return mission.id === graded.recommendedMissionId;
        });
    };

    return (
        <main class="page page--narrow">
            <div class="page-header">
                <div class="page-header__text">
                    <h1>I already know programming</h1>
                    <p class="lede">
                        Answer what you can. Placement is skippable and only adjusts where you
                        start. It does not grant mastery; later evidence still builds your skill
                        estimates.
                    </p>
                </div>
            </div>

            <Show
                when={result() === undefined}
                fallback={
                    <div class="stack stack--wide">
                        <div class="surface stack">
                            <h2 ref={resultHeadingRef} tabindex="-1">
                                Suggested start
                            </h2>
                            <p>
                                {result()?.correct} of {result()?.total} correct. The recommendation
                                is a starting point, not a permanent placement.
                            </p>
                            <Show when={recommendedMission() !== undefined}>
                                <div class="stack stack--tight">
                                    <h3>{recommendedMission()?.title}</h3>
                                    <p class="small muted">{recommendedMission()?.summary}</p>
                                    <div class="row">
                                        <A
                                            class="button"
                                            href={`/missions/${recommendedMission()?.id}`}
                                        >
                                            Start here
                                        </A>
                                        <A class="button button--secondary" href="/learn">
                                            Explore the map instead
                                        </A>
                                    </div>
                                </div>
                            </Show>
                            <Show when={(result()?.skippedSkills.length ?? 0) > 0}>
                                <p class="meta">
                                    Placement credits cover {result()?.skippedSkills.length}{" "}
                                    prerequisite skills. They are visible in your progress and can
                                    be revisited.
                                </p>
                            </Show>
                        </div>
                    </div>
                }
            >
                <div class="stack stack--wide">
                    <For each={placement.questions}>
                        {function question(item, index): JSX.Element {
                            return (
                                <fieldset class="surface stack stack--tight">
                                    <legend>
                                        <strong>
                                            {index() + 1}. {item.prompt}
                                        </strong>
                                    </legend>
                                    <For each={item.options}>
                                        {function option(choice): JSX.Element {
                                            return (
                                                <label class="choice">
                                                    <input
                                                        type="radio"
                                                        name={`placement-${item.id}`}
                                                        checked={answers()[item.id] === choice.id}
                                                        onChange={function choose(): void {
                                                            setAnswers(
                                                                function update(
                                                                    current,
                                                                ): Readonly<
                                                                    Record<string, string>
                                                                > {
                                                                    return {
                                                                        ...current,
                                                                        [item.id]: choice.id,
                                                                    };
                                                                },
                                                            );
                                                        }}
                                                    />
                                                    <span class="choice__text">{choice.label}</span>
                                                </label>
                                            );
                                        }}
                                    </For>
                                </fieldset>
                            );
                        }}
                    </For>
                    <div class="row row--between">
                        <div class="row">
                            <button
                                type="button"
                                class="button"
                                disabled={!allAnswered() || saving()}
                                onClick={function grade(): void {
                                    void submit();
                                }}
                            >
                                {saving() ? "Saving placement" : "See suggested start"}
                            </button>
                            <button
                                type="button"
                                class="button button--secondary"
                                onClick={function leave(): void {
                                    void skip();
                                }}
                            >
                                Skip placement
                            </button>
                        </div>
                        <A class="button button--ghost" href="/learn">
                            Back to Learn
                        </A>
                    </div>
                </div>
            </Show>
        </main>
    );
}
