import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import type { SessionLength } from "@praxbit/domain";
import { getMission, skillName } from "../../content/index.ts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";

export function PracticeScreen(): JSX.Element {
    const learning = useLearning();
    const [length, setLength] = createSignal<SessionLength>("short");
    const plan = createMemo(function sessionPlan() {
        return learning.practicePlan(length());
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
        <main class="page page--narrow">
            <div class="page-header">
                <div class="page-header__text">
                    <h1>Practice</h1>
                    <p class="lede">
                        Short sessions use retrieval, review, and one useful challenge. Stop after a few minutes if
                        that is enough.
                    </p>
                </div>
                <Pip pose="observing" size={80} />
            </div>

            <div class="stack stack--wide">
                <div class="surface stack">
                    <div class="row row--between">
                        <div class="stack stack--tight">
                            <h2>Your next session</h2>
                            <p class="meta">
                                {missionsInPlan().length} {missionsInPlan().length === 1 ? "activity" : "activities"} ·
                                about {plan().estimatedMinutes} min
                            </p>
                        </div>
                        <div class="row" role="group" aria-label="Session length">
                            <button
                                type="button"
                                class="button button--small"
                                classList={{ "button--secondary": length() !== "short" }}
                                aria-pressed={length() === "short"}
                                onClick={function short(): void {
                                    setLength("short");
                                }}
                            >
                                Short
                            </button>
                            <button
                                type="button"
                                class="button button--small"
                                classList={{ "button--secondary": length() !== "medium" }}
                                aria-pressed={length() === "medium"}
                                onClick={function medium(): void {
                                    setLength("medium");
                                }}
                            >
                                Medium
                            </button>
                            <button
                                type="button"
                                class="button button--small"
                                classList={{ "button--secondary": length() !== "long" }}
                                aria-pressed={length() === "long"}
                                onClick={function long(): void {
                                    setLength("long");
                                }}
                            >
                                Longer
                            </button>
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
                            <p class="small">
                                {plan().weakSkillIds.map(skillName).join(", ")}
                            </p>
                        </div>
                    </Show>

                    <div class="stack stack--tight">
                        <h3>Plan</h3>
                        <ul class="stack stack--tight">
                            <For each={missionsInPlan()}>
                                {function mission(item): JSX.Element {
                                    return (
                                        <li class="row row--between">
                                            <span>{item.title}</span>
                                            <span class="meta">
                                                {item.estimatedMinutes} min · {item.skills.map(skillName).join(", ")}
                                            </span>
                                        </li>
                                    );
                                }}
                            </For>
                        </ul>
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
                </div>

                <div class="surface surface--quiet stack stack--tight">
                    <h2>How practice changes evidence</h2>
                    <p class="small muted">
                        Independent answers count more than assisted ones. Repeated practice refreshes the review
                        schedule, but it does not replace an independent transfer challenge. Experience is awarded only
                        for a first completion.
                    </p>
                </div>
            </div>
        </main>
    );
}
