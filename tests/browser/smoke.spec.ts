import { expect, test, type Page } from "@playwright/test";

export async function completeOpeningMission(page: Page): Promise<void> {
    await page.goto("/");
    await page.getByRole("button", { name: /start mission/i }).click();
    await page.locator("#machine-stamp-count").fill("3");
    await page.getByRole("button", { name: /run machine/i }).click();
    await page.locator("#machine-stamp-count").fill("4");
    await page.getByRole("button", { name: /run machine/i }).click();
    await page.getByRole("radio", { name: "4 marks" }).check();
    await page.getByRole("radio", { name: "CAMPUS", exact: true }).check();
    await page.getByRole("button", { name: /check prediction/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: /controller/i }).check();
    await page.getByRole("button", { name: /check answer/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible();
}

test.describe("opening experience", function openingSuite(): void {
    test("a guest completes the opening mission and unlocks the next mission", async function opening({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/");
        await expect(page).toHaveURL(/before-code\.make-it-respond/);
        await expect(page.getByRole("heading", { name: "Make it respond" })).toBeVisible();
        await completeOpeningMission(page);
        await expect(page.getByText("Independent success")).toBeVisible();
        await expect(page.getByText("Next review:")).toBeVisible();
        await page.getByRole("link", { name: /Next: Give better instructions/i }).click();
        await expect(page).toHaveURL(/before-code\.give-better-instructions/);
        await page.goto("/learn");
        await expect(page.locator("#recommended-heading")).toHaveText("Give better instructions");
        const mapNodes = page.locator(".map-node");
        await expect(mapNodes.nth(0)).toContainText("Completed");
        await expect(mapNodes.nth(1)).toContainText("Recommended");
    });

    test("primary navigation exposes exactly the five required destinations", async function navigation({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        const links = page.locator(".primary-nav__link");
        await expect(links).toHaveCount(5);
        await expect(links).toHaveText(["Learn", "World", "Practice", "Projects", "Club"]);
    });

    test("practice plans a short session with a start action", async function practice({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/practice");
        await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
        await expect(page.getByText(/activity/)).toBeVisible();
        await expect(page.getByRole("link", { name: "Start practice" })).toBeVisible();
    });

    test("the server-backed club screen gates membership without hiding the reason", async function clubGate({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/club");
        await expect(page.getByRole("heading", { name: "Clubs need an account" })).toBeVisible();
        await expect(
            page.getByRole("link", { name: /Create an account or sign in/i }),
        ).toBeVisible();
    });
});
