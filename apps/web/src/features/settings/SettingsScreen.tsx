import { A, useNavigate } from "@solidjs/router";
import { For, Show, createEffect, createSignal, type JSX } from "solid-js";
import type { Interest, Preferences } from "@praxbit/contracts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";
import { platformCapabilities } from "../../platform/services.ts";
import { reminderScheduler, type ReminderKind } from "../../platform/notifications.ts";
import "./settings.css";

const INTEREST_OPTIONS: readonly { id: Interest; label: string }[] = [
    { id: "web", label: "Websites and applications" },
    { id: "games", label: "Games and interactive worlds" },
    { id: "systems", label: "How computers work" },
    { id: "ai", label: "AI and automation" },
    { id: "professional", label: "Professional development" },
    { id: "everything", label: "Explore everything" },
];

function reminderSupportText(kind: ReminderKind): string {
    if (kind === "native") {
        return "The installed mobile app schedules a local reminder that can fire while Praxbit is closed. Quiet hours are respected.";
    }
    if (kind === "web") {
        return "This browser can show reminders only while Praxbit is open. Install the mobile app to schedule reminders that fire while it is closed. Quiet hours are respected.";
    }
    return "This browser does not support notifications. Reminders cannot be scheduled here, so the preference stays off.";
}

export function SettingsScreen(): JSX.Element {
    const learning = useLearning();
    const navigate = useNavigate();

    const [mode, setMode] = createSignal<"login" | "register">("register");
    const [handle, setHandle] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [accountError, setAccountError] = createSignal("");
    const [accountBusy, setAccountBusy] = createSignal(false);
    const [notice, setNotice] = createSignal("");

    const initial = learning.preferences();
    const [interests, setInterests] = createSignal<readonly Interest[]>([...initial.interests]);
    const [challenge, setChallenge] = createSignal(initial.challenge);
    const [textScale, setTextScale] = createSignal(initial.textScale);
    const [motion, setMotion] = createSignal(initial.motion);
    const [sound, setSound] = createSignal(initial.sound);
    const [aiTutor, setAiTutor] = createSignal(initial.aiTutor);
    const [reminders, setReminders] = createSignal(initial.reminders.enabled);
    const [quietStart, setQuietStart] = createSignal(initial.reminders.quietStart);
    const [quietEnd, setQuietEnd] = createSignal(initial.reminders.quietEnd);
    const [preferencesSaved, setPreferencesSaved] = createSignal(false);
    const [preferenceError, setPreferenceError] = createSignal("");
    const [reminderError, setReminderError] = createSignal("");
    const [preferencesBusy, setPreferencesBusy] = createSignal(false);
    const [handleTouched, setHandleTouched] = createSignal(false);
    const [passwordTouched, setPasswordTouched] = createSignal(false);
    const [deleteConfirming, setDeleteConfirming] = createSignal(false);
    const [deleteConfirmation, setDeleteConfirmation] = createSignal("");
    const [deleteError, setDeleteError] = createSignal("");
    const reminderKind = platformCapabilities.supportsNotifications
        ? reminderScheduler.kind
        : "none";
    const remindersSupported = reminderKind !== "none";

    let hydrated = false;
    createEffect(function hydrateSavedPreferences(): void {
        if (hydrated || !learning.ready()) {
            return;
        }
        hydrated = true;
        const saved = learning.preferences();
        setInterests([...saved.interests]);
        setChallenge(saved.challenge);
        setTextScale(saved.textScale);
        setMotion(saved.motion);
        setSound(saved.sound);
        setAiTutor(saved.aiTutor);
        setReminders(saved.reminders.enabled);
        setQuietStart(saved.reminders.quietStart);
        setQuietEnd(saved.reminders.quietEnd);
    });

    function normalizedHandle(): string {
        return handle().trim().toLowerCase();
    }

    function handleProblem(): string {
        const value = normalizedHandle();
        if (value.length === 0) {
            return "Enter a handle.";
        }
        return /^[a-z0-9_]{3,24}$/.test(value)
            ? ""
            : "Use 3-24 lowercase letters, numbers, or underscores.";
    }

    function passwordProblem(): string {
        if (password().length === 0) {
            return "Enter a password.";
        }
        if (mode() === "register" && password().length < 10) {
            return "Use at least 10 characters.";
        }
        return "";
    }

    function accountReady(): boolean {
        return handleProblem().length === 0 && passwordProblem().length === 0;
    }

    function chooseMode(next: "login" | "register"): void {
        setMode(next);
        setAccountError("");
        setHandleTouched(false);
        setPasswordTouched(false);
    }

    function handleAccountTabKey(event: KeyboardEvent): void {
        const next =
            event.key === "ArrowLeft" || event.key === "Home"
                ? "register"
                : event.key === "ArrowRight" || event.key === "End"
                  ? "login"
                  : undefined;
        if (next === undefined) {
            return;
        }
        event.preventDefault();
        chooseMode(next);
        const target = document.getElementById(
            next === "register" ? "account-tab-register" : "account-tab-login",
        );
        target?.focus();
    }

    function toggleInterest(interest: Interest): void {
        setInterests(function update(current): readonly Interest[] {
            if (current.includes(interest)) {
                const next = current.filter(function keep(item): boolean {
                    return item !== interest;
                });
                return next.length === 0 ? ["everything"] : next;
            }
            return [
                ...current.filter(function removeEverything(item): boolean {
                    return item !== "everything";
                }),
                interest,
            ];
        });
    }

    async function submitAccount(): Promise<void> {
        setHandleTouched(true);
        setPasswordTouched(true);
        if (!accountReady()) {
            return;
        }
        setAccountError("");
        setAccountBusy(true);
        try {
            if (mode() === "register") {
                await learning.register(handle().trim().toLowerCase(), password());
                setNotice(
                    "Account created. Queued local progress was uploaded and reconciled with the account.",
                );
            } else {
                await learning.login(handle().trim().toLowerCase(), password());
                setNotice(
                    "Signed in. The account state is now authoritative for synchronized progress.",
                );
            }
            setPassword("");
        } catch (error) {
            setAccountError(error instanceof Error ? error.message : "The account request failed.");
        } finally {
            setAccountBusy(false);
        }
    }

    async function savePreferences(): Promise<void> {
        setPreferenceError("");
        setPreferencesSaved(false);
        setPreferencesBusy(true);
        let next: Preferences = {
            interests: [...interests()],
            challenge: challenge(),
            textScale: textScale(),
            motion: motion(),
            sound: sound(),
            aiTutor: aiTutor(),
            reminders: {
                enabled: reminders(),
                quietStart: quietStart(),
                quietEnd: quietEnd(),
            },
        };
        try {
            if (next.reminders.enabled) {
                const result = await reminderScheduler.enable(next.reminders);
                if (!result.scheduled) {
                    setReminders(false);
                    setReminderError(
                        result.reason ?? "The practice reminder could not be scheduled.",
                    );
                    next = {
                        ...next,
                        reminders: { ...next.reminders, enabled: false },
                    };
                }
            }
            await learning.savePreferences(next);
            setPreferencesSaved(true);
            setTimeout(function quiet(): void {
                setPreferencesSaved(false);
            }, 1400);
        } catch (error) {
            setPreferenceError(
                error instanceof Error ? error.message : "Preferences could not be saved.",
            );
        } finally {
            setPreferencesBusy(false);
        }
    }

    async function requestReminders(enabled: boolean): Promise<void> {
        setReminderError("");
        if (!enabled) {
            setReminders(false);
            await reminderScheduler.disable();
            return;
        }
        if (!remindersSupported) {
            setReminders(false);
            setReminderError(
                "Notifications are not supported here. The reminder preference was left off.",
            );
            return;
        }
        const result = await reminderScheduler.enable({
            enabled: true,
            quietStart: quietStart(),
            quietEnd: quietEnd(),
        });
        if (!result.scheduled) {
            setReminders(false);
            setReminderError(result.reason ?? "The practice reminder could not be scheduled.");
            return;
        }
        setReminders(true);
    }

    function deletionConfirmed(): boolean {
        const expected = learning.user()?.handle;
        return expected !== undefined && deleteConfirmation().trim().toLowerCase() === expected;
    }

    function cancelDeletion(): void {
        setDeleteConfirming(false);
        setDeleteConfirmation("");
        setDeleteError("");
    }

    async function deleteAccount(): Promise<void> {
        if (!deletionConfirmed() || accountBusy()) {
            return;
        }
        setDeleteError("");
        setAccountBusy(true);
        try {
            await learning.deleteAccount();
            setNotice("Account deleted. This device now holds a fresh guest state.");
            navigate("/learn");
        } catch (error) {
            setDeleteError(
                error instanceof Error ? error.message : "The account could not be deleted.",
            );
        } finally {
            setAccountBusy(false);
        }
    }

    return (
        <main class="page page--narrow">
            <div class="page-header">
                <div class="page-header__text">
                    <h1>Settings</h1>
                    <p class="lede">
                        Account, presentation, privacy, and accessibility. Nothing here changes the
                        curriculum.
                    </p>
                </div>
                <span aria-hidden="true">
                    <Pip pose="observing" size={76} />
                </span>
            </div>

            <Show
                when={learning.ready()}
                fallback={
                    <p class="feedback feedback--info" role="status">
                        Loading your account and saved preferences…
                    </p>
                }
            >
                <div class="stack stack--wide">
                    <Show when={notice().length > 0}>
                        <p class="feedback feedback--info" role="status">
                            {notice()}
                        </p>
                    </Show>

                    <section class="surface stack" aria-labelledby="account-heading">
                        <h2 id="account-heading">Account</h2>
                        <Show
                            when={learning.user() !== undefined}
                            fallback={
                                <div class="stack">
                                    <p class="small muted">
                                        Guest progress stays in this browser's IndexedDB. Creating
                                        an account uploads the queued local evidence and world
                                        actions. If the account already has progress, conflicting
                                        world versions are reported rather than overwritten.
                                    </p>
                                    <div
                                        class="tabs"
                                        role="tablist"
                                        aria-label="Account action"
                                        onKeyDown={handleAccountTabKey}
                                    >
                                        <button
                                            type="button"
                                            class="tab"
                                            role="tab"
                                            id="account-tab-register"
                                            aria-selected={mode() === "register"}
                                            aria-controls="account-panel"
                                            tabIndex={mode() === "register" ? 0 : -1}
                                            onClick={function registerTab(): void {
                                                chooseMode("register");
                                            }}
                                        >
                                            Create account
                                        </button>
                                        <button
                                            type="button"
                                            class="tab"
                                            role="tab"
                                            id="account-tab-login"
                                            aria-selected={mode() === "login"}
                                            aria-controls="account-panel"
                                            tabIndex={mode() === "login" ? 0 : -1}
                                            onClick={function loginTab(): void {
                                                chooseMode("login");
                                            }}
                                        >
                                            Sign in
                                        </button>
                                    </div>
                                    <div
                                        id="account-panel"
                                        role="tabpanel"
                                        aria-labelledby={
                                            mode() === "register"
                                                ? "account-tab-register"
                                                : "account-tab-login"
                                        }
                                    >
                                        <form
                                            class="stack"
                                            onSubmit={function submit(event): void {
                                                event.preventDefault();
                                                void submitAccount();
                                            }}
                                        >
                                            <label class="field">
                                                <span>Handle</span>
                                                <input
                                                    class="input"
                                                    value={handle()}
                                                    autocomplete="username"
                                                    spellcheck={false}
                                                    maxlength={24}
                                                    aria-invalid={
                                                        handleTouched() &&
                                                        handleProblem().length > 0
                                                    }
                                                    aria-describedby="account-handle-hint account-handle-error"
                                                    onInput={function change(event): void {
                                                        setHandle(event.currentTarget.value);
                                                        setHandleTouched(true);
                                                    }}
                                                    onBlur={function blur(): void {
                                                        setHandleTouched(true);
                                                    }}
                                                />
                                                <span class="meta" id="account-handle-hint">
                                                    3-24 lowercase letters, numbers, or underscores.
                                                    No real name required.
                                                </span>
                                                <Show
                                                    when={
                                                        handleTouched() &&
                                                        handleProblem().length > 0
                                                    }
                                                >
                                                    <span
                                                        class="settings-field-error"
                                                        id="account-handle-error"
                                                        role="alert"
                                                    >
                                                        {handleProblem()}
                                                    </span>
                                                </Show>
                                            </label>
                                            <label class="field">
                                                <span>Password</span>
                                                <input
                                                    class="input"
                                                    type="password"
                                                    value={password()}
                                                    maxlength={200}
                                                    autocomplete={
                                                        mode() === "register"
                                                            ? "new-password"
                                                            : "current-password"
                                                    }
                                                    aria-invalid={
                                                        passwordTouched() &&
                                                        passwordProblem().length > 0
                                                    }
                                                    aria-describedby="account-password-hint account-password-error"
                                                    onInput={function change(event): void {
                                                        setPassword(event.currentTarget.value);
                                                        setPasswordTouched(true);
                                                    }}
                                                    onBlur={function blur(): void {
                                                        setPasswordTouched(true);
                                                    }}
                                                />
                                                <span class="meta" id="account-password-hint">
                                                    {mode() === "register"
                                                        ? "At least 10 characters. Stored as a salted scrypt hash on the server."
                                                        : "Enter the password for this account."}
                                                </span>
                                                <Show
                                                    when={
                                                        passwordTouched() &&
                                                        passwordProblem().length > 0
                                                    }
                                                >
                                                    <span
                                                        class="settings-field-error"
                                                        id="account-password-error"
                                                        role="alert"
                                                    >
                                                        {passwordProblem()}
                                                    </span>
                                                </Show>
                                            </label>
                                            <Show when={accountError().length > 0}>
                                                <p class="feedback feedback--error" role="alert">
                                                    {accountError()}
                                                </p>
                                            </Show>
                                            <button
                                                type="submit"
                                                class="button"
                                                disabled={accountBusy() || !accountReady()}
                                                aria-describedby="account-submit-hint"
                                            >
                                                {accountBusy()
                                                    ? mode() === "register"
                                                        ? "Creating account…"
                                                        : "Signing in…"
                                                    : mode() === "register"
                                                      ? "Create account and upload progress"
                                                      : "Sign in"}
                                            </button>
                                            <Show when={!accountReady() && !accountBusy()}>
                                                <p class="meta" id="account-submit-hint">
                                                    {mode() === "register"
                                                        ? "Enter a valid handle and a password of at least 10 characters to continue."
                                                        : "Enter your handle and password to continue."}
                                                </p>
                                            </Show>
                                        </form>
                                    </div>
                                </div>
                            }
                        >
                            <div class="stack">
                                <p>
                                    Signed in as <strong>{learning.user()?.displayName}</strong> (
                                    <code class="inline-code">@{learning.user()?.handle}</code>).
                                </p>
                                <p class="small muted">
                                    Authoritative mastery, reviews, completions, and the campus
                                    world are stored in PostgreSQL. This device keeps a local cache
                                    for offline use.
                                </p>
                                <Show when={accountError().length > 0}>
                                    <p class="feedback feedback--error">{accountError()}</p>
                                </Show>
                                <div class="row">
                                    <button
                                        type="button"
                                        class="button button--secondary"
                                        disabled={accountBusy()}
                                        onClick={function exportAccount(): void {
                                            void learning.exportData();
                                        }}
                                    >
                                        Export account data
                                    </button>
                                    <button
                                        type="button"
                                        class="button button--secondary"
                                        disabled={accountBusy()}
                                        onClick={function revoke(): void {
                                            void learning.logout();
                                        }}
                                    >
                                        Sign out
                                    </button>
                                </div>
                                <div class="settings-danger stack stack--tight">
                                    <h3>Delete account</h3>
                                    <p class="small">
                                        This permanently deletes the account, synchronized progress,
                                        and the local account cache on this device. Local drafts and
                                        the campus world return to a fresh guest state. This cannot
                                        be undone.
                                    </p>
                                    <Show
                                        when={deleteConfirming()}
                                        fallback={
                                            <div class="row">
                                                <button
                                                    type="button"
                                                    class="button button--danger"
                                                    disabled={accountBusy()}
                                                    onClick={function startDeletion(): void {
                                                        setDeleteConfirming(true);
                                                        setDeleteError("");
                                                    }}
                                                >
                                                    Review account deletion
                                                </button>
                                            </div>
                                        }
                                    >
                                        <div class="stack stack--tight">
                                            <label class="field">
                                                <span>
                                                    Type <strong>@{learning.user()?.handle}</strong>{" "}
                                                    to confirm
                                                </span>
                                                <input
                                                    class="input mono"
                                                    value={deleteConfirmation()}
                                                    autocomplete="off"
                                                    spellcheck={false}
                                                    aria-describedby="delete-account-hint delete-account-error"
                                                    onInput={function change(event): void {
                                                        setDeleteConfirmation(
                                                            event.currentTarget.value,
                                                        );
                                                    }}
                                                />
                                                <span class="meta" id="delete-account-hint">
                                                    The final button stays disabled until the handle
                                                    matches exactly.
                                                </span>
                                            </label>
                                            <Show when={deleteError().length > 0}>
                                                <p
                                                    class="feedback feedback--error"
                                                    id="delete-account-error"
                                                    role="alert"
                                                >
                                                    {deleteError()}
                                                </p>
                                            </Show>
                                            <div class="row">
                                                <button
                                                    type="button"
                                                    class="button button--danger"
                                                    disabled={!deletionConfirmed() || accountBusy()}
                                                    onClick={function remove(): void {
                                                        void deleteAccount();
                                                    }}
                                                >
                                                    {accountBusy()
                                                        ? "Deleting account…"
                                                        : "Permanently delete account and progress"}
                                                </button>
                                                <button
                                                    type="button"
                                                    class="button button--secondary"
                                                    disabled={accountBusy()}
                                                    onClick={cancelDeletion}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        </Show>
                    </section>

                    <section class="surface stack" aria-labelledby="preferences-heading">
                        <h2 id="preferences-heading">Learning preferences</h2>
                        <fieldset class="stack stack--tight">
                            <legend class="meta">Interests</legend>
                            <For each={INTEREST_OPTIONS}>
                                {function option(item): JSX.Element {
                                    return (
                                        <label class="choice">
                                            <input
                                                type="checkbox"
                                                checked={interests().includes(item.id)}
                                                onChange={function change(): void {
                                                    toggleInterest(item.id);
                                                }}
                                            />
                                            <span class="choice__text">{item.label}</span>
                                        </label>
                                    );
                                }}
                            </For>
                        </fieldset>
                        <label class="field">
                            <span>Challenge level</span>
                            <select
                                class="select"
                                value={challenge()}
                                onChange={function change(event): void {
                                    const value = event.currentTarget.value;
                                    if (
                                        value === "gentle" ||
                                        value === "standard" ||
                                        value === "stretch"
                                    ) {
                                        setChallenge(value);
                                    }
                                }}
                            >
                                <option value="gentle">Gentle</option>
                                <option value="standard">Standard</option>
                                <option value="stretch">Stretch</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>Text size</span>
                            <input
                                type="range"
                                min="0.9"
                                max="1.4"
                                step="0.1"
                                value={textScale()}
                                onInput={function change(event): void {
                                    setTextScale(Number(event.currentTarget.value));
                                }}
                            />
                            <span class="meta">
                                {textScale() <= 0.95
                                    ? "Small"
                                    : textScale() >= 1.2
                                      ? "Large"
                                      : "Standard"}{" "}
                                text. The saved preference applies across the app.
                            </span>
                        </label>
                        <label class="field">
                            <span>Motion</span>
                            <select
                                class="select"
                                value={motion()}
                                onChange={function change(event): void {
                                    const value = event.currentTarget.value;
                                    if (
                                        value === "system" ||
                                        value === "reduce" ||
                                        value === "full"
                                    ) {
                                        setMotion(value);
                                    }
                                }}
                            >
                                <option value="system">Follow system setting</option>
                                <option value="reduce">Reduce motion</option>
                                <option value="full">Allow purposeful motion</option>
                            </select>
                        </label>
                        <label class="choice">
                            <input
                                type="checkbox"
                                checked={sound()}
                                onChange={function change(event): void {
                                    setSound(event.currentTarget.checked);
                                }}
                            />
                            <span class="choice__text">
                                Optional completion tone
                                <span class="meta">A short two-note cue. Off by default.</span>
                            </span>
                        </label>
                        <Show
                            when={learning.aiTutorAvailable()}
                            fallback={
                                <p class="small muted">
                                    Curated hints are available offline. This server has no live AI
                                    provider configured.
                                </p>
                            }
                        >
                            <label class="choice">
                                <input
                                    type="checkbox"
                                    checked={aiTutor()}
                                    onChange={function change(event): void {
                                        setAiTutor(event.currentTarget.checked);
                                    }}
                                />
                                <span class="choice__text">
                                    Allow live AI tutor requests
                                    <span class="meta">
                                        Off by default. Curated hints always work offline. When
                                        enabled, the server gateway receives only the selected
                                        mission, step, your question, and an optional code snippet.
                                        Provider availability is not guaranteed.
                                    </span>
                                </span>
                            </label>
                        </Show>
                        <label class="choice">
                            <input
                                type="checkbox"
                                checked={reminders()}
                                disabled={!remindersSupported}
                                onChange={function change(event): void {
                                    void requestReminders(event.currentTarget.checked);
                                }}
                            />
                            <span class="choice__text">
                                Optional practice reminder
                                <span class="meta">{reminderSupportText(reminderKind)}</span>
                                <Show when={reminderError().length > 0}>
                                    <span class="settings-field-error" role="alert">
                                        {reminderError()}
                                    </span>
                                </Show>
                            </span>
                        </label>
                        <div class="grid grid--two">
                            <label class="field">
                                <span>Quiet hours start</span>
                                <input
                                    class="input"
                                    type="time"
                                    value={quietStart()}
                                    onInput={function change(event): void {
                                        setQuietStart(event.currentTarget.value);
                                    }}
                                />
                            </label>
                            <label class="field">
                                <span>Quiet hours end</span>
                                <input
                                    class="input"
                                    type="time"
                                    value={quietEnd()}
                                    onInput={function change(event): void {
                                        setQuietEnd(event.currentTarget.value);
                                    }}
                                />
                            </label>
                        </div>
                        <Show when={preferenceError().length > 0}>
                            <p class="feedback feedback--error" role="alert">
                                {preferenceError()}
                            </p>
                        </Show>
                        <div class="row">
                            <button
                                type="button"
                                class="button"
                                disabled={preferencesBusy()}
                                onClick={function save(): void {
                                    void savePreferences();
                                }}
                            >
                                {preferencesBusy() ? "Saving preferences…" : "Save preferences"}
                            </button>
                            <span class="meta" role="status" aria-live="polite">
                                {preferencesSaved() ? "Preferences saved on this device." : ""}
                            </span>
                        </div>
                    </section>

                    <section class="surface stack" aria-labelledby="placement-heading">
                        <h2 id="placement-heading">Placement</h2>
                        <p class="small muted">
                            Placement credits can skip known prerequisites without granting language
                            mastery. Later evidence remains authoritative.
                        </p>
                        <Show when={learning.progress().placementSkippedSkills.length > 0}>
                            <p class="meta">
                                {learning.progress().placementSkippedSkills.length} prerequisite
                                skills are credited from placement.
                            </p>
                        </Show>
                        <div class="row">
                            <A class="button button--secondary" href="/placement">
                                Retake placement
                            </A>
                        </div>
                    </section>

                    <section class="surface surface--quiet stack" aria-labelledby="about-heading">
                        <h2 id="about-heading">About Praxbit</h2>
                        <p class="small">
                            Praxbit is the computer science learning game. Start knowing nothing.
                            Learn to understand everything you build.
                        </p>
                        <p class="small muted">
                            Foundational lessons work offline after caching. Advanced runtimes such
                            as Python, SQL, and Git load only when an exercise needs them. The
                            visual world uses PixiJS only on the World screen.
                        </p>
                        <p class="meta">
                            Guest progress never leaves this device until you choose to connect an
                            account. Signed-in accounts can export or delete their data in the
                            Account section above.
                        </p>
                    </section>
                </div>
            </Show>
        </main>
    );
}
