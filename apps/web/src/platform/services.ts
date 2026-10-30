import {
    ApiClient,
    PraxbitDatabase,
    SyncManager,
    detectPlatformCapabilities,
    loadPreferences,
} from "@praxbit/client";
import {
    createBackgroundSyncRetry,
    registerPraxbitBackgroundSync,
    startBackgroundSyncObservers,
} from "./background-sync.ts";
import { resolveApiBaseUrl } from "./api-base.ts";
import { reminderScheduler } from "./notifications.ts";
import { createBearerTokenStore } from "./token-storage.ts";

export const platformCapabilities = detectPlatformCapabilities();
const tokenStore = createBearerTokenStore();
const configuredApiBase = import.meta.env["VITE_API_BASE_URL"] as string | undefined;

export const db = new PraxbitDatabase();
export const api = new ApiClient({
    baseUrl: resolveApiBaseUrl(platformCapabilities.native, configuredApiBase),
    native: platformCapabilities.native,
    onNativeToken: function persistNativeToken(token): void {
        if (token === undefined) {
            void tokenStore.clear();
            return;
        }
        void tokenStore.save(token);
    },
});
export const syncManager = new SyncManager(api, db);

export const backgroundSync = createBackgroundSyncRetry({
    supported: platformCapabilities.supportsBackgroundSync,
    register: registerPraxbitBackgroundSync,
    flush: function flushOutbox() {
        return syncManager.flush(50);
    },
});

async function hasPendingOperations(): Promise<boolean> {
    try {
        return (await db.outbox.count()) > 0;
    } catch {
        return false;
    }
}

async function requestBackgroundSyncIfPending(): Promise<void> {
    if (!platformCapabilities.supportsBackgroundSync) {
        return;
    }
    if (await hasPendingOperations()) {
        await backgroundSync.request();
    }
}

startBackgroundSyncObservers(backgroundSync, hasPendingOperations);
if (typeof window !== "undefined") {
    void requestBackgroundSyncIfPending();
}

export async function restoreNativeToken(): Promise<void> {
    if (!platformCapabilities.native) {
        return;
    }
    const token = await tokenStore.load();
    if (token !== undefined) {
        api.setNativeToken(token);
    }
}

export async function resumeSavedReminders(): Promise<void> {
    try {
        const preferences = await loadPreferences(db);
        if (preferences.reminders.enabled) {
            await reminderScheduler.resume(preferences.reminders);
        }
    } catch {
        // A missing local preference simply leaves reminders unscheduled.
    }
}

export function nativeTokenStorageStatus(): typeof tokenStore.status {
    return tokenStore.status;
}
