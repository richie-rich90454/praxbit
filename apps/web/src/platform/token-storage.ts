import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const TOKEN_KEY = "praxbit.native.bearer";

interface SecureStoragePlugin {
    get(options: { readonly key: string }): Promise<{ readonly value: string }>;
    set(options: { readonly key: string; readonly value: string }): Promise<void>;
    remove(options: { readonly key: string }): Promise<void>;
}

export interface TokenStorageStatus {
    readonly secure: boolean;
    readonly warning?: string;
}

export interface BearerTokenStore {
    readonly status: TokenStorageStatus;
    load(): Promise<string | undefined>;
    save(token: string): Promise<void>;
    clear(): Promise<void>;
}

const secureStorage = registerPlugin<SecureStoragePlugin>("SecureStorage");

const WEB_WARNING =
    "Praxbit: this browser has no secure bearer-token storage. The session token is kept in local storage and is readable by scripts on this origin.";
const NATIVE_WARNING =
    "Praxbit: the SecureStorage plugin is unavailable. The session token is stored in app preferences instead of the platform keychain.";

function secureStorageAvailable(): boolean {
    return (
        Capacitor.isNativePlatform() === true &&
        Capacitor.isPluginAvailable("SecureStorage") === true
    );
}

function warn(message: string): void {
    console.warn(message);
}

export function createBearerTokenStore(): BearerTokenStore {
    const native = Capacitor.isNativePlatform() === true;
    const secure = secureStorageAvailable();
    const status: TokenStorageStatus = secure
        ? { secure: true }
        : { secure: false, warning: native ? NATIVE_WARNING : WEB_WARNING };

    async function load(): Promise<string | undefined> {
        if (secure) {
            try {
                const result = await secureStorage.get({ key: TOKEN_KEY });
                return result.value.length === 0 ? undefined : result.value;
            } catch {
                return undefined;
            }
        }
        if (native) {
            const result = await Preferences.get({ key: TOKEN_KEY });
            return result.value === null || result.value.length === 0 ? undefined : result.value;
        }
        try {
            const value = window.localStorage.getItem(TOKEN_KEY);
            return value === null || value.length === 0 ? undefined : value;
        } catch {
            return undefined;
        }
    }

    async function save(token: string): Promise<void> {
        if (secure) {
            await secureStorage.set({ key: TOKEN_KEY, value: token });
            return;
        }
        if (native) {
            warn(NATIVE_WARNING);
            await Preferences.set({ key: TOKEN_KEY, value: token });
            return;
        }
        warn(WEB_WARNING);
        try {
            window.localStorage.setItem(TOKEN_KEY, token);
        } catch {
            // Private browsing can reject writes. The in-memory token still works for this load.
        }
    }

    async function clear(): Promise<void> {
        if (secure) {
            try {
                await secureStorage.remove({ key: TOKEN_KEY });
            } catch {
                // The session is already cleared in memory.
            }
            return;
        }
        if (native) {
            await Preferences.remove({ key: TOKEN_KEY });
            return;
        }
        try {
            window.localStorage.removeItem(TOKEN_KEY);
        } catch {
            // Nothing else to clear.
        }
    }

    return { status, load, save, clear };
}
