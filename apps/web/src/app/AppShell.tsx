import { A, useLocation } from "@solidjs/router";
import { Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Logo } from "../design/Logo.tsx";
import { getMission, projectById } from "../content/index.ts";
import { useLearning } from "../features/learning/learning-store.tsx";

const PRIMARY_LINKS: readonly { href: string; label: string }[] = [
    { href: "/learn", label: "Learn" },
    { href: "/world", label: "World" },
    { href: "/practice", label: "Practice" },
    { href: "/projects", label: "Projects" },
    { href: "/club", label: "Club" },
];

const [statusMessage, setStatusMessage] = createSignal("");
let showTimer: number | undefined;
let clearTimer: number | undefined;

export function announce(message: string): void {
    const text = message.trim();
    if (text.length === 0) {
        return;
    }
    if (showTimer !== undefined) {
        window.clearTimeout(showTimer);
    }
    if (clearTimer !== undefined) {
        window.clearTimeout(clearTimer);
    }
    setStatusMessage("");
    showTimer = window.setTimeout(function show(): void {
        setStatusMessage(text);
    }, 50);
    clearTimer = window.setTimeout(function clear(): void {
        setStatusMessage("");
    }, 7000);
}

function routeTitle(pathname: string): string {
    const segments = pathname
        .split("/")
        .filter(function segment(value): boolean {
            return value.length > 0;
        })
        .map(function decoded(value): string {
            return decodeURIComponent(value);
        });
    const section = segments[0];
    if (section === undefined) {
        return "Praxbit · Learn how computers work";
    }
    switch (section) {
        case "learn":
            return "Learn · Praxbit";
        case "world":
            return "World · Praxbit";
        case "practice":
            return "Practice · Praxbit";
        case "projects": {
            const projectId = segments[1];
            const project = projectId === undefined ? undefined : projectById(projectId);
            return project === undefined ? "Projects · Praxbit" : `${project.title} · Praxbit`;
        }
        case "club":
            return "Club · Praxbit";
        case "settings":
            return "Settings · Praxbit";
        case "placement":
            return "Placement · Praxbit";
        case "missions": {
            const missionId = segments[1];
            const mission = missionId === undefined ? undefined : getMission(missionId);
            return mission === undefined ? "Mission · Praxbit" : `${mission.title} · Praxbit`;
        }
        default:
            return "Page not found · Praxbit";
    }
}

export function AppShell(props: { readonly children?: JSX.Element }): JSX.Element {
    const learning = useLearning();
    const location = useLocation();

    let lastRoute = `${location.pathname}${location.search}`;
    let userInteracted = false;

    function markInteraction(): void {
        userInteracted = true;
    }

    onMount(function listenForInteraction(): void {
        document.addEventListener("pointerdown", markInteraction, { passive: true });
        document.addEventListener("keydown", markInteraction);
        onCleanup(function removeListeners(): void {
            document.removeEventListener("pointerdown", markInteraction);
            document.removeEventListener("keydown", markInteraction);
        });
    });

    createEffect(function applyMotionPreference(): void {
        const motion = learning.preferences().motion;
        // The learning store applies its own presentation after this effect; restore the explicit choice.
        queueMicrotask(function apply(): void {
            document.documentElement.dataset["motion"] = motion;
        });
    });

    createEffect(function syncRoute(): void {
        const route = `${location.pathname}${location.search}`;
        document.title = routeTitle(location.pathname);
        if (route === lastRoute) {
            return;
        }
        lastRoute = route;
        if (!userInteracted) {
            return;
        }
        window.setTimeout(function focusRoute(): void {
            const main = document.getElementById("main");
            if (main !== null) {
                main.focus();
            }
            announce(document.title);
        }, 0);
    });

    const locationStarts = function locationStarts(prefix: string): boolean {
        return location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);
    };

    return (
        <div class="app-shell">
            <a
                class="skip-link"
                href="#main"
                tabindex="0"
                onClick={function focusMain(): void {
                    document.getElementById("main")?.focus();
                }}
            >
                Skip to main content
            </a>
            <header class="site-header">
                <div class="site-header__inner">
                    <A class="brand-link" href="/" aria-label="Praxbit home">
                        <Logo />
                    </A>
                    <nav class="primary-nav" aria-label="Primary">
                        {PRIMARY_LINKS.map(function link(item): JSX.Element {
                            return (
                                <A
                                    class="primary-nav__link"
                                    href={item.href}
                                    aria-current={locationStarts(item.href) ? "page" : undefined}
                                >
                                    {item.label}
                                </A>
                            );
                        })}
                    </nav>
                    <div class="header-actions">
                        <A class="button button--ghost button--small" href="/settings">
                            Settings
                        </A>
                    </div>
                </div>
            </header>

            <Show
                when={
                    !learning.online() ||
                    learning.syncStatus() === "conflict" ||
                    learning.syncStatus() === "failed"
                }
            >
                <div
                    class={`notice ${learning.syncStatus() === "failed" ? "notice--error" : ""}`}
                    style={{ "border-radius": "0", "border-left": "0", "border-right": "0" }}
                    role="status"
                >
                    <div class="page" style={{ padding: "8px 20px" }}>
                        <Show when={!learning.online()}>
                            <span class="small">
                                You are offline. Progress is saved on this device and will sync
                                later.
                            </span>
                        </Show>
                        <Show when={learning.online() && learning.syncStatus() === "conflict"}>
                            <span class="small">
                                {learning.syncMessage() ??
                                    "This device and your account changed the same state. The account version is shown."}
                            </span>
                        </Show>
                        <Show when={learning.online() && learning.syncStatus() === "failed"}>
                            <span class="small">
                                {learning.syncMessage() ??
                                    "Sync failed. Progress remains saved on this device."}
                            </span>
                        </Show>
                    </div>
                </div>
            </Show>

            <div id="main" tabindex="-1">
                <div
                    class="visually-hidden"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    data-status-region
                >
                    {statusMessage()}
                </div>
                {props.children}
            </div>

            <footer
                class="site-header"
                style={{ "border-top": "1px solid var(--border)", "border-bottom": "0" }}
            >
                <div class="site-header__inner row row--between">
                    <span class="meta">
                        Praxbit. Learn how computers work. Build what you imagine.
                    </span>
                    <span class="row">
                        <A class="small footer-link" href="/settings">
                            Settings and account
                        </A>
                        <A class="small footer-link" href="/placement">
                            Placement
                        </A>
                    </span>
                </div>
            </footer>
        </div>
    );
}
