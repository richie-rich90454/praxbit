import { A, useLocation } from "@solidjs/router";
import { Show, type JSX } from "solid-js";
import { Logo } from "../design/Logo.tsx";
import { useLearning } from "../features/learning/learning-store.tsx";

const PRIMARY_LINKS: readonly { href: string; label: string }[] = [
    { href: "/learn", label: "Learn" },
    { href: "/world", label: "World" },
    { href: "/practice", label: "Practice" },
    { href: "/projects", label: "Projects" },
    { href: "/club", label: "Club" },
];

export function AppShell(props: { readonly children?: JSX.Element }): JSX.Element {
    const learning = useLearning();
    const location = useLocation();

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
                    <A href="/" aria-label="Praxbit home">
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
                        <A class="small" href="/settings">
                            Settings and account
                        </A>
                        <A class="small" href="/placement">
                            Placement
                        </A>
                    </span>
                </div>
            </footer>
        </div>
    );
}
