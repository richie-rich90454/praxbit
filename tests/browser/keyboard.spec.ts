import { expect, test, type Page } from "@playwright/test";

async function openMission(page: Page, missionId: string): Promise<void> {
    await page.goto(`/missions/${missionId}`);
    await page.getByRole("button", { name: /start mission/i }).click();
}

async function focusedText(page: Page): Promise<string> {
    return page.evaluate(function activeText(): string {
        const active = document.activeElement;
        return active === null ? "" : (active.textContent ?? "").trim();
    });
}

test.describe("keyboard and focus", function keyboardSuite(): void {
    test("@a11y Tab exits the CodeMirror editor", async function tabExitsEditor({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openMission(page, "campus.inventory-went-negative");
        await expect(page.getByText(/Tab leaves the editor/i)).toBeVisible();
        await expect(page.getByText(/Ctrl\/Cmd\+\] indents/i)).toBeVisible();
        const editor = page.locator(".cm-content").first();
        await editor.click();
        await expect(editor).toBeFocused();
        await page.keyboard.press("Tab");
        const stillInside = await page.evaluate(function insideEditor(): boolean {
            const active = document.activeElement;
            return active !== null && active.closest(".cm-editor") !== null;
        });
        expect(stillInside).toBe(false);
    });

    test("@a11y the step heading receives focus on every step change", async function stepFocus({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openMission(page, "before-code.make-it-respond");
        const heading = page.locator("h1").first();
        await expect(heading).toHaveText("The unlabeled stamp press");
        await expect(heading).toBeFocused();

        await page.locator("#machine-stamp-count").fill("3");
        await page.getByRole("button", { name: /run machine/i }).click();
        await page.locator("#machine-stamp-count").fill("4");
        await page.getByRole("button", { name: /run machine/i }).click();
        await page.getByRole("radio", { name: "4 marks" }).check();
        await page.getByRole("radio", { name: "CAMPUS", exact: true }).check();
        await page.getByRole("button", { name: /check prediction/i }).click();
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(page.locator("h1").first()).toHaveText("Name the three parts");
        await expect(page.locator("h1").first()).toBeFocused();
    });

    test("@a11y mission completion focuses the completion heading and announces", async function completionFocus({
        page,
    }: {
        page: Page;
    }): Promise<void> {
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

        const heading = page.getByRole("heading", { name: "Mission complete" });
        await expect(heading).toBeVisible();
        await expect(heading).toBeFocused();
        await expect(page.locator("[data-status-region]")).toContainText("Mission complete");
    });

    test("@a11y SPA route changes set the title and focus the main landmark", async function routeFocus({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        await expect(page).toHaveTitle("Learn · Praxbit");
        await page.getByRole("link", { name: "World", exact: true }).click();
        await expect(page).toHaveURL(/\/world$/);
        await expect(page).toHaveTitle("World · Praxbit");
        await expect(page.locator("#main")).toBeFocused();

        await page.getByRole("link", { name: "Settings", exact: true }).click();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(page).toHaveTitle("Settings · Praxbit");
        await expect(page.locator("#main")).toBeFocused();
    });

    test("@a11y project stage changes move focus to the stage heading", async function stageFocus({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/projects/projects.campus-status-board");
        const tabs = page.getByRole("tablist", { name: "Project stages" });
        await tabs.getByRole("tab").nth(1).click();
        await expect(page.getByRole("heading", { name: "Make the table readable" })).toBeFocused();
    });

    test("@a11y tab lists support arrow, Home, and End keys", async function tabKeys({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/projects/projects.campus-status-board");
        const stageTabs = page.getByRole("tablist", { name: "Project stages" });
        const first = stageTabs.getByRole("tab").first();
        await first.focus();
        await page.keyboard.press("ArrowRight");
        await expect(stageTabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(stageTabs.getByRole("tab").nth(1)).toBeFocused();
        await page.keyboard.press("End");
        await expect(stageTabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
        await expect(stageTabs.getByRole("tab").last()).toBeFocused();
        await page.keyboard.press("Home");
        await expect(stageTabs.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
        await expect(stageTabs.getByRole("tab").first()).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await expect(stageTabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
    });

    test("@a11y code file tabs support arrow keys and keep one roving tab stop", async function codeTabKeys({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openMission(page, "campus.the-button-does-nothing");
        const tabs = page.getByRole("tablist", { name: "Project files" });
        const first = tabs.getByRole("tab").first();
        await first.focus();
        await page.keyboard.press("ArrowRight");
        await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(tabs.getByRole("tab").nth(1)).toBeFocused();
        await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("tabindex", "0");
        await expect(first).toHaveAttribute("tabindex", "-1");
    });

    test("@a11y ordering preserves focus and announces the new position", async function orderingFocus({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openMission(page, "before-code.give-better-instructions");
        await page
            .getByRole("button", {
                name: "Move Lift the parcel from the loading shelf down",
            })
            .click();
        await expect(page.locator("[data-status-region]")).toContainText(
            "Lift the parcel from the loading shelf moved to position 2 of 5.",
        );
        const focused = await focusedText(page);
        expect(focused).toContain("Lift the parcel from the loading shelf");
        const list = page.locator("ol[aria-label='Ordered steps'] li");
        await expect(list.nth(1)).toContainText("Lift the parcel from the loading shelf");
        await expect(list.nth(0)).toContainText("Turn right 90 degrees");
    });

    test("@a11y running tests announces the result without moving focus", async function resultAnnouncement({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openMission(page, "campus.inventory-went-negative");
        const editor = page.locator(".cm-content").first();
        await editor.fill(
            "function canFulfill(stock, quantity) {\n  return Number.isInteger(stock) && Number.isInteger(quantity) && stock >= 0 && quantity >= 1 && quantity <= stock;\n}\n",
        );
        await page.getByRole("button", { name: /run tests/i }).click();
        await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible();
        await expect(page.locator("[data-status-region]")).toContainText("7 of 7 checks passed.");
    });
});
