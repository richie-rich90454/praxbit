import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { PRACTICE_BUDGET_MINUTES, resolveMissionMode, type SessionLength } from "@praxbit/domain";
import { getMission, skillName } from "../../content/index.ts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";
import "./practice.css";

const LENGTH_LABELS: Readonly<Record<SessionLength, string>> = {
    short: "Short",
    medium: "Medium",
    long: "Longer",
};

const MODE_LABELS = {
    practice: "Quick practice",
    incident: "Engineering incident",
    project: "Project step",
    campaign: "Campaign mission",
    transfer: "Transfer challenge",
} as const;

export function PracticeScreen(): JSX.Element {
    const learning = useLearning();
    const [length, setLength] = createSignal<SessionLength>("short");
    const plan = createMemo(function sessionPlan() {
        return learning.practicePlan(length());
    });
    const budget = createMemo(function sessionBudget(): number {
        return PRACTICE_BUDGET_MINUTES[length()];
    });

    const missionsInPlan = createMemo(function planMissions() {
        return plan()
            .missionIds.map(function toMission(missionId): ReturnType<typeof getMission> {
                return getMission(missionId);
            })
            .filter(function present(mission): mission is NonNullable<typeof mission> {
                return mission !== undefined;
            });
    });

    const firstMission = function firstMission() {
        return missionsInPlan()[0];
    };

    return (
        <main class="page page--narrow practice-screen">
            <div class="page-header">
                <div class="page-header__text">
                    <span class="meta">Quick practice mode</span>
                    <h1>Practice</h1>
                    <p class="lede">
                        Short sessions use retrieval, review, and one useful challenge. The plan
                        only includes activities that fit the time you choose.
                    </p>
                </div>
                <Pip pose="observing" size={80} />
            </div>

            <div class="stack stack--wide">
                <section
                    class="surface practice-session"
                    aria-labelledby="practice-session-heading"
                >
                    <div class="row row--between">
                        <div class="stack stack--tight">
                            <h2 id="practice-session-heading">Your next session</h2>
                            <p class="meta">
                                {missionsInPlan().length}{" "}
                                {missionsInPlan().length === 1 ? "activity" : "activities"} · about{" "}
                                {plan().estimatedMinutes} of {budget()} min
                            </p>
                        </div>
                        <div class="row" role="group" aria-label="Session length">
                            <For each={["short", "medium", "long"] as const}>
                                {function lengthButton(option): JSX.Element {
                                    return (
                                        <button
                                            type="button"
                                            class="button button--small"
                                            classList={{
                                                "button--secondary": length() !== option,
                                            }}
                                            aria-pressed={length() === option}
                                            onClick={function change(): void {
                                                setLength(option);
                                            }}
                                        >
                                            {LENGTH_LABELS[option]}
                                        </button>
                                    );
                                }}
                            </For>
                        </div>
                    </div>

                    <Show when={plan().dueSkillIds.length > 0}>
                        <div class="stack stack--tight">
                            <h3>Review first</h3>
                            <p class="small">
                                Due: {plan().dueSkillIds.slice(0, 5).map(skillName).join(", ")}
                            </p>
                        </div>
                    </Show>

                    <Show when={plan().weakSkillIds.length > 0}>
                        <div class="stack stack--tight">
                            <h3>Worth strengthening</h3>
                            <p class="small">{plan().weakSkillIds.map(skillName).join(", ")}</p>
                        </div>
                    </Show>

                    <div class="stack stack--tight">
                        <div class="row row--between">
                            <h3>Plan</h3>
                            <span class="meta" data-testid="practice-budget">
                                {budget()} min limit
                            </span>
                        </div>
                        <Show
                            when={missionsInPlan().length > 0}
                            fallback={
                                <p class="notice">
                                    No activity fits this session length yet. Try a longer session
                                    or open the learning map for an available mission.
                                </p>
                            }
                        >
                            <ul
                                class="practice-plan"
                                data-testid="practice-plan"
                                aria-label={`${LENGTH_LABELS[length()]} practice plan`}
                            >
                                <For each={missionsInPlan()}>
                                    {function mission(item): JSX.Element {
                                        const mode = resolveMissionMode(item);
                                        return (
                                            <li
                                                class="practice-plan__item"
                                                data-practice-id={item.id}
                                                data-practice-minutes={item.estimatedMinutes}
                                                data-practice-mode={mode}
                                            >
                                                <div class="practice-plan__text">
                                                    <strong>{item.title}</strong>
                                                    <span class="meta">
                                                        {item.skills.map(skillName).join(", ")}
                                                    </span>
                                                </div>
                                                <span class="practice-plan__meta">
                                                    <span>{MODE_LABELS[mode]}</span>
                                                    <span>{item.estimatedMinutes} min</span>
                                                </span>
                                            </li>
                                        );
                                    }}
                                </For>
                            </ul>
                        </Show>
                    </div>

                    <Show when={firstMission() !== undefined}>
                        <div class="row">
                            <A class="button" href={`/missions/${firstMission()?.id}?practice=1`}>
                                Start practice
                            </A>
                            <A class="button button--secondary" href="/learn">
                                Choose another subject
                            </A>
                        </div>
                    </Show>
                </section>

                <div class="surface surface--quiet stack stack--tight">
                    <h2>How practice changes evidence</h2>
                    <p class="small muted">
                        Independent answers count more than assisted ones. Repeated practice
                        refreshes the review schedule, but it does not replace an independent
                        transfer challenge. Experience is awarded only for a first completion.
                    </p>
                </div>
            </div>
        </main>
    );
}
