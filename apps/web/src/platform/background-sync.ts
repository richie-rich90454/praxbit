export interface BackgroundSyncFlushResult {
    readonly status: string;
}

export interface BackgroundSyncRetryOptions {
    readonly supported: boolean;
    readonly register: () => Promise<boolean>;
    readonly flush: () => Promise<BackgroundSyncFlushResult>;
}

export interface BackgroundSyncRetry {
    readonly supported: boolean;
    request(): Promise<boolean>;
    retry(): Promise<BackgroundSyncFlushResult>;
}

const BACKGROUND_SYNC_TAG = "praxbit-sync";

export function createBackgroundSyncRetry(
    options: BackgroundSyncRetryOptions,
): BackgroundSyncRetry {
    let active: Promise<BackgroundSyncFlushResult> | undefined;

    async function run(): Promise<BackgroundSyncFlushResult> {
        let result: BackgroundSyncFlushResult;
        try {
            result = await options.flush();
        } catch {
            result = { status: "failed" };
        }
        if (options.supported && (result.status === "offline" || result.status === "failed")) {
            await options.register();
        }
        return result;
    }

    async function retry(): Promise<BackgroundSyncFlushResult> {
        if (active !== undefined) {
            return active;
        }
        active = run();
        try {
            return await active;
        } finally {
            active = undefined;
        }
    }

    async function request(): Promise<boolean> {
        return options.supported ? options.register() : false;
    }

    return { supported: options.supported, request, retry };
}

interface SyncCapableRegistration extends ServiceWorkerRegistration {
    readonly sync?: {
        register(tag: string): Promise<void>;
    };
}

export async function registerPraxbitBackgroundSync(): Promise<boolean> {
    if (typeof navigator === "undefined" || navigator.serviceWorker === undefined) {
        return false;
    }
    if (typeof window === "undefined" || !("SyncManager" in window)) {
        return false;
    }
    try {
        const registration = (await navigator.serviceWorker.ready) as SyncCapableRegistration;
        if (registration.sync === undefined) {
            return false;
        }
        await registration.sync.register(BACKGROUND_SYNC_TAG);
        return true;
    } catch {
        return false;
    }
}

export function startBackgroundSyncObservers(
    controller: BackgroundSyncRetry,
    hasPendingOperations: () => Promise<boolean>,
): () => void {
    if (typeof window === "undefined") {
        return function noop(): void {
            return;
        };
    }
    const goOnline = function goOnline(): void {
        void controller.retry();
    };
    const goOffline = function goOffline(): void {
        void hasPendingOperations().then(function requestWhenPending(pending): void {
            if (pending) {
                void controller.request();
            }
        });
    };
    const serviceWorkerMessage = function serviceWorkerMessage(event: MessageEvent): void {
        const data: unknown = event.data;
        if (
            typeof data === "object" &&
            data !== null &&
            "type" in data &&
            data.type === "praxbit:sync"
        ) {
            void controller.retry();
        }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    navigator.serviceWorker?.addEventListener("message", serviceWorkerMessage);
    return function stop(): void {
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
        navigator.serviceWorker?.removeEventListener("message", serviceWorkerMessage);
    };
}
