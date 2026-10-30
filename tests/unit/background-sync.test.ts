import { describe, expect, it } from "vitest";
import { createBackgroundSyncRetry } from "../../apps/web/src/platform/background-sync.ts";

describe("background sync queue retry", function backgroundSyncSuite(): void {
    it("keeps a failed flush queued and registers a background retry", async function registers(): Promise<void> {
        let queued = 1;
        let flushes = 0;
        let registrations = 0;
        const controller = createBackgroundSyncRetry({
            supported: true,
            register: function register(): Promise<boolean> {
                registrations += 1;
                return Promise.resolve(true);
            },
            flush: function flush(): Promise<{ readonly status: string }> {
                flushes += 1;
                if (flushes === 1) {
                    return Promise.resolve({ status: "offline" });
                }
                queued = 0;
                return Promise.resolve({ status: "synced" });
            },
        });

        expect((await controller.retry()).status).toBe("offline");
        expect(queued).toBe(1);
        expect(registrations).toBe(1);

        expect((await controller.retry()).status).toBe("synced");
        expect(queued).toBe(0);
        expect(flushes).toBe(2);
        expect(registrations).toBe(1);
    });

    it("still retries online when background sync is unavailable", async function unsupported(): Promise<void> {
        let flushes = 0;
        let registrations = 0;
        const controller = createBackgroundSyncRetry({
            supported: false,
            register: function register(): Promise<boolean> {
                registrations += 1;
                return Promise.resolve(true);
            },
            flush: function flush(): Promise<{ readonly status: string }> {
                flushes += 1;
                return Promise.resolve({ status: "failed" });
            },
        });

        expect(await controller.request()).toBe(false);
        expect((await controller.retry()).status).toBe("failed");
        expect(flushes).toBe(1);
        expect(registrations).toBe(0);
    });

    it("collapses overlapping retries into one flush", async function overlapping(): Promise<void> {
        let flushes = 0;
        let release: (() => void) | undefined;
        const gate = new Promise<void>(function wait(resolve): void {
            release = resolve;
        });
        const controller = createBackgroundSyncRetry({
            supported: true,
            register: function register(): Promise<boolean> {
                return Promise.resolve(true);
            },
            flush: async function flush(): Promise<{ readonly status: string }> {
                flushes += 1;
                await gate;
                return { status: "synced" };
            },
        });

        const first = controller.retry();
        const second = controller.retry();
        expect(release).toBeDefined();
        release?.();
        await Promise.all([first, second]);
        expect(flushes).toBe(1);
    });
});
