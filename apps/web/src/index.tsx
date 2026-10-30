import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App.tsx";
import { installDeepLinkHandler, navigateToPath } from "./platform/deep-link-handler.ts";
import {
    restoreNativeToken,
    resumeSavedReminders,
    platformCapabilities,
} from "./platform/services.ts";
import "./styles/global.css";

async function start(): Promise<void> {
    const root = document.querySelector("#root");
    if (root === null) {
        throw new Error("Praxbit could not find its root element.");
    }
    if (!platformCapabilities.native) {
        registerSW({ immediate: true });
    }
    await restoreNativeToken();
    render(function renderApp() {
        return <App />;
    }, root);
    void resumeSavedReminders();
    try {
        await installDeepLinkHandler(navigateToPath);
    } catch {
        // A native shell without the App plugin still uses ordinary web navigation.
    }
}

void start();
