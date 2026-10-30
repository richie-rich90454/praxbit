import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Preferences } from "@capacitor/preferences";

const TOKEN_KEY = "praxbit.native.bearer";

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
                const value = await SecureStorage.get(TOKEN_KEY);
                return typeof value === "string" && value.length > 0 ? value : undefined;
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
            try {
                await SecureStorage.set(TOKEN_KEY, token);
            } catch {
                warn(NATIVE_WARNING);
            }
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
                await SecureStorage.remove(TOKEN_KEY);
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
