import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectNoViolations(
    page: Page,
    disabledRules: readonly string[] = [],
): Promise<void> {
    let builder = new AxeBuilder({ page });
    if (disabledRules.length > 0) {
        builder = builder.disableRules([...disabledRules]);
    }
    const results = await builder.analyze();
    expect(
        results.violations,
        results.violations
            .map(function describe(violation): string {
                return `${violation.id}: ${violation.description}`;
            })
            .join("\n"),
    ).toEqual([]);
}

async function expectPageStructure(page: Page): Promise<void> {
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
}

async function tabUntilFocused(page: Page, target: Locator, limit: number): Promise<void> {
    for (let attempt = 0; attempt < limit; attempt += 1) {
        await page.keyboard.press("Tab");
        const focused = await target.evaluate(function isFocused(element): boolean {
            return element === document.activeElement;
        });
        if (focused) {
            return;
        }
    }
    throw new Error("Keyboard focus did not reach the expected element.");
}

async function expectVisibleFocus(target: Locator): Promise<void> {
    const style = await target.evaluate(function measure(element): {
        readonly boxShadow: string;
        readonly outlineStyle: string;
        readonly outlineWidth: string;
    } {
        const computed = window.getComputedStyle(element);
        return {
            boxShadow: computed.boxShadow,
            outlineStyle: computed.outlineStyle,
            outlineWidth: computed.outlineWidth,
        };
    });
    const outlined = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
    const shadowed = style.boxShadow !== "none";
    expect(outlined || shadowed, JSON.stringify(style)).toBe(true);
}

async function completeOpeningMission(page: Page): Promise<void> {
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

test.describe("accessibility surfaces", function accessibilitySurfacesSuite(): void {
    test("@a11y Placement passes automated checks", async function placementA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/placement");
        await expect(
            page.getByRole("heading", { name: "I already know programming" }),
        ).toBeVisible();
        await expectPageStructure(page);
        await expectNoViolations(page);

        await page.getByRole("radio", { name: "Stores a value under a name" }).check();
        await expect(
            page.getByRole("radio", { name: "Stores a value under a name" }),
        ).toBeChecked();
        await expectPageStructure(page);
        await expectNoViolations(page);
    });

    test("@a11y Settings passes automated checks and shows visible keyboard focus", async function settingsA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/settings");
        for (const heading of ["Account", "Learning preferences", "Placement", "About Praxbit"]) {
            await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        }
        await expectPageStructure(page);
        await expectNoViolations(page);

        await page.getByRole("tab", { name: "Sign in", exact: true }).click();
        await expect(page.getByRole("tab", { name: "Sign in", exact: true })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await expectNoViolations(page);

        const handleInput = page.locator("input.input").first();
        await tabUntilFocused(page, handleInput, 20);
        await expect(handleInput).toBeFocused();
        await expectVisibleFocus(handleInput);

        const saveButton = page.getByRole("button", { name: "Save preferences" });
        await tabUntilFocused(page, saveButton, 40);
        await expect(saveButton).toBeFocused();
        await expectVisibleFocus(saveButton);
    });

    test("@a11y Projects and a project workspace pass automated checks", async function projectsA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/projects");
        await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
        await expectPageStructure(page);
        await expectNoViolations(page);

        await page.goto("/projects/projects.campus-status-board");
        await expect(
            page.getByRole("heading", { name: "Campus status board", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: "Brief", exact: true })).toBeVisible();
        await expectPageStructure(page);
        // The preview is a separate document with its own header and main landmarks.
        await expectNoViolations(page, ["landmark-unique"]);
    });

    test("@a11y the Club signed-out gate passes automated checks", async function clubA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/club");
        await expect(page.getByRole("heading", { name: "Clubs need an account" })).toBeVisible();
        await expect(
            page.getByRole("link", { name: /Create an account or sign in/i }),
        ).toBeVisible();
        await expectPageStructure(page);
        await expectNoViolations(page);
    });

    test("@a11y the not-found route passes automated checks", async function notFoundA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/this-page-does-not-exist");
        await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
        await expectPageStructure(page);
        await expectNoViolations(page);
    });

    test("@a11y the mission briefing and completion states pass automated checks", async function missionStatesA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/before-code.make-it-respond");
        await expect(page.getByRole("heading", { name: "Make it respond" })).toBeVisible();
        await expectPageStructure(page);
        await expectNoViolations(page);

        await completeOpeningMission(page);
        await expectPageStructure(page);
        await expectNoViolations(page);
    });
});
