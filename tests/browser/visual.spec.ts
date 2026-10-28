import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
    await page.evaluate(function fontsReady(): Promise<unknown> {
        return document.fonts.ready;
    });
    await page.waitForTimeout(300);
}

test.describe("visual regression", function visualSuite(): void {
    test("@visual Learn screen", async function learnVisual({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        await ready(page);
        await expect(page).toHaveScreenshot("learn.png", { fullPage: true });
    });

    test("@visual mission briefing", async function missionVisual({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/before-code.make-it-respond");
        await ready(page);
        await expect(page).toHaveScreenshot("mission-briefing.png", { fullPage: true });
    });

    test("@visual settings", async function settingsVisual({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/settings");
        await ready(page);
        await expect(page).toHaveScreenshot("settings.png", { fullPage: true });
    });

    test("@visual projects", async function projectsVisual({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/projects");
        await ready(page);
        await expect(page).toHaveScreenshot("projects.png", { fullPage: true });
    });
});
