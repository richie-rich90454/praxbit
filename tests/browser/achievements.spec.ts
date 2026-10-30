import { expect, test, type Page } from "@playwright/test";

async function completeOpeningMission(page: Page): Promise<void> {
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
    await expect(page.getByRole("heading", { name: "Name the three parts" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("radio", { name: /controller/i })).toBeVisible();
    await page.getByRole("radio", { name: /controller/i }).check();
    await page.getByRole("button", { name: /check answer/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible();
}

test.describe("achievements and streaks", function achievementSuite(): void {
    test("Learn shows an accessible gallery with unearned progress", async function gallery({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        const streak = page.getByRole("region", { name: "Practice streak" });
        await expect(streak).toBeVisible();
        await expect(streak.getByText("Current streak", { exact: true })).toBeVisible();
        await expect(streak.getByText("Longest streak", { exact: true })).toBeVisible();
        await expect(streak.getByText("0 days").first()).toBeVisible();

        const achievements = page.getByTestId("achievements-gallery");
        await expect(achievements).toBeVisible();
        await expect(achievements.getByRole("listitem")).toHaveCount(8);

        const transfer = achievements.locator('[data-achievement-id="achievement.first-transfer"]');
        await expect(transfer).toHaveAttribute("data-earned", "false");
        await expect(transfer).toContainText("Not earned yet");
        const transferProgress = await transfer
            .getByRole("progressbar", { name: "Transfer progress" })
            .evaluate(function currentValue(element: Element): number {
                return element instanceof HTMLProgressElement ? element.value : -1;
            });
        expect(transferProgress).toBe(0);
    });

    test("a completed mission earns an achievement and starts the streak", async function earned({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await completeOpeningMission(page);
        await page.goto("/learn");

        const streak = page.getByRole("region", { name: "Practice streak" });
        await expect(streak.getByText("1 day").first()).toBeVisible();

        const achievements = page.getByTestId("achievements-gallery");
        const transfer = achievements.locator('[data-achievement-id="achievement.first-transfer"]');
        await expect(transfer).toHaveAttribute("data-earned", "true");
        await expect(transfer).toContainText("Earned");
        await expect(achievements).toContainText("1 of 8 earned");
    });
});
