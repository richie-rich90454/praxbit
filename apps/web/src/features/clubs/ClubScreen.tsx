import { For, Show, createEffect, createSignal, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import type { Club, ClubDetail } from "@praxbit/contracts";
import { api } from "../../platform/services.ts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";
import "./clubs.css";

type SubmissionTone = "info" | "success" | "error";

function roleLabel(role: "owner" | "member" | undefined): string {
    return role === "owner" ? "Owner" : "Member";
}

export function ClubScreen(): JSX.Element {
    const learning = useLearning();
    const [clubs, setClubs] = createSignal<readonly Club[]>([]);
    const [detail, setDetail] = createSignal<ClubDetail | undefined>(undefined);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal("");
    const [clubName, setClubName] = createSignal("");
    const [inviteCode, setInviteCode] = createSignal("");
    const [createError, setCreateError] = createSignal("");
    const [joinError, setJoinError] = createSignal("");
    const [creating, setCreating] = createSignal(false);
    const [joining, setJoining] = createSignal(false);
    const [openingClubId, setOpeningClubId] = createSignal<string | undefined>(undefined);
    const [answers, setAnswers] = createSignal<Readonly<Record<string, string>>>({});
    const [submissionMessage, setSubmissionMessage] = createSignal("");
    const [submissionEventId, setSubmissionEventId] = createSignal("");
    const [submissionTone, setSubmissionTone] = createSignal<SubmissionTone>("info");
    const [submittingEventId, setSubmittingEventId] = createSignal("");

    async function refresh(): Promise<void> {
        if (learning.user() === undefined) {
            setLoading(false);
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
        if (clubName().trim().length < 2 || creating()) {
            return;
        }
        setCreateError("");
        setCreating(true);
        try {
            let club: Club;
            try {
                club = await api.createClub({ name: clubName().trim() });
            } catch (caught) {
                setCreateError(
                    caught instanceof Error ? caught.message : "The club could not be created.",
                );
                return;
            }
            setClubName("");
            await refresh();
            try {
                setDetail(await api.getClub(club.id));
            } catch {
                setError(
                    "The club was created, but its details could not be opened. Select it under Your clubs to try again.",
                );
            }
        } finally {
            setCreating(false);
        }
    }

    async function joinByCode(): Promise<void> {
        if (inviteCode().trim().length < 6 || joining()) {
            return;
        }
        setJoinError("");
        setJoining(true);
        try {
            let club: Club;
            try {
                club = await api.joinClubByCode({ inviteCode: inviteCode().trim() });
            } catch (caught) {
                setJoinError(
                    caught instanceof Error ? caught.message : "The club could not be joined.",
                );
                return;
            }
            setInviteCode("");
            await refresh();
            try {
                setDetail(await api.getClub(club.id));
            } catch {
                setError(
                    "You joined the club, but its details could not be opened. Select it under Your clubs to try again.",
                );
            }
        } finally {
            setJoining(false);
        }
    }

    async function openClub(clubId: string): Promise<void> {
        setError("");
        setOpeningClubId(clubId);
        setSubmissionMessage("");
        setSubmissionEventId("");
        try {
            setDetail(await api.getClub(clubId));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The club could not be opened.");
        } finally {
            setOpeningClubId(undefined);
        }
    }

    async function submitEvent(eventId: string): Promise<void> {
        const answer = answers()[eventId];
        if (answer === undefined || submittingEventId().length > 0) {
            return;
        }
        setSubmissionMessage("");
        setSubmissionEventId(eventId);
        setSubmittingEventId(eventId);
        setSubmissionTone("info");
        try {
            let response: { readonly verified: boolean; readonly points: number };
            try {
                response = await api.submitEvent(eventId, { eventId, answer });
            } catch (caught) {
                setSubmissionTone("error");
                setSubmissionMessage(
                    caught instanceof Error
                        ? caught.message
                        : "The submission could not be verified. Try again.",
                );
                return;
            }
            setSubmissionTone(response.verified ? "success" : "error");
            setSubmissionMessage(
                response.verified
                    ? `Verified. ${response.points} points recorded.`
                    : "That answer was not verified. Read the incident again and retry.",
            );
            const current = detail();
            if (current !== undefined) {
                try {
                    setDetail(await api.getClub(current.club.id));
                } catch {
                    setError(
                        "Your answer was submitted, but the latest club totals could not be loaded. Your result is shown above.",
                    );
                }
            }
        } finally {
            setSubmittingEventId("");
        }
    }

    function verifiedSubmission(eventId: string) {
        return detail()?.submissions.find(function match(item): boolean {
            return item.eventId === eventId;
        });
    }

    let loadedUserId: string | undefined;
    createEffect(function loadClubsForUser(): void {
        if (!learning.ready()) {
            return;
        }
        const user = learning.user();
        if (user === undefined) {
            loadedUserId = undefined;
            setClubs([]);
            setDetail(undefined);
            setLoading(false);
            return;
        }
        if (loadedUserId === user.id) {
            return;
        }
        loadedUserId = user.id;
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
                when={learning.ready()}
                fallback={
                    <p class="feedback feedback--info" role="status">
                        Checking your account…
                    </p>
                }
            >
                <Show
                    when={learning.user() !== undefined}
                    fallback={
                        <div class="surface stack">
                            <h2>Clubs need an account</h2>
                            <p>
                                Club membership, invitations, and verified results require an
                                account so the server can authorize members and record evidence.
                                Your guest progress can be uploaded when you create one.
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
                            <div class="notice notice--error stack stack--tight" role="alert">
                                <p>{error()}</p>
                                <div class="row">
                                    <button
                                        type="button"
                                        class="button button--secondary button--small"
                                        disabled={loading()}
                                        onClick={function retry(): void {
                                            void refresh();
                                        }}
                                    >
                                        {loading() ? "Retrying…" : "Try again"}
                                    </button>
                                </div>
                            </div>
                        </Show>

                        <div class="grid grid--two">
                            <form
                                class="surface stack stack--tight"
                                onSubmit={function submit(event): void {
                                    event.preventDefault();
                                    void createClub();
                                }}
                            >
                                <h2>Create a club</h2>
                                <p class="meta">
                                    You become the owner. Share the invite code after creation to
                                    add teammates.
                                </p>
                                <label class="field">
                                    <span>Club name</span>
                                    <input
                                        class="input"
                                        value={clubName()}
                                        maxlength={60}
                                        aria-describedby="club-name-hint club-name-error"
                                        onInput={function change(event): void {
                                            setClubName(event.currentTarget.value);
                                            setCreateError("");
                                        }}
                                    />
                                    <span class="meta" id="club-name-hint">
                                        2-60 characters.
                                    </span>
                                    <Show when={createError().length > 0}>
                                        <span
                                            class="club-field-error"
                                            id="club-name-error"
                                            role="alert"
                                        >
                                            {createError()}
                                        </span>
                                    </Show>
                                </label>
                                <button
                                    type="submit"
                                    class="button"
                                    disabled={creating() || clubName().trim().length < 2}
                                    aria-describedby="club-name-hint"
                                >
                                    {creating() ? "Creating club…" : "Create club"}
                                </button>
                            </form>
                            <form
                                class="surface stack stack--tight"
                                onSubmit={function submit(event): void {
                                    event.preventDefault();
                                    void joinByCode();
                                }}
                            >
                                <h2>Join with an invite code</h2>
                                <p class="meta">
                                    Use the code the club owner shared with you. Codes are not
                                    public.
                                </p>
                                <label class="field">
                                    <span>Invite code</span>
                                    <input
                                        class="input mono"
                                        value={inviteCode()}
                                        autocomplete="off"
                                        maxlength={24}
                                        aria-describedby="club-code-hint club-code-error"
                                        onInput={function change(event): void {
                                            setInviteCode(event.currentTarget.value);
                                            setJoinError("");
                                        }}
                                    />
                                    <span class="meta" id="club-code-hint">
                                        6-24 characters.
                                    </span>
                                    <Show when={joinError().length > 0}>
                                        <span
                                            class="club-field-error"
                                            id="club-code-error"
                                            role="alert"
                                        >
                                            {joinError()}
                                        </span>
                                    </Show>
                                </label>
                                <button
                                    type="submit"
                                    class="button"
                                    disabled={joining() || inviteCode().trim().length < 6}
                                    aria-describedby="club-code-hint"
                                >
                                    {joining() ? "Joining club…" : "Join club"}
                                </button>
                            </form>
                        </div>

                        <section class="surface stack" aria-labelledby="club-list-heading">
                            <h2 id="club-list-heading">Your clubs</h2>
                            <Show
                                when={!loading()}
                                fallback={
                                    <p class="feedback feedback--info" role="status">
                                        Loading your clubs…
                                    </p>
                                }
                            >
                                <Show
                                    when={clubs().length > 0}
                                    fallback={
                                        <p class="muted">
                                            {error().length > 0
                                                ? "Your club list could not be loaded. Use Try again above to reload it."
                                                : "No memberships yet. Create a club or use an invite code."}
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
                                                        aria-pressed={detail()?.club.id === item.id}
                                                        disabled={openingClubId() === item.id}
                                                        onClick={function open(): void {
                                                            void openClub(item.id);
                                                        }}
                                                    >
                                                        {openingClubId() === item.id
                                                            ? `Opening ${item.name}…`
                                                            : item.name}
                                                    </button>
                                                );
                                            }}
                                        </For>
                                    </div>
                                </Show>
                            </Show>
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
                                                        {current()?.club.memberCount} members · Your
                                                        role: {roleLabel(current()?.club.role)}
                                                    </p>
                                                </div>
                                                <Show
                                                    when={current()?.club.inviteCode !== undefined}
                                                >
                                                    <span class="meta">
                                                        Invite code (share to add members):{" "}
                                                        <code class="inline-code">
                                                            {current()?.club.inviteCode}
                                                        </code>
                                                    </span>
                                                </Show>
                                            </div>
                                            <div class="stack stack--tight">
                                                <h3>Members</h3>
                                                <Show
                                                    when={(current()?.members.length ?? 0) > 0}
                                                    fallback={
                                                        <p class="muted">
                                                            No members are listed for this club.
                                                        </p>
                                                    }
                                                >
                                                    <ul class="stack stack--tight">
                                                        <For each={current()?.members ?? []}>
                                                            {function member(item): JSX.Element {
                                                                return (
                                                                    <li class="row row--between">
                                                                        <span>
                                                                            {item.displayName}
                                                                        </span>
                                                                        <span class="meta">
                                                                            {roleLabel(item.role)}
                                                                        </span>
                                                                    </li>
                                                                );
                                                            }}
                                                        </For>
                                                    </ul>
                                                </Show>
                                            </div>
                                        </section>

                                        <section
                                            class="surface stack"
                                            aria-labelledby="club-events-heading"
                                        >
                                            <h2 id="club-events-heading">
                                                Weekly engineering incidents
                                            </h2>
                                            <Show
                                                when={(current()?.events.length ?? 0) > 0}
                                                fallback={
                                                    <p class="muted">
                                                        No incidents are open for this club right
                                                        now.
                                                    </p>
                                                }
                                            >
                                                <For each={current()?.events ?? []}>
                                                    {function event(item): JSX.Element {
                                                        return (
                                                            <div class="stack stack--tight">
                                                                <h3>{item.title}</h3>
                                                                <p class="small">{item.summary}</p>
                                                                <Show
                                                                    when={verifiedSubmission(
                                                                        item.id,
                                                                    )}
                                                                >
                                                                    {function submission(entry) {
                                                                        return (
                                                                            <p class="status status--success">
                                                                                <span
                                                                                    class="status__mark"
                                                                                    aria-hidden="true"
                                                                                />
                                                                                Verified answer
                                                                                recorded ·{" "}
                                                                                {entry().points}{" "}
                                                                                points. Submitting
                                                                                again replaces it.
                                                                            </p>
                                                                        );
                                                                    }}
                                                                </Show>
                                                                <fieldset class="stack stack--tight">
                                                                    <legend class="meta">
                                                                        Choose one response
                                                                    </legend>
                                                                    <For each={item.options}>
                                                                        {function option(
                                                                            choice,
                                                                        ): JSX.Element {
                                                                            return (
                                                                                <label class="choice">
                                                                                    <input
                                                                                        type="radio"
                                                                                        name={`event-${item.id}`}
                                                                                        checked={
                                                                                            answers()[
                                                                                                item
                                                                                                    .id
                                                                                            ] ===
                                                                                            choice.id
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
                                                                                        {
                                                                                            choice.label
                                                                                        }
                                                                                    </span>
                                                                                </label>
                                                                            );
                                                                        }}
                                                                    </For>
                                                                </fieldset>
                                                                <div class="row">
                                                                    <button
                                                                        type="button"
                                                                        class="button button--small"
                                                                        disabled={
                                                                            answers()[item.id] ===
                                                                                undefined ||
                                                                            submittingEventId()
                                                                                .length > 0
                                                                        }
                                                                        onClick={function submit(): void {
                                                                            void submitEvent(
                                                                                item.id,
                                                                            );
                                                                        }}
                                                                    >
                                                                        {submittingEventId() ===
                                                                        item.id
                                                                            ? "Verifying answer…"
                                                                            : "Submit verified answer"}
                                                                    </button>
                                                                    <span class="meta">
                                                                        {item.points} points
                                                                        available
                                                                    </span>
                                                                </div>
                                                                <Show
                                                                    when={
                                                                        submissionEventId() ===
                                                                            item.id &&
                                                                        submissionMessage().length >
                                                                            0
                                                                    }
                                                                >
                                                                    <p
                                                                        class={`feedback ${
                                                                            submissionTone() ===
                                                                            "success"
                                                                                ? "feedback--success"
                                                                                : submissionTone() ===
                                                                                    "error"
                                                                                  ? "feedback--error"
                                                                                  : "feedback--info"
                                                                        }`}
                                                                        role={
                                                                            submissionTone() ===
                                                                            "error"
                                                                                ? "alert"
                                                                                : "status"
                                                                        }
                                                                    >
                                                                        {submissionMessage()}
                                                                    </p>
                                                                </Show>
                                                            </div>
                                                        );
                                                    }}
                                                </For>
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
                                                    <p class="muted">
                                                        No verified submissions yet. Submit a
                                                        correct incident answer to appear here.
                                                    </p>
                                                }
                                            >
                                                <table class="data-table">
                                                    <caption class="meta">
                                                        Only verified submissions appear.
                                                    </caption>
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
            </Show>
        </main>
    );
}
