import { describe, expect, it } from "vitest";
import {
    detectPlatformCapabilities,
    detectNativeCapabilities,
    detectWebCapabilities,
    type CapacitorLike,
} from "../../packages/client/src/capabilities/index.ts";

function pluginSet(names: readonly string[]): (name: string) => boolean {
    const available = new Set(names);
    return function hasPlugin(name): boolean {
        return available.has(name);
    };
}

describe("platform capability detection", function capabilitySuite(): void {
    it("detects a browser without optional capabilities", function minimalBrowser(): void {
        const capabilities = detectWebCapabilities({ window: {} });
        expect(capabilities).toEqual({
            supportsLocalFiles: false,
            supportsNotifications: false,
            supportsBackgroundSync: false,
            supportsBrowserWasm: false,
            supportsSecureStorage: false,
            supportsDeepLinks: true,
            supportsIndexedDb: false,
            supportsServiceWorker: false,
            native: false,
        });
    });

    it("detects a service-worker PWA with notifications and background sync", function pwa(): void {
        const capabilities = detectWebCapabilities({
            window: {
                Notification: function Notification(): void {
                    return;
                },
                SyncManager: function SyncManager(): void {
                    return;
                },
            },
            navigator: { serviceWorker: {} },
            WebAssembly: {},
            indexedDB: {},
        });
        expect(capabilities.supportsNotifications).toBe(true);
        expect(capabilities.supportsBackgroundSync).toBe(true);
        expect(capabilities.supportsServiceWorker).toBe(true);
        expect(capabilities.supportsBrowserWasm).toBe(true);
        expect(capabilities.supportsIndexedDb).toBe(true);
        expect(capabilities.supportsSecureStorage).toBe(false);
        expect(capabilities.supportsLocalFiles).toBe(false);
    });

    it("detects native plugins and never claims native background sync", function native(): void {
        const capacitor: CapacitorLike = {
            isNativePlatform: function isNativePlatform(): boolean {
                return true;
            },
            isPluginAvailable: pluginSet([
                "Filesystem",
                "LocalNotifications",
                "SecureStorage",
                "App",
            ]),
        };
        const capabilities = detectNativeCapabilities({
            capacitor,
            WebAssembly: {},
            indexedDB: {},
        });
        expect(capabilities.native).toBe(true);
        expect(capabilities.supportsLocalFiles).toBe(true);
        expect(capabilities.supportsNotifications).toBe(true);
        expect(capabilities.supportsSecureStorage).toBe(true);
        expect(capabilities.supportsDeepLinks).toBe(true);
        expect(capabilities.supportsBackgroundSync).toBe(false);
        expect(capabilities.supportsServiceWorker).toBe(false);
    });

    it("chooses the native branch only inside Capacitor", function platformBranch(): void {
        const native = detectPlatformCapabilities({
            window: {},
            capacitor: {
                isNativePlatform: function isNativePlatform(): boolean {
                    return true;
                },
                isPluginAvailable: pluginSet(["App"]),
            },
        });
        expect(native.native).toBe(true);
        const web = detectPlatformCapabilities({ window: {} });
        expect(web.native).toBe(false);
        expect(web.supportsDeepLinks).toBe(true);
    });
});
