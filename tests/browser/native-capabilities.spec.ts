import { expect, test, type Page } from "@playwright/test";

test.describe("web fallback capabilities", function nativeCapabilitySuite(): void {
    test("the web shell reports reminder support honestly and never asks on load", async function reminders({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.addInitScript(function watchNotificationPermission(): void {
            if (typeof Notification === "undefined") {
                return;
            }
            const state = { calls: 0 };
            const target = window as unknown as {
                praxbitNotificationRequestCount?: () => number;
            };
            target.praxbitNotificationRequestCount = function count(): number {
                return state.calls;
            };
            Notification.requestPermission =
                function requestPermission(): Promise<NotificationPermission> {
                    state.calls += 1;
                    return Promise.resolve("denied");
                };
        });
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
        const reminder = page.getByRole("checkbox", { name: /Optional practice reminder/ });
        await expect(reminder).toBeEnabled();
        await expect(
            page.getByText(/This browser can show reminders only while Praxbit is open/),
        ).toBeVisible();
        await expect(page.getByText(/does not support notifications/)).toHaveCount(0);
        const requests = await page.evaluate(function permissionRequests(): number {
            const probe = (
                window as unknown as {
                    praxbitNotificationRequestCount?: () => number;
                }
            ).praxbitNotificationRequestCount;
            return probe === undefined ? 0 : probe();
        });
        expect(requests).toBe(0);
        const permission = await page.evaluate(function notificationPermission(): string {
            return Notification.permission;
        });
        expect(permission).not.toBe("granted");
    });

    test("unsupported notification APIs disable reminders with an explanation", async function unsupported({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.addInitScript(function removeNotifications(): void {
            Object.defineProperty(window, "Notification", {
                configurable: true,
                value: undefined,
            });
        });
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
        const reminder = page.getByRole("checkbox", { name: /Optional practice reminder/ });
        await expect(reminder).toBeDisabled();
        await expect(
            page.getByText(
                /This browser does not support notifications\. Reminders cannot be scheduled here/,
            ),
        ).toBeVisible();
    });

    test("deep links resolve to the matching client routes", async function routes({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/before-code.make-it-respond");
        await expect(page.getByRole("heading", { name: "Make it respond" })).toBeVisible();

        await page.goto("/learn");
        await expect(page.getByRole("heading", { name: "Learn", exact: true })).toBeVisible();

        await page.goto("/practice");
        await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();

        await page.goto("/club");
        await expect(page.getByRole("heading", { name: "Club", exact: true })).toBeVisible();

        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    });

    test("the production service worker exposes the background sync hook", async function serviceWorker({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        const registration = await page.evaluate(function activeWorker(): Promise<string | null> {
            if (!("serviceWorker" in navigator)) {
                return Promise.resolve(null);
            }
            return navigator.serviceWorker.ready.then(function scriptUrl(ready): string | null {
                return ready.active?.scriptURL ?? null;
            });
        });
        expect(registration).not.toBeNull();
        const hook = await page.evaluate(function backgroundSyncHook(): Promise<string> {
            return fetch("/sw-background-sync.js").then(function read(response): Promise<string> {
                return response.text();
            });
        });
        expect(hook).toContain("praxbit-sync");
    });
});
