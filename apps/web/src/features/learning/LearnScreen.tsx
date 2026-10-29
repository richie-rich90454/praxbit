import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { Pip } from "../../design/Pip.tsx";
import { missions, skillName, tracks } from "../../content/index.ts";
import { useLearning } from "./learning-store.tsx";
import { LearningMap } from "./LearningMap.tsx";

export function LearnScreen(): JSX.Element {
    const learning = useLearning();

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
