import { expect, test, type Page } from "@playwright/test";

async function planMinutes(page: Page): Promise<number> {
    return page
        .getByTestId("practice-plan")
        .locator("[data-practice-minutes]")
        .evaluateAll(function total(nodes: Element[]): number {
            return nodes.reduce(function sum(totalMinutes: number, node: Element): number {
                return totalMinutes + Number(node.getAttribute("data-practice-minutes") ?? "0");
            }, 0);
        });
}

async function completeOpeningSteps(page: Page): Promise<void> {
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
}

test.describe("practice plans", function practicePlanSuite(): void {
    test("short, medium, and longer plans stay inside their time budgets", async function budgets({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/practice");
        await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
        await expect(page.getByTestId("practice-plan")).toBeVisible();

        expect(await planMinutes(page)).toBeLessThanOrEqual(5);
        const shortModes = await page
            .getByTestId("practice-plan")
            .locator("[data-practice-minutes]")
            .evaluateAll(function modes(nodes: Element[]): string[] {
                return nodes.map(function modeOf(node: Element): string {
                    return node.getAttribute("data-practice-mode") ?? "";
                });
            });
        expect(shortModes.length).toBeGreaterThan(0);

        await page.getByRole("button", { name: "Medium", exact: true }).click();
        expect(await planMinutes(page)).toBeLessThanOrEqual(12);

        await page.getByRole("button", { name: "Longer", exact: true }).click();
        expect(await planMinutes(page)).toBeLessThanOrEqual(25);

        const overBudget = await page
            .getByTestId("practice-plan")
            .locator("[data-practice-minutes]")
            .evaluateAll(function oversized(nodes: Element[]): number {
                return nodes.filter(function exceeds(node: Element): boolean {
                    return Number(node.getAttribute("data-practice-minutes") ?? "0") > 25;
                }).length;
            });
        expect(overBudget).toBe(0);
    });

    test("practice mode has its own briefing, plan, and completion copy", async function practiceMode({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/before-code.make-it-respond?practice=1");
        await expect(page.getByText("Quick practice").first()).toBeVisible();
        await expect(page.getByRole("heading", { name: "Practice briefing" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Practice plan" })).toBeVisible();
        await page.getByRole("button", { name: "Start practice" }).click();
        await completeOpeningSteps(page);

        const heading = page.getByRole("heading", { name: "Practice complete" });
        await expect(heading).toBeVisible();
        await expect(heading).toBeFocused();
        await expect(page.getByText(/Practice evidence is separate/i)).toBeVisible();
    });
});

test.describe("mission state and focus", function missionStateSuite(): void {
    test("briefing, attempting, assistance, completion, and review phases are represented", async function phases({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/before-code.make-it-respond");
        const main = page.getByRole("main");
        await expect(main).toHaveAttribute("data-mission-phase", "not-started");

        await page.getByRole("button", { name: /start mission/i }).click();
        await expect(main).toHaveAttribute("data-mission-phase", "attempting");
        await expect(page.locator("h1").first()).toBeFocused();

        await page.getByRole("button", { name: "Show a hint" }).click();
        await expect(main).toHaveAttribute("data-mission-phase", "assistance");
        await expect(page.getByTestId("mission-phase")).toContainText("Assisted attempt");

        await completeOpeningSteps(page);
        const heading = page.getByRole("heading", { name: "Mission complete" });
        await expect(heading).toBeVisible();
        await expect(heading).toBeFocused();
        await expect(main).toHaveAttribute("data-mission-phase", "review-scheduled");
        await expect(page.getByTestId("mission-phase")).toContainText("Review scheduled");
        await expect(page.locator("[data-status-region]")).toContainText("Mission complete");
    });
});
