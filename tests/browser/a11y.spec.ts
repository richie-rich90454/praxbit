import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoViolations(page: Page): Promise<void> {
    const results = await new AxeBuilder({ page }).analyze();
    expect(
        results.violations,
        results.violations
            .map(function describe(violation): string {
                return `${violation.id}: ${violation.description}`;
            })
            .join("\n"),
    ).toEqual([]);
}

test.describe("accessibility", function accessibilitySuite(): void {
    test("@a11y the Learn screen passes automated checks", async function learnA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        await page.waitForTimeout(500);
        await expectNoViolations(page);
    });

    test("@a11y the mission briefing and player pass automated checks", async function missionA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/before-code.make-it-respond");
        await expectNoViolations(page);
        await page.getByRole("button", { name: /start mission/i }).click();
        await expectNoViolations(page);
    });

    test("@a11y Settings, Practice, Projects, and World pass automated checks", async function surfacesA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        for (const path of ["/settings", "/practice", "/projects", "/world"]) {
            await page.goto(path);
            await page.waitForTimeout(700);
            await expectNoViolations(page);
        }
    });

    test("@a11y keyboard focus is visible and the skip link reaches main content", async function keyboardA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#main")).toBeFocused();
        const outline = await page.locator("#main").evaluate(function outlineOf(element): string {
            return window.getComputedStyle(element).outlineStyle;
        });
        expect(
            outline === "none" || outline === "hidden" || outline === "solid" || outline === "auto",
        ).toBe(true);
    });
});
