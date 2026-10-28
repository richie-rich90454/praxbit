import { For, Show, createSignal, onMount, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import type { Club, ClubDetail } from "@praxbit/contracts";
import { api } from "../../platform/services.ts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";

export function ClubScreen(): JSX.Element {
    const learning = useLearning();
    const [clubs, setClubs] = createSignal<readonly Club[]>([]);
    const [detail, setDetail] = createSignal<ClubDetail | undefined>(undefined);
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal("");
    const [clubName, setClubName] = createSignal("");
    const [inviteCode, setInviteCode] = createSignal("");
    const [answers, setAnswers] = createSignal<Readonly<Record<string, string>>>({});
    const [submissionMessage, setSubmissionMessage] = createSignal("");

    async function refresh(): Promise<void> {
        if (learning.user() === undefined) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            const list = await api.listClubs();
            setClubs(list);
            const current = detail();
            if (current !== undefined) {
                setDetail(await api.getClub(current.club.id));
            } else if (list[0] !== undefined) {
                setDetail(await api.getClub(list[0].id));
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Clubs could not be loaded.");
        } finally {
            setLoading(false);
        }
    }

    async function createClub(): Promise<void> {
        setError("");
        try {
            const club = await api.createClub({ name: clubName().trim() });
            setClubName("");
            await refresh();
            setDetail(await api.getClub(club.id));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The club could not be created.");
        }
    }

    async function joinByCode(): Promise<void> {
        setError("");
        try {
            const club = await api.joinClubByCode({ inviteCode: inviteCode().trim() });
            setInviteCode("");
            await refresh();
            setDetail(await api.getClub(club.id));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The club could not be joined.");
        }
    }

    async function openClub(clubId: string): Promise<void> {
        setError("");
        try {
            setDetail(await api.getClub(clubId));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The club could not be opened.");
        }
    }

    async function submitEvent(eventId: string): Promise<void> {
        const answer = answers()[eventId];
        if (answer === undefined) {
            return;
        }
        setSubmissionMessage("");
        try {
            const response = await api.submitEvent(eventId, { eventId, answer });
            setSubmissionMessage(
                response.verified
                    ? `Verified. ${response.points} points recorded.`
                    : "That answer was not verified. Read the incident again and retry.",
            );
            const current = detail();
            if (current !== undefined) {
                setDetail(await api.getClub(current.club.id));
            }
        } catch (caught) {
            setSubmissionMessage(
                caught instanceof Error ? caught.message : "The submission could not be verified.",
            );
        }
    }

    onMount(function load(): void {
        void refresh();
    });

    return (
        <main class="page page--narrow">
            <div class="page-header">
                <div class="page-header__text">
                    <h1>Club</h1>
                    <p class="lede">
                        Work through a weekly incident with a small team. Clubs are
                        invitation-based, have no public chat, and show only verified submissions on
                        the leaderboard.
                    </p>
                </div>
                <Pip pose="explaining" size={78} />
            </div>

            <Show
                when={learning.user() !== undefined}
                fallback={
                    <div class="surface stack">
                        <h2>Clubs need an account</h2>
                        <p>
                            Club membership, invitations, and verified results require an account so
                            the server can authorize members and record evidence. Your guest
                            progress can be uploaded when you create one.
                        </p>
                        <div class="row">
                            <A class="button" href="/settings">
                                Create an account or sign in
                            </A>
                            <A class="button button--secondary" href="/learn">
                                Keep learning as a guest
                            </A>
                        </div>
                    </div>
                }
            >
                <div class="stack stack--wide">
                    <Show when={error().length > 0}>
                        <p class="notice notice--error">{error()}</p>
                    </Show>

                    <div class="grid grid--two">
                        <div class="surface stack stack--tight">
                            <h2>Create a club</h2>
                            <label class="field">
                                <span>Club name</span>
                                <input
                                    class="input"
                                    value={clubName()}
                                    maxlength={60}
                                    onInput={function change(event): void {
                                        setClubName(event.currentTarget.value);
                                    }}
                                />
                            </label>
                            <button
                                type="button"
                                class="button"
                                disabled={clubName().trim().length < 2}
                                onClick={function create(): void {
                                    void createClub();
                                }}
                            >
                                Create club
                            </button>
                        </div>
                        <div class="surface stack stack--tight">
                            <h2>Join with an invite code</h2>
                            <label class="field">
                                <span>Invite code</span>
                                <input
                                    class="input mono"
                                    value={inviteCode()}
                                    autocomplete="off"
                                    onInput={function change(event): void {
                                        setInviteCode(event.currentTarget.value);
                                    }}
                                />
                            </label>
                            <button
                                type="button"
                                class="button"
                                disabled={inviteCode().trim().length < 6}
                                onClick={function join(): void {
                                    void joinByCode();
                                }}
                            >
                                Join club
                            </button>
                        </div>
                    </div>

                    <section class="surface stack" aria-labelledby="club-list-heading">
                        <h2 id="club-list-heading">Your clubs</h2>
                        <Show
                            when={clubs().length > 0}
                            fallback={
                                <p class="muted">
                                    No memberships yet. Create a club or use an invite code.
                                </p>
                            }
                        >
                            <div class="row">
                                <For each={clubs()}>
                                    {function club(item): JSX.Element {
                                        return (
                                            <button
                                                type="button"
                                                class="button button--secondary"
                                                onClick={function open(): void {
                                                    void openClub(item.id);
                                                }}
                                            >
                                                {item.name}
                                            </button>
                                        );
                                    }}
                                </For>
                            </div>
                        </Show>
                        <p class="meta">{loading() ? "Loading clubs" : ""}</p>
                    </section>

                    <Show when={detail()}>
                        {function clubDetail(current): JSX.Element {
                            return (
                                <div class="stack stack--wide">
                                    <section class="surface stack">
                                        <div class="surface__header">
                                            <div>
                                                <h2>{current()?.club.name}</h2>
                                                <p class="meta">
                                                    {current()?.club.memberCount} members · role{" "}
                                                    {current()?.club.role}
                                                </p>
                                            </div>
                                            <Show when={current()?.club.inviteCode !== undefined}>
                                                <span class="meta">
                                                    Invite code:{" "}
                                                    <code class="inline-code">
                                                        {current()?.club.inviteCode}
                                                    </code>
                                                </span>
                                            </Show>
                                        </div>
                                        <div class="stack stack--tight">
                                            <h3>Members</h3>
                                            <ul class="stack stack--tight">
                                                <For each={current()?.members ?? []}>
                                                    {function member(item): JSX.Element {
                                                        return (
                                                            <li class="row row--between">
                                                                <span>{item.displayName}</span>
                                                                <span class="meta">
                                                                    {item.role}
                                                                </span>
                                                            </li>
                                                        );
                                                    }}
                                                </For>
                                            </ul>
                                        </div>
                                    </section>

                                    <section
                                        class="surface stack"
                                        aria-labelledby="club-events-heading"
                                    >
                                        <h2 id="club-events-heading">
                                            Weekly engineering incidents
                                        </h2>
                                        <For each={current()?.events ?? []}>
                                            {function event(item): JSX.Element {
                                                return (
                                                    <div class="stack stack--tight">
                                                        <h3>{item.title}</h3>
                                                        <p class="small">{item.summary}</p>
                                                        <For each={item.options}>
                                                            {function option(choice): JSX.Element {
                                                                return (
                                                                    <label class="choice">
                                                                        <input
                                                                            type="radio"
                                                                            name={`event-${item.id}`}
                                                                            checked={
                                                                                answers()[
                                                                                    item.id
                                                                                ] === choice.id
                                                                            }
                                                                            onChange={function choose(): void {
                                                                                setAnswers(
                                                                                    function update(
                                                                                        currentAnswers,
                                                                                    ): Readonly<
                                                                                        Record<
                                                                                            string,
                                                                                            string
                                                                                        >
                                                                                    > {
                                                                                        return {
                                                                                            ...currentAnswers,
                                                                                            [item.id]:
                                                                                                choice.id,
                                                                                        };
                                                                                    },
                                                                                );
                                                                            }}
                                                                        />
                                                                        <span class="choice__text">
                                                                            {choice.label}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            }}
                                                        </For>
                                                        <div class="row">
                                                            <button
                                                                type="button"
                                                                class="button button--small"
                                                                disabled={
                                                                    answers()[item.id] === undefined
                                                                }
                                                                onClick={function submit(): void {
                                                                    void submitEvent(item.id);
                                                                }}
                                                            >
                                                                Submit verified answer
                                                            </button>
                                                            <span class="meta">
                                                                {item.points} points
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        </For>
                                        <Show when={submissionMessage().length > 0}>
                                            <p class="feedback feedback--info">
                                                {submissionMessage()}
                                            </p>
                                        </Show>
                                    </section>

                                    <section
                                        class="surface stack"
                                        aria-labelledby="leaderboard-heading"
                                    >
                                        <h2 id="leaderboard-heading">Verified leaderboard</h2>
                                        <Show
                                            when={(current()?.leaderboard.length ?? 0) > 0}
                                            fallback={
                                                <p class="muted">No verified submissions yet.</p>
                                            }
                                        >
                                            <table class="data-table">
                                                <thead>
                                                    <tr>
                                                        <th scope="col">Member</th>
                                                        <th scope="col">Points</th>
                                                        <th scope="col">Verified</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <For each={current()?.leaderboard ?? []}>
                                                        {function entry(item): JSX.Element {
                                                            return (
                                                                <tr>
                                                                    <td>{item.displayName}</td>
                                                                    <td>{item.points}</td>
                                                                    <td class="meta">
                                                                        {new Date(
                                                                            item.verifiedAt,
                                                                        ).toLocaleString()}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        }}
                                                    </For>
                                                </tbody>
                                            </table>
                                        </Show>
                                    </section>
                                </div>
                            );
                        }}
                    </Show>
                </div>
            </Show>
        </main>
    );
}
