import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import type { Club, ClubDetail, ClubInvite } from "@praxbit/contracts";
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
    const [invites, setInvites] = createSignal<readonly ClubInvite[]>([]);
    const [invitesLoading, setInvitesLoading] = createSignal(false);
    const [inviteError, setInviteError] = createSignal("");
    const [inviteMaxUses, setInviteMaxUses] = createSignal("5");
    const [inviteExpiryHours, setInviteExpiryHours] = createSignal("24");
    const [inviteCreating, setInviteCreating] = createSignal(false);
    const [revokingInviteId, setRevokingInviteId] = createSignal("");
    const [memberActionHandle, setMemberActionHandle] = createSignal("");
    const [memberError, setMemberError] = createSignal("");
    const [reportTargetType, setReportTargetType] = createSignal<"club" | "member" | "event">(
        "club",
    );
    const [reportTargetHandle, setReportTargetHandle] = createSignal("");
    const [reportTargetEventId, setReportTargetEventId] = createSignal("");
    const [reportReason, setReportReason] = createSignal("");
    const [reportDetails, setReportDetails] = createSignal("");
    const [reportStatus, setReportStatus] = createSignal("");
    const [reportTone, setReportTone] = createSignal<SubmissionTone>("info");
    const [reportSubmitting, setReportSubmitting] = createSignal(false);

    const ownerCount = createMemo(function owners(): number {
        return (detail()?.members ?? []).filter(function owner(item): boolean {
            return item.role === "owner";
        }).length;
    });

    async function loadInvites(clubId: string): Promise<void> {
        setInvitesLoading(true);
        setInviteError("");
        try {
            const response = await api.listInvites(clubId);
            setInvites(response.invites);
        } catch (caught) {
            setInvites([]);
            setInviteError(
                caught instanceof Error ? caught.message : "Invites could not be loaded.",
            );
        } finally {
            setInvitesLoading(false);
        }
    }

    async function showDetail(clubId: string): Promise<ClubDetail> {
        const next = await api.getClub(clubId);
        setDetail(next);
        setMemberError("");
        if (next.club.role === "owner") {
            await loadInvites(next.club.id);
        } else {
            setInvites([]);
            setInviteError("");
        }
        return next;
    }

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
                await showDetail(current.club.id);
            } else if (list[0] !== undefined) {
                await showDetail(list[0].id);
            } else {
                setDetail(undefined);
                setInvites([]);
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
                await showDetail(club.id);
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
                await showDetail(club.id);
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
            await showDetail(clubId);
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
                    await showDetail(current.club.id);
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

    async function changeMemberRole(handle: string, role: "owner" | "member"): Promise<void> {
        const current = detail();
        if (current === undefined || memberActionHandle().length > 0) {
            return;
        }
        setMemberError("");
        setMemberActionHandle(handle);
        try {
            await api.updateMemberRole(current.club.id, handle, role);
            await showDetail(current.club.id);
        } catch (caught) {
            setMemberError(
                caught instanceof Error ? caught.message : "The member role could not be changed.",
            );
        } finally {
            setMemberActionHandle("");
        }
    }

    async function removeMember(handle: string): Promise<void> {
        const current = detail();
        if (current === undefined || memberActionHandle().length > 0) {
            return;
        }
        setMemberError("");
        setMemberActionHandle(handle);
        try {
            await api.removeMember(current.club.id, handle);
            await refresh();
        } catch (caught) {
            setMemberError(
                caught instanceof Error ? caught.message : "The member could not be removed.",
            );
        } finally {
            setMemberActionHandle("");
        }
    }

    async function createInvite(): Promise<void> {
        const current = detail();
        const maxUses = Number.parseInt(inviteMaxUses(), 10);
        const expiresInHours = Number.parseInt(inviteExpiryHours(), 10);
        if (
            current === undefined ||
            inviteCreating() ||
            !Number.isInteger(maxUses) ||
            maxUses < 1 ||
            maxUses > 100 ||
            !Number.isInteger(expiresInHours) ||
            expiresInHours < 1 ||
            expiresInHours > 720
        ) {
            return;
        }
        setInviteError("");
        setInviteCreating(true);
        try {
            const invite = await api.createInvite(current.club.id, { maxUses, expiresInHours });
            setInvites(function prepend(items): readonly ClubInvite[] {
                return [invite, ...items];
            });
        } catch (caught) {
            setInviteError(
                caught instanceof Error ? caught.message : "The invite could not be created.",
            );
        } finally {
            setInviteCreating(false);
        }
    }

    async function revokeInvite(inviteId: string): Promise<void> {
        const current = detail();
        if (current === undefined || revokingInviteId().length > 0) {
            return;
        }
        setInviteError("");
        setRevokingInviteId(inviteId);
        try {
            await api.revokeInvite(current.club.id, inviteId);
            setInvites(function markRevoked(items): readonly ClubInvite[] {
                return items.map(function revoked(item): ClubInvite {
                    if (item.id !== inviteId) {
                        return item;
                    }
                    return { ...item, revokedAt: new Date().toISOString() };
                });
            });
        } catch (caught) {
            setInviteError(
                caught instanceof Error ? caught.message : "The invite could not be revoked.",
            );
        } finally {
            setRevokingInviteId("");
        }
    }

    async function submitReport(): Promise<void> {
        const current = detail();
        if (current === undefined || reportSubmitting()) {
            return;
        }
        const reason = reportReason().trim();
        const details = reportDetails().trim();
        if (reason.length < 5) {
            setReportTone("error");
            setReportStatus("Describe the problem in at least five characters.");
            return;
        }
        if (details.length > 0 && details.length < 5) {
            setReportTone("error");
            setReportStatus("Details need at least five characters, or leave them empty.");
            return;
        }
        if (reportTargetType() === "member" && reportTargetHandle().length === 0) {
            setReportTone("error");
            setReportStatus("Choose the member you are reporting.");
            return;
        }
        if (reportTargetType() === "event" && reportTargetEventId().length === 0) {
            setReportTone("error");
            setReportStatus("Choose the event you are reporting.");
            return;
        }
        setReportStatus("");
        setReportSubmitting(true);
        try {
            await api.reportClub(current.club.id, {
                reason,
                ...(details.length === 0 ? {} : { details }),
                targetType: reportTargetType(),
                ...(reportTargetType() === "member" ? { targetHandle: reportTargetHandle() } : {}),
                ...(reportTargetType() === "event" ? { targetEventId: reportTargetEventId() } : {}),
            });
            setReportTone("success");
            setReportStatus("Report filed. An administrator can review it.");
            setReportReason("");
            setReportDetails("");
            setReportTargetHandle("");
            setReportTargetEventId("");
        } catch (caught) {
            setReportTone("error");
            setReportStatus(
                caught instanceof Error ? caught.message : "The report could not be filed.",
            );
        } finally {
            setReportSubmitting(false);
        }
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
                                                        Legacy invite code (never expires):{" "}
                                                        <code class="inline-code">
                                                            {current()?.club.inviteCode}
                                                        </code>
                                                    </span>
                                                </Show>
                                            </div>
                                            <div class="stack stack--tight">
                                                <h3>Members</h3>
                                                <Show when={memberError().length > 0}>
                                                    <p
                                                        class="feedback feedback--error"
                                                        role="alert"
                                                    >
                                                        {memberError()}
                                                    </p>
                                                </Show>
                                                <Show
                                                    when={(current()?.members.length ?? 0) > 0}
                                                    fallback={
                                                        <p class="muted">
                                                            No members are listed for this club.
                                                        </p>
                                                    }
                                                >
                                                    <ul class="club-member-list stack stack--tight">
                                                        <For each={current()?.members ?? []}>
                                                            {function member(item): JSX.Element {
                                                                const isOwner =
                                                                    current()?.club.role ===
                                                                    "owner";
                                                                const isLastOwner =
                                                                    item.role === "owner" &&
                                                                    ownerCount() <= 1;
                                                                const busy =
                                                                    memberActionHandle() ===
                                                                    item.handle;
                                                                return (
                                                                    <li class="club-member">
                                                                        <div class="row row--between">
                                                                            <span>
                                                                                {item.displayName}{" "}
                                                                                <span class="meta mono">
                                                                                    @{item.handle}
                                                                                </span>
                                                                            </span>
                                                                            <span class="meta">
                                                                                {roleLabel(
                                                                                    item.role,
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                        <Show when={isOwner}>
                                                                            <div class="club-member__actions">
                                                                                <Show
                                                                                    when={
                                                                                        item.role ===
                                                                                        "member"
                                                                                    }
                                                                                    fallback={
                                                                                        <button
                                                                                            type="button"
                                                                                            class="button button--secondary button--small"
                                                                                            disabled={
                                                                                                busy ||
                                                                                                isLastOwner
                                                                                            }
                                                                                            aria-label={`Demote ${item.displayName} to member`}
                                                                                            aria-describedby={
                                                                                                isLastOwner
                                                                                                    ? "club-last-owner-hint"
                                                                                                    : undefined
                                                                                            }
                                                                                            onClick={function demote(): void {
                                                                                                void changeMemberRole(
                                                                                                    item.handle,
                                                                                                    "member",
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            Demote
                                                                                        </button>
                                                                                    }
                                                                                >
                                                                                    <button
                                                                                        type="button"
                                                                                        class="button button--secondary button--small"
                                                                                        disabled={
                                                                                            busy
                                                                                        }
                                                                                        aria-label={`Promote ${item.displayName} to owner`}
                                                                                        onClick={function promote(): void {
                                                                                            void changeMemberRole(
                                                                                                item.handle,
                                                                                                "owner",
                                                                                            );
                                                                                        }}
                                                                                    >
                                                                                        Promote
                                                                                    </button>
                                                                                </Show>
                                                                                <button
                                                                                    type="button"
                                                                                    class="button button--danger button--small"
                                                                                    disabled={
                                                                                        busy ||
                                                                                        isLastOwner
                                                                                    }
                                                                                    aria-label={`Remove ${item.displayName} from the club`}
                                                                                    onClick={function remove(): void {
                                                                                        void removeMember(
                                                                                            item.handle,
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    Remove
                                                                                </button>
                                                                            </div>
                                                                        </Show>
                                                                    </li>
                                                                );
                                                            }}
                                                        </For>
                                                    </ul>
                                                    <p class="meta" id="club-last-owner-hint">
                                                        A club always keeps at least one owner.
                                                        Promote another member before demoting or
                                                        removing the last owner.
                                                    </p>
                                                </Show>
                                            </div>
                                            <Show when={current()?.club.role === "owner"}>
                                                <div class="stack stack--tight">
                                                    <h3>Controlled invites</h3>
                                                    <p class="meta">
                                                        Each invite expires and stops working after
                                                        its use limit. Revoke one to block it
                                                        immediately.
                                                    </p>
                                                    <form
                                                        class="club-invite-form"
                                                        onSubmit={function submitInvite(
                                                            event,
                                                        ): void {
                                                            event.preventDefault();
                                                            void createInvite();
                                                        }}
                                                    >
                                                        <label class="field">
                                                            <span>Maximum uses</span>
                                                            <input
                                                                class="input"
                                                                type="number"
                                                                min="1"
                                                                max="100"
                                                                value={inviteMaxUses()}
                                                                onInput={function change(
                                                                    event,
                                                                ): void {
                                                                    setInviteMaxUses(
                                                                        event.currentTarget.value,
                                                                    );
                                                                }}
                                                            />
                                                        </label>
                                                        <label class="field">
                                                            <span>Expires in hours</span>
                                                            <input
                                                                class="input"
                                                                type="number"
                                                                min="1"
                                                                max="720"
                                                                value={inviteExpiryHours()}
                                                                onInput={function change(
                                                                    event,
                                                                ): void {
                                                                    setInviteExpiryHours(
                                                                        event.currentTarget.value,
                                                                    );
                                                                }}
                                                            />
                                                        </label>
                                                        <button
                                                            type="submit"
                                                            class="button"
                                                            disabled={inviteCreating()}
                                                        >
                                                            {inviteCreating()
                                                                ? "Creating invite…"
                                                                : "Create invite"}
                                                        </button>
                                                    </form>
                                                    <Show when={inviteError().length > 0}>
                                                        <p
                                                            class="feedback feedback--error"
                                                            role="alert"
                                                        >
                                                            {inviteError()}
                                                        </p>
                                                    </Show>
                                                    <Show
                                                        when={!invitesLoading()}
                                                        fallback={
                                                            <p
                                                                class="feedback feedback--info"
                                                                role="status"
                                                            >
                                                                Loading invites…
                                                            </p>
                                                        }
                                                    >
                                                        <Show
                                                            when={invites().length > 0}
                                                            fallback={
                                                                <p class="muted">
                                                                    No controlled invites yet.
                                                                    Create one when you need a
                                                                    temporary code.
                                                                </p>
                                                            }
                                                        >
                                                            <ul class="club-invite-list stack stack--tight">
                                                                <For each={invites()}>
                                                                    {function invite(
                                                                        entry,
                                                                    ): JSX.Element {
                                                                        const expired =
                                                                            Date.parse(
                                                                                entry.expiresAt,
                                                                            ) <= Date.now();
                                                                        const exhausted =
                                                                            entry.usedCount >=
                                                                            entry.maxUses;
                                                                        const inactive =
                                                                            entry.revokedAt !==
                                                                                undefined ||
                                                                            expired ||
                                                                            exhausted;
                                                                        return (
                                                                            <li class="club-invite">
                                                                                <div class="row row--between">
                                                                                    <code class="inline-code">
                                                                                        {entry.code}
                                                                                    </code>
                                                                                    <span class="meta">
                                                                                        {
                                                                                            entry.usedCount
                                                                                        }{" "}
                                                                                        of{" "}
                                                                                        {
                                                                                            entry.maxUses
                                                                                        }{" "}
                                                                                        uses
                                                                                    </span>
                                                                                </div>
                                                                                <div class="row row--between">
                                                                                    <span class="meta">
                                                                                        Expires{" "}
                                                                                        {new Date(
                                                                                            entry.expiresAt,
                                                                                        ).toLocaleString()}
                                                                                    </span>
                                                                                    <Show
                                                                                        when={
                                                                                            !inactive
                                                                                        }
                                                                                        fallback={
                                                                                            <span class="meta">
                                                                                                {entry.revokedAt !==
                                                                                                undefined
                                                                                                    ? "Revoked"
                                                                                                    : exhausted
                                                                                                      ? "Used up"
                                                                                                      : "Expired"}
                                                                                            </span>
                                                                                        }
                                                                                    >
                                                                                        <button
                                                                                            type="button"
                                                                                            class="button button--secondary button--small"
                                                                                            disabled={
                                                                                                revokingInviteId() ===
                                                                                                entry.id
                                                                                            }
                                                                                            aria-label={`Revoke invite ${entry.code}`}
                                                                                            onClick={function revoke(): void {
                                                                                                void revokeInvite(
                                                                                                    entry.id,
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            {revokingInviteId() ===
                                                                                            entry.id
                                                                                                ? "Revoking…"
                                                                                                : "Revoke"}
                                                                                        </button>
                                                                                    </Show>
                                                                                </div>
                                                                            </li>
                                                                        );
                                                                    }}
                                                                </For>
                                                            </ul>
                                                        </Show>
                                                    </Show>
                                                </div>
                                            </Show>
                                        </section>

                                        <section
                                            class="surface stack"
                                            aria-labelledby="club-events-heading"
                                        >
                                            <h2 id="club-events-heading">
                                                Weekly engineering incidents
                                            </h2>
                                            <p class="meta">
                                                Active week of {current()?.week.activeWeekOf}. Only
                                                that week's event accepts answers. Past events stay
                                                readable and closed.
                                            </p>
                                            <Show when={current()?.cooperativeChallenge}>
                                                {function challenge(value): JSX.Element {
                                                    const progress = value();
                                                    return (
                                                        <div
                                                            class="club-challenge"
                                                            role="status"
                                                            aria-live="polite"
                                                        >
                                                            <h3>{progress.title}</h3>
                                                            <p class="small">
                                                                {progress.description}
                                                            </p>
                                                            <progress
                                                                class="club-progress"
                                                                value={progress.verifiedMembers}
                                                                max={progress.requiredMembers}
                                                                aria-label={`Cooperative challenge progress: ${String(progress.verifiedMembers)} of ${String(progress.requiredMembers)} members verified`}
                                                            >
                                                                {progress.verifiedMembers} of{" "}
                                                                {progress.requiredMembers}
                                                            </progress>
                                                            <p class="meta">
                                                                {progress.verifiedMembers} of{" "}
                                                                {progress.requiredMembers} members
                                                                have a verified submission
                                                                {progress.completed
                                                                    ? ". Challenge complete."
                                                                    : "."}
                                                            </p>
                                                            <Show
                                                                when={
                                                                    progress.participants.length > 0
                                                                }
                                                            >
                                                                <p class="meta">
                                                                    Verified participants:{" "}
                                                                    {progress.participants.join(
                                                                        ", ",
                                                                    )}
                                                                </p>
                                                            </Show>
                                                        </div>
                                                    );
                                                }}
                                            </Show>
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
                                                            <div class="stack stack--tight club-event">
                                                                <div class="club-event__header">
                                                                    <h3>{item.title}</h3>
                                                                    <span
                                                                        class={
                                                                            item.participationOpen
                                                                                ? "status status--success"
                                                                                : "status"
                                                                        }
                                                                    >
                                                                        <span
                                                                            class="status__mark"
                                                                            aria-hidden="true"
                                                                        />
                                                                        {item.participationOpen
                                                                            ? "Open for answers"
                                                                            : "Closed"}
                                                                    </span>
                                                                </div>
                                                                <p class="meta">
                                                                    Week of {item.weekOf}
                                                                </p>
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
                                                                                points.
                                                                                {item.participationOpen
                                                                                    ? " Submitting again replaces it."
                                                                                    : ""}
                                                                            </p>
                                                                        );
                                                                    }}
                                                                </Show>
                                                                <Show
                                                                    when={item.participationOpen}
                                                                    fallback={
                                                                        <p class="meta">
                                                                            This past event is
                                                                            closed for new answers.
                                                                        </p>
                                                                    }
                                                                >
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
                                                                                answers()[
                                                                                    item.id
                                                                                ] === undefined ||
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
                                                                </Show>
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

                                        <section
                                            class="surface stack"
                                            aria-labelledby="club-report-heading"
                                        >
                                            <h2 id="club-report-heading">Report a concern</h2>
                                            <p class="meta">
                                                Reports go to administrators. Only file a report for
                                                a specific member, event, or club problem.
                                            </p>
                                            <form
                                                class="stack stack--tight"
                                                onSubmit={function submitReportForm(event): void {
                                                    event.preventDefault();
                                                    void submitReport();
                                                }}
                                            >
                                                <label class="field">
                                                    <span>What are you reporting?</span>
                                                    <select
                                                        class="select"
                                                        value={reportTargetType()}
                                                        onChange={function change(event): void {
                                                            setReportTargetType(
                                                                event.currentTarget.value as
                                                                    | "club"
                                                                    | "member"
                                                                    | "event",
                                                            );
                                                            setReportStatus("");
                                                            setReportTargetHandle("");
                                                            setReportTargetEventId("");
                                                        }}
                                                    >
                                                        <option value="club">
                                                            The club in general
                                                        </option>
                                                        <option value="member">
                                                            A club member
                                                        </option>
                                                        <option value="event">A club event</option>
                                                    </select>
                                                </label>
                                                <Show when={reportTargetType() === "member"}>
                                                    <label class="field">
                                                        <span>Member</span>
                                                        <select
                                                            class="select"
                                                            value={reportTargetHandle()}
                                                            onChange={function change(event): void {
                                                                setReportTargetHandle(
                                                                    event.currentTarget.value,
                                                                );
                                                            }}
                                                        >
                                                            <option value="">
                                                                Choose a member
                                                            </option>
                                                            <For each={current()?.members ?? []}>
                                                                {function member(
                                                                    item,
                                                                ): JSX.Element {
                                                                    return (
                                                                        <option value={item.handle}>
                                                                            {item.displayName} (@
                                                                            {item.handle})
                                                                        </option>
                                                                    );
                                                                }}
                                                            </For>
                                                        </select>
                                                    </label>
                                                </Show>
                                                <Show when={reportTargetType() === "event"}>
                                                    <label class="field">
                                                        <span>Event</span>
                                                        <select
                                                            class="select"
                                                            value={reportTargetEventId()}
                                                            onChange={function change(event): void {
                                                                setReportTargetEventId(
                                                                    event.currentTarget.value,
                                                                );
                                                            }}
                                                        >
                                                            <option value="">
                                                                Choose an event
                                                            </option>
                                                            <For each={current()?.events ?? []}>
                                                                {function event(item): JSX.Element {
                                                                    return (
                                                                        <option value={item.id}>
                                                                            {item.title} (week of{" "}
                                                                            {item.weekOf})
                                                                        </option>
                                                                    );
                                                                }}
                                                            </For>
                                                        </select>
                                                    </label>
                                                </Show>
                                                <label class="field">
                                                    <span>Reason</span>
                                                    <input
                                                        class="input"
                                                        maxlength={500}
                                                        value={reportReason()}
                                                        aria-describedby="club-report-reason-hint"
                                                        onInput={function change(event): void {
                                                            setReportReason(
                                                                event.currentTarget.value,
                                                            );
                                                            setReportStatus("");
                                                        }}
                                                    />
                                                    <span class="meta" id="club-report-reason-hint">
                                                        5-500 characters.
                                                    </span>
                                                </label>
                                                <label class="field">
                                                    <span>Details (optional)</span>
                                                    <textarea
                                                        class="textarea"
                                                        maxlength={1000}
                                                        value={reportDetails()}
                                                        aria-describedby="club-report-details-hint"
                                                        onInput={function change(event): void {
                                                            setReportDetails(
                                                                event.currentTarget.value,
                                                            );
                                                            setReportStatus("");
                                                        }}
                                                    />
                                                    <span
                                                        class="meta"
                                                        id="club-report-details-hint"
                                                    >
                                                        Add context an administrator needs.
                                                    </span>
                                                </label>
                                                <div class="row">
                                                    <button
                                                        type="submit"
                                                        class="button"
                                                        disabled={
                                                            reportSubmitting() ||
                                                            reportReason().trim().length < 5
                                                        }
                                                    >
                                                        {reportSubmitting()
                                                            ? "Filing report…"
                                                            : "File report"}
                                                    </button>
                                                </div>
                                            </form>
                                            <Show when={reportStatus().length > 0}>
                                                <p
                                                    class={`feedback ${
                                                        reportTone() === "success"
                                                            ? "feedback--success"
                                                            : reportTone() === "error"
                                                              ? "feedback--error"
                                                              : "feedback--info"
                                                    }`}
                                                    role={
                                                        reportTone() === "error"
                                                            ? "alert"
                                                            : "status"
                                                    }
                                                >
                                                    {reportStatus()}
                                                </p>
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
