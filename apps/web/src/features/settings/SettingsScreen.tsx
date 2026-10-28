import { A, useNavigate } from "@solidjs/router";
import { For, Show, createSignal, type JSX } from "solid-js";
import type { Interest, Preferences } from "@praxbit/contracts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";

const INTEREST_OPTIONS: readonly { id: Interest; label: string }[] = [
    { id: "web", label: "Websites and applications" },
    { id: "games", label: "Games and interactive worlds" },
    { id: "systems", label: "How computers work" },
    { id: "ai", label: "AI and automation" },
    { id: "professional", label: "Professional development" },
    { id: "everything", label: "Explore everything" },
];

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
        const next: Preferences = {
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
            await learning.savePreferences(next);
            setPreferencesSaved(true);
            setTimeout(function quiet(): void {
                setPreferencesSaved(false);
            }, 1400);
        } catch (error) {
            setPreferenceError(
                error instanceof Error ? error.message : "Preferences could not be saved.",
            );
        }
    }

    async function requestReminders(enabled: boolean): Promise<void> {
        setReminders(enabled);
        if (!enabled || typeof Notification === "undefined") {
            return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            setReminders(false);
            setPreferenceError(
                "Notification permission was not granted. The reminder preference was left off.",
            );
        }
    }

    async function deleteAccount(): Promise<void> {
        const confirmed = window.confirm(
            "Delete this account and all synchronized progress? Local drafts on this device are also cleared. This cannot be undone.",
        );
        if (!confirmed) {
            return;
        }
        setAccountBusy(true);
        try {
            await learning.deleteAccount();
            setNotice("Account deleted. This device now holds a fresh guest state.");
            navigate("/learn");
        } catch (error) {
            setAccountError(
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
                <Pip pose="observing" size={76} />
            </div>

            <div class="stack stack--wide">
                <Show when={notice().length > 0}>
                    <p class="feedback feedback--info">{notice()}</p>
                </Show>

                <section class="surface stack" aria-labelledby="account-heading">
                    <h2 id="account-heading">Account</h2>
                    <Show
                        when={learning.user() !== undefined}
                        fallback={
                            <div class="stack">
                                <p class="small muted">
                                    Guest progress stays in this browser's IndexedDB. Creating an
                                    account uploads the queued local evidence and world actions. If
                                    the account already has progress, conflicting world versions are
                                    reported rather than overwritten.
                                </p>
                                <div class="tabs" role="tablist" aria-label="Account action">
                                    <button
                                        type="button"
                                        class="tab"
                                        role="tab"
                                        aria-selected={mode() === "register"}
                                        onClick={function registerTab(): void {
                                            setMode("register");
                                        }}
                                    >
                                        Create account
                                    </button>
                                    <button
                                        type="button"
                                        class="tab"
                                        role="tab"
                                        aria-selected={mode() === "login"}
                                        onClick={function loginTab(): void {
                                            setMode("login");
                                        }}
                                    >
                                        Sign in
                                    </button>
                                </div>
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
                                            onInput={function change(event): void {
                                                setHandle(event.currentTarget.value);
                                            }}
                                        />
                                        <span class="meta">
                                            3-24 lowercase letters, numbers, or underscores. No real
                                            name required.
                                        </span>
                                    </label>
                                    <label class="field">
                                        <span>Password</span>
                                        <input
                                            class="input"
                                            type="password"
                                            value={password()}
                                            autocomplete={
                                                mode() === "register"
                                                    ? "new-password"
                                                    : "current-password"
                                            }
                                            onInput={function change(event): void {
                                                setPassword(event.currentTarget.value);
                                            }}
                                        />
                                        <span class="meta">
                                            At least 10 characters. Stored as a salted scrypt hash
                                            on the server.
                                        </span>
                                    </label>
                                    <Show when={accountError().length > 0}>
                                        <p class="feedback feedback--error">{accountError()}</p>
                                    </Show>
                                    <button
                                        type="submit"
                                        class="button"
                                        disabled={
                                            accountBusy() ||
                                            handle().length < 3 ||
                                            password().length < 10
                                        }
                                    >
                                        {accountBusy()
                                            ? "Working"
                                            : mode() === "register"
                                              ? "Create account and upload progress"
                                              : "Sign in"}
                                    </button>
                                </form>
                            </div>
                        }
                    >
                        <div class="stack">
                            <p>
                                Signed in as <strong>{learning.user()?.displayName}</strong> (
                                <code class="inline-code">@{learning.user()?.handle}</code>).
                            </p>
                            <p class="small muted">
                                Authoritative mastery, reviews, completions, and the campus world
                                are stored in PostgreSQL. This device keeps a local cache for
                                offline use.
                            </p>
                            <Show when={accountError().length > 0}>
                                <p class="feedback feedback--error">{accountError()}</p>
                            </Show>
                            <div class="row">
                                <button
                                    type="button"
                                    class="button button--secondary"
                                    onClick={function exportAccount(): void {
                                        void learning.exportData();
                                    }}
                                >
                                    Export account data
                                </button>
                                <button
                                    type="button"
                                    class="button button--secondary"
                                    onClick={function revoke(): void {
                                        void learning.logout();
                                    }}
                                >
                                    Sign out
                                </button>
                                <button
                                    type="button"
                                    class="button button--danger"
                                    disabled={accountBusy()}
                                    onClick={function remove(): void {
                                        void deleteAccount();
                                    }}
                                >
                                    Delete account
                                </button>
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
                                if (value === "system" || value === "reduce" || value === "full") {
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
                                Off by default. Curated hints always work offline. When enabled, the
                                server gateway receives only the selected mission, step, your
                                question, and an optional code snippet. Provider availability is not
                                guaranteed.
                            </span>
                        </span>
                    </label>
                    <label class="choice">
                        <input
                            type="checkbox"
                            checked={reminders()}
                            onChange={function change(event): void {
                                void requestReminders(event.currentTarget.checked);
                            }}
                        />
                        <span class="choice__text">
                            Optional practice reminder
                            <span class="meta">
                                Web notifications only fire while the app is open. The installed
                                mobile app can schedule local reminders. Quiet hours are respected.
                            </span>
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
                        <p class="feedback feedback--error">{preferenceError()}</p>
                    </Show>
                    <div class="row">
                        <button
                            type="button"
                            class="button"
                            onClick={function save(): void {
                                void savePreferences();
                            }}
                        >
                            Save preferences
                        </button>
                        <span class="meta">{preferencesSaved() ? "Saved." : ""}</span>
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
                            {learning.progress().placementSkippedSkills.length} prerequisite skills
                            are credited from placement.
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
                        Praxbit is the computer science learning game. Start knowing nothing. Learn
                        to understand everything you build.
                    </p>
                    <p class="small muted">
                        Foundational lessons work offline after caching. Advanced runtimes such as
                        Python, SQL, and Git load only when an exercise needs them. The visual world
                        uses PixiJS only on the World screen.
                    </p>
                    <p class="meta">
                        Account export and deletion are available above. Guest progress never leaves
                        this device until you choose to connect an account.
                    </p>
                </section>
            </div>
        </main>
    );
}
