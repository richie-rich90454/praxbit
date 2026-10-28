export interface PlatformCapabilities {
    readonly supportsLocalFiles: boolean;
    readonly supportsNotifications: boolean;
    readonly supportsBackgroundSync: boolean;
    readonly supportsBrowserWasm: boolean;
    readonly supportsIndexedDb: boolean;
    readonly supportsServiceWorker: boolean;
    readonly native: boolean;
}

export function detectWebCapabilities(): PlatformCapabilities {
    const hasWindow = typeof window !== "undefined";
    return {
        supportsLocalFiles: hasWindow && "showOpenFilePicker" in window,
        supportsNotifications: hasWindow && "Notification" in window,
        supportsBackgroundSync:
            hasWindow && "serviceWorker" in navigator && "SyncManager" in window,
        supportsBrowserWasm: typeof WebAssembly === "object",
        supportsIndexedDb: hasWindow && "indexedDB" in window,
        supportsServiceWorker: hasWindow && "serviceWorker" in navigator,
        native: false,
    };
}

export function detectNativeCapabilities(): PlatformCapabilities {
    const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor;
    const native = capacitor?.isNativePlatform?.() === true;
    return {
        supportsLocalFiles: native,
        supportsNotifications: native,
        supportsBackgroundSync: native,
        supportsBrowserWasm: typeof WebAssembly === "object",
        supportsIndexedDb: typeof indexedDB !== "undefined",
        supportsServiceWorker: false,
        native,
    };
}
