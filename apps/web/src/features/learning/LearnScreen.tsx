import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import type { AchievementDefinition } from "@praxbit/contracts";
import {
    achievementProgress,
    demonstratedLanguages,
    isWorldRecovered,
    type AchievementContext,
} from "@praxbit/domain";
import { Pip } from "../../design/Pip.tsx";
import { achievements, missions, skillName, tracks } from "../../content/index.ts";
import { useLearning } from "./learning-store.tsx";
import { LearningMap } from "./LearningMap.tsx";

export function LearnScreen(): JSX.Element {
    const learning = useLearning();

    const achievementContext = createMemo<AchievementContext>(
        function buildAchievementContext(): AchievementContext {
            const evidence = learning.evidence();
            return {
                evidence,
                completedMissionIds: [...learning.completedMissionIds()],
                projectsCompleted: learning.completedProjectIds().length,
                clubEventsCompleted: 0,
                cooperativeChallengeCompleted: false,
                worldRecovered:
                    isWorldRecovered(learning.world()) ||
                    learning.world().flags["incidentResolved"] === true,
                languagesDemonstrated: demonstratedLanguages(evidence),
                hiddenBoundaryFound: evidence.some(function boundary(record): boolean {
                    return record.category === "testing" && record.outcome === "success";
                }),
                difficultDebuggingRecovered: evidence.some(function debugging(record): boolean {
                    return record.category === "debugging" && record.outcome === "success";
                }),
                teammateHelped: false,
            };
        },
    );

    const earnedAchievementIds = createMemo(function earnedIds(): ReadonlySet<string> {
        return new Set(
            learning.progress().achievements.map(function idOf(record): string {
                return record.achievementId;
            }),
        );
    });

    const earnedAchievementDates = createMemo(function earnedDates(): ReadonlyMap<string, string> {
        return new Map(
            learning.progress().achievements.map(function entry(record): [string, string] {
                return [record.achievementId, record.earnedAt];
            }),
        );
    });

    function achievementState(
        definition: AchievementDefinition,
    ): ReturnType<typeof achievementProgress> {
        return achievementProgress(definition, achievementContext());
    }

    const recommended = function recommended() {
        return missions.find(function match(mission): boolean {
            return mission.id === learning.recommendationId();
        });
    };

    const campaigns = function campaigns() {
        return tracks.filter(function campaign(track): boolean {
            return track.kind === "campaign";
        });
    };

    const otherTracks = function otherTracks() {
        return tracks.filter(function campaign(track): boolean {
            return track.kind !== "campaign";
        });
    };

    const [query, setQuery] = createSignal("");

    const trackGroups = [
        { kind: "language", title: "Languages" },
        { kind: "framework", title: "Frameworks and tools" },
        { kind: "discipline", title: "Engineering and computer science" },
    ] as const;

    const matchingTracks = createMemo(function matching() {
        const needle = query().trim().toLowerCase();
        return otherTracks().filter(function matches(track): boolean {
            if (needle.length === 0) {
                return true;
            }
            return `${track.title} ${track.summary}`.toLowerCase().includes(needle);
        });
    });

    function tracksInGroup(kind: string) {
        return matchingTracks().filter(function inGroup(track): boolean {
            return track.kind === kind;
        });
    }

    return (
        <main class="page">
            <div class="page-header">
                <div class="page-header__text">
                    <h1>Learn</h1>
                    <p class="lede">
                        {learning.preferences().interests.includes("everything")
                            ? "Follow the campus story, with reviews when they are useful."
                            : "Your interests shape recommendations. The full curriculum stays open."}
                    </p>
                </div>
                <div class="row">
                    <span class="meta">
                        Level {learning.progress().level} · {learning.progress().experience} XP
                    </span>
                    <span class="meta">
                        {learning.dueReviews().length === 0
                            ? "No reviews due"
                            : `${learning.dueReviews().length} skills due for review`}
                    </span>
                </div>
            </div>

            <div class="stack stack--wide">
                <Show when={recommended()}>
                    {function recommendation(mission): JSX.Element {
                        return (
                            <section class="surface stack" aria-labelledby="recommended-heading">
                                <div
                                    class="row"
                                    style={{
                                        "align-items": "flex-start",
                                        "justify-content": "space-between",
                                    }}
                                >
                                    <div class="stack stack--tight">
                                        <span class="meta">Next meaningful action</span>
                                        <h2 id="recommended-heading">{mission().title}</h2>
                                        <p class="lede">{mission().summary}</p>
                                    </div>
                                    <Pip pose="explaining" size={88} />
                                </div>
                                <Show when={learning.recommendationReasons().length > 0}>
                                    <ul class="stack stack--tight">
                                        <For each={learning.recommendationReasons()}>
                                            {function reason(item): JSX.Element {
                                                return <li class="small muted">{item}</li>;
                                            }}
                                        </For>
                                    </ul>
                                </Show>
                                <div class="row row--between">
                                    <span class="meta">
                                        {mission().estimatedMinutes} min · {mission().difficulty} ·{" "}
                                        {mission().skills.length}{" "}
                                        {mission().skills.length === 1 ? "skill" : "skills"}
                                    </span>
                                    <div class="row">
                                        <A class="button" href={`/missions/${mission().id}`}>
                                            Continue mission
                                        </A>
                                        <A class="button button--secondary" href="/practice">
                                            Short practice
                                        </A>
                                    </div>
                                </div>
                            </section>
                        );
                    }}
                </Show>

                <Show when={learning.dueReviews().length > 0}>
                    <section class="surface stack" aria-labelledby="review-heading">
                        <div class="surface__header">
                            <div>
                                <h2 id="review-heading">Review due</h2>
                                <p class="meta">
                                    A short revisit keeps a skill available. Missing a day is not
                                    punished.
                                </p>
                            </div>
                            <A class="button button--secondary button--small" href="/practice">
                                Start review
                            </A>
                        </div>
                        <ul class="stack stack--tight">
                            <For each={learning.dueReviews().slice(0, 5)}>
                                {function review(item): JSX.Element {
                                    return (
                                        <li class="row row--between">
                                            <span>{skillName(item.skillId)}</span>
                                            <span class="meta">
                                                due {new Date(item.dueAt).toLocaleDateString()}
                                            </span>
                                        </li>
                                    );
                                }}
                            </For>
                        </ul>
                    </section>
                </Show>

                <section class="surface stack" aria-labelledby="streak-heading">
                    <div class="row row--between">
                        <div>
                            <h2 id="streak-heading">Practice streak</h2>
                            <p class="meta">
                                A record of practice, not a requirement. Missed days never remove
                                progress.
                            </p>
                        </div>
                        <span class="meta">Gentle and optional</span>
                    </div>
                    <div class="grid grid--two">
                        <div class="stack stack--tight">
                            <span class="meta">Current streak</span>
                            <p class="lede">
                                {learning.progress().streakDays}{" "}
                                {learning.progress().streakDays === 1 ? "day" : "days"}
                            </p>
                            <p class="small muted">
                                {learning.progress().streakDays === 0
                                    ? "No current streak. Any short practice starts one."
                                    : "Practice today keeps the current run going."}
                            </p>
                        </div>
                        <div class="stack stack--tight">
                            <span class="meta">Longest streak</span>
                            <p class="lede">
                                {learning.progress().longestStreak}{" "}
                                {learning.progress().longestStreak === 1 ? "day" : "days"}
                            </p>
                            <p class="small muted">
                                The longest run is kept even when the current streak pauses.
                            </p>
                        </div>
                    </div>
                </section>

                <section
                    class="surface stack"
                    aria-labelledby="achievements-heading"
                    data-testid="achievements-gallery"
                >
                    <div class="surface__header">
                        <div>
                            <h2 id="achievements-heading">Achievements</h2>
                            <p class="meta">
                                Earned from evidence and completed work, not from time spent
                                clicking.
                            </p>
                        </div>
                        <span class="meta">
                            {earnedAchievementIds().size} of {achievements.length} earned
                        </span>
                    </div>
                    <ul class="achievement-gallery" aria-label="Achievements">
                        <For each={achievements}>
                            {function achievementCard(definition): JSX.Element {
                                const earned = function earned(): boolean {
                                    return earnedAchievementIds().has(definition.id);
                                };
                                const state = function state() {
                                    return achievementState(definition);
                                };
                                const earnedOn = function earnedOn(): string {
                                    const value = earnedAchievementDates().get(definition.id);
                                    return value === undefined
                                        ? "on this device"
                                        : new Date(value).toLocaleDateString();
                                };
                                return (
                                    <li
                                        class="achievement-card"
                                        data-achievement-id={definition.id}
                                        data-earned={earned() ? "true" : "false"}
                                        aria-label={`${definition.title}: ${earned() ? "earned" : "not earned yet"}`}
                                    >
                                        <div class="row row--between">
                                            <strong>{definition.title}</strong>
                                            <span class="meta">
                                                {earned() ? "Earned" : "Not earned yet"}
                                            </span>
                                        </div>
                                        <p class="small muted">{definition.description}</p>
                                        <Show
                                            when={!earned()}
                                            fallback={<p class="meta">Earned {earnedOn()}</p>}
                                        >
                                            <progress
                                                class="achievement-progress"
                                                max={state().target}
                                                value={state().current}
                                                aria-label={`${definition.title} progress`}
                                            />
                                            <p class="meta">
                                                {state().current} of {state().target} recorded
                                            </p>
                                        </Show>
                                    </li>
                                );
                            }}
                        </For>
                    </ul>
                </section>

                <section class="stack" aria-labelledby="map-heading">
                    <div class="page-header">
                        <div class="page-header__text">
                            <h2 id="map-heading">Learning map</h2>
                            <p class="meta">
                                Numbered rectangles are missions in story order. The order is a
                                guide, not a single mandatory path. Locked nodes name the skills
                                that open them.
                            </p>
                        </div>
                    </div>
                    <For each={campaigns()}>
                        {function track(item): JSX.Element {
                            return <LearningMap track={item} />;
                        }}
                    </For>
                </section>

                <section class="stack" aria-labelledby="tracks-heading">
                    <div class="page-header">
                        <div class="page-header__text">
                            <h2 id="tracks-heading">Explore tracks</h2>
                            <p class="meta">
                                Every track stays open. Search by language, framework, or topic.
                            </p>
                        </div>
                        <label class="field track-search">
                            <span class="meta">Search tracks</span>
                            <input
                                class="input"
                                type="search"
                                placeholder="TypeScript, database, DevOps"
                                value={query()}
                                onInput={function change(event): void {
                                    setQuery(event.currentTarget.value);
                                }}
                            />
                        </label>
                    </div>
                    <For each={trackGroups}>
                        {function groupSection(section): JSX.Element {
                            const groupTracks = function groupTracks() {
                                return tracksInGroup(section.kind);
                            };
                            return (
                                <Show when={groupTracks().length > 0}>
                                    <section
                                        class="stack stack--tight track-group"
                                        aria-labelledby={`track-group-${section.kind}`}
                                    >
                                        <div class="row row--between">
                                            <h3 id={`track-group-${section.kind}`}>
                                                {section.title}
                                            </h3>
                                            <span class="meta">
                                                {groupTracks().length}{" "}
                                                {groupTracks().length === 1 ? "track" : "tracks"}
                                            </span>
                                        </div>
                                        <div class="track-grid">
                                            <For each={groupTracks()}>
                                                {function track(item): JSX.Element {
                                                    const first = item.missionIds[0];
                                                    return (
                                                        <article class="surface stack stack--tight">
                                                            <h4>{item.title}</h4>
                                                            <p class="small muted">
                                                                {item.summary}
                                                            </p>
                                                            <div class="row row--between">
                                                                <span class="meta">
                                                                    {item.missionIds.length}{" "}
                                                                    {item.missionIds.length === 1
                                                                        ? "mission"
                                                                        : "missions"}
                                                                </span>
                                                                <Show when={first !== undefined}>
                                                                    <A
                                                                        class="button button--secondary button--small"
                                                                        href={`/missions/${first}`}
                                                                    >
                                                                        Open track
                                                                    </A>
                                                                </Show>
                                                            </div>
                                                        </article>
                                                    );
                                                }}
                                            </For>
                                        </div>
                                    </section>
                                </Show>
                            );
                        }}
                    </For>
                    <Show when={matchingTracks().length === 0}>
                        <p class="feedback feedback--info">
                            No tracks match that search. Clear the search to see every track.
                        </p>
                    </Show>
                </section>
            </div>
        </main>
    );
}
