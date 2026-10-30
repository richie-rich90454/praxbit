import { Capacitor } from "@capacitor/core";
import { parseDeepLink } from "./deep-links.ts";

export type DeepLinkNavigate = (path: string) => void;

export async function installDeepLinkHandler(navigate: DeepLinkNavigate): Promise<() => void> {
    if (
        typeof window === "undefined" ||
        Capacitor.isNativePlatform() !== true ||
        Capacitor.isPluginAvailable("App") !== true
    ) {
        return function noop(): void {
            return;
        };
    }
    const { App } = await import("@capacitor/app");
    function route(url: string | undefined): void {
        if (url === undefined) {
            return;
        }
        const path = parseDeepLink(url);
        if (path !== undefined) {
            navigate(path);
        }
    }
    const launch = await App.getLaunchUrl();
    route(launch?.url);
    const listener = await App.addListener("appUrlOpen", function opened(event): void {
        route(event.url);
    });
    return function remove(): void {
        void listener.remove();
    };
}

export function navigateToPath(path: string): void {
    if (typeof window === "undefined") {
        return;
    }
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === path) {
        return;
    }
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
}
