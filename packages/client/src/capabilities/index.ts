export interface PlatformCapabilities {
    readonly supportsLocalFiles: boolean;
    readonly supportsNotifications: boolean;
    readonly supportsBackgroundSync: boolean;
    readonly supportsBrowserWasm: boolean;
    readonly supportsSecureStorage: boolean;
    readonly supportsDeepLinks: boolean;
    readonly supportsIndexedDb: boolean;
    readonly supportsServiceWorker: boolean;
    readonly native: boolean;
}

export interface CapabilityWindow {
    readonly Notification?: unknown;
    readonly showOpenFilePicker?: unknown;
    readonly SyncManager?: unknown;
}

export interface CapabilityNavigator {
    readonly serviceWorker?: unknown;
}

export interface CapacitorLike {
    readonly isNativePlatform?: () => boolean;
    readonly isPluginAvailable?: (name: string) => boolean;
}

export interface CapabilityEnvironment {
    readonly window?: CapabilityWindow;
    readonly navigator?: CapabilityNavigator;
    readonly WebAssembly?: unknown;
    readonly indexedDB?: unknown;
    readonly capacitor?: CapacitorLike;
}

export function detectPlatformCapabilities(
    environment?: CapabilityEnvironment,
): PlatformCapabilities {
    const resolved = environment ?? globalCapabilityEnvironment();
    const native = resolved.capacitor?.isNativePlatform?.() === true;
    return native ? detectNativeCapabilities(resolved) : detectWebCapabilities(resolved);
}

export function detectWebCapabilities(
    environment: CapabilityEnvironment = globalCapabilityEnvironment(),
): PlatformCapabilities {
    const browserWindow = environment.window;
    const hasWindow = browserWindow !== undefined;
    const hasServiceWorker = environment.navigator?.serviceWorker !== undefined;
    return {
        supportsLocalFiles: hasWindow && browserWindow?.showOpenFilePicker !== undefined,
        supportsNotifications: hasWindow && browserWindow?.Notification !== undefined,
        supportsBackgroundSync: hasServiceWorker && browserWindow?.SyncManager !== undefined,
        supportsBrowserWasm: environment.WebAssembly !== undefined,
        supportsSecureStorage: false,
        supportsDeepLinks: hasWindow,
        supportsIndexedDb: environment.indexedDB !== undefined,
        supportsServiceWorker: hasServiceWorker,
        native: false,
    };
}

export function detectNativeCapabilities(
    environment: CapabilityEnvironment = globalCapabilityEnvironment(),
): PlatformCapabilities {
    const capacitor = environment.capacitor;
    const native = capacitor?.isNativePlatform?.() === true;
    const hasPlugin = function hasPlugin(name: string): boolean {
        return capacitor?.isPluginAvailable?.(name) === true;
    };
    return {
        supportsLocalFiles: native && hasPlugin("Filesystem"),
        supportsNotifications: native && hasPlugin("LocalNotifications"),
        supportsBackgroundSync: false,
        supportsBrowserWasm: environment.WebAssembly !== undefined,
        supportsSecureStorage: native && hasPlugin("SecureStorage"),
        supportsDeepLinks: native && hasPlugin("App"),
        supportsIndexedDb: environment.indexedDB !== undefined,
        supportsServiceWorker: false,
        native,
    };
}

function globalCapabilityEnvironment(): CapabilityEnvironment {
    const browserWindow = typeof window === "undefined" ? undefined : window;
    const browserNavigator = typeof navigator === "undefined" ? undefined : navigator;
    const capacitor = (globalThis as { readonly Capacitor?: CapacitorLike }).Capacitor;
    return {
        ...(browserWindow === undefined ? {} : { window: browserWindow }),
        ...(browserNavigator === undefined ? {} : { navigator: browserNavigator }),
        ...(typeof WebAssembly === "undefined" ? {} : { WebAssembly }),
        ...(typeof indexedDB === "undefined" ? {} : { indexedDB }),
        ...(capacitor === undefined ? {} : { capacitor }),
    };
}
