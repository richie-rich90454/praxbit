import { expect, test, type Page } from "@playwright/test";

test.describe("offline foundations", function offlineSuite(): void {
    test("the opening lesson works after the app shell is cached", async function offlineOpening({
        page,
        context,
    }: {
        page: Page;
        context: import("@playwright/test").BrowserContext;
    }): Promise<void> {
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await page.evaluate(function registerReady(): Promise<void> {
            if (!("serviceWorker" in navigator)) {
                return Promise.resolve();
            }
            return navigator.serviceWorker.ready.then(function ready(): void {
                return;
            });
        });
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForFunction(function controlled(): boolean {
            return (
                navigator.serviceWorker !== undefined && navigator.serviceWorker.controller !== null
            );
        });
        await context.setOffline(true);
        try {
            await page.reload({ waitUntil: "domcontentloaded" });
            await expect(page.getByRole("heading", { name: "Make it respond" })).toBeVisible();
            await page.getByRole("button", { name: /start mission/i }).click();
            await expect(
                page.getByRole("heading", { name: "The unlabeled stamp press" }),
            ).toBeVisible();
        } finally {
            await context.setOffline(false);
        }
    });
});
