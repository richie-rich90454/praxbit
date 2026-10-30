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
            await page.getByRole("button", { name: /start (mission|practice)/i }).click();
            await expect(
                page.getByRole("heading", { name: "The unlabeled stamp press" }),
            ).toBeVisible();
        } finally {
            await context.setOffline(false);
        }
    });

    test("the service worker precaches the shell and leaves API and advanced runtimes alone", async function cachedShell({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        const cachedUrls = await page.evaluate(async function cacheEntries(): Promise<string[]> {
            if (!("caches" in window)) {
                return [];
            }
            const urls: string[] = [];
            for (const name of await caches.keys()) {
                const cache = await caches.open(name);
                for (const request of await cache.keys()) {
                    urls.push(request.url);
                }
            }
            return urls;
        });
        expect(
            cachedUrls.some(function isShell(url): boolean {
                return url.includes("/index.html");
            }),
        ).toBe(true);
        expect(
            cachedUrls.some(function isScript(url): boolean {
                return url.endsWith(".js");
            }),
        ).toBe(true);
        expect(
            cachedUrls.some(function isApi(url): boolean {
                return url.includes("/api/");
            }),
        ).toBe(false);
        expect(
            cachedUrls.some(function isRuntime(url): boolean {
                return url.includes("/pyodide/");
            }),
        ).toBe(false);
    });
});
