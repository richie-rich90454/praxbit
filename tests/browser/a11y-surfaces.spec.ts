import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page): Promise<void> {
    await page.evaluate(async function fontsReady(): Promise<void> {
        await document.fonts.ready;
    });
    await page.waitForFunction(function stylesReady(): boolean {
        return (
            getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().length >
            0
        );
    });
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
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
    await expect(page.locator(".feedback[role='status']")).toContainText("That works");
    // Step evidence is recorded asynchronously; wait for the step to settle before advancing.
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("h1").first()).toHaveText("Name the three parts");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("h1").first()).toHaveText("Which part processes?");
    await page.getByRole("radio", { name: /controller/i }).check();
    await page.getByRole("button", { name: /check answer/i }).click();
    await expect(page.locator(".feedback[role='status']")).toContainText("That works");
    await page.waitForTimeout(500);
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
        await expectNoViolations(page);
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

    test("@a11y Placement results pass automated checks", async function placementResultsA11y({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/placement");
        const groups = page.locator("fieldset");
        const count = await groups.count();
        for (let index = 0; index < count; index += 1) {
            await groups.nth(index).getByRole("radio").first().check();
        }
        await page.getByRole("button", { name: /see suggested start/i }).click();
        await expect(page.getByRole("heading", { name: "Suggested start" })).toBeVisible();
        await expectNoViolations(page);
    });

    test("@a11y code and project tabs expose complete tab semantics", async function tabsSemantics({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/campus.the-button-does-nothing");
        await page.getByRole("button", { name: /start mission/i }).click();
        const codeTabs = page.getByRole("tablist", { name: "Project files" });
        const tabCount = await codeTabs.getByRole("tab").count();
        expect(tabCount).toBeGreaterThan(1);
        for (let index = 0; index < tabCount; index += 1) {
            const tab = codeTabs.getByRole("tab").nth(index);
            const controls = await tab.getAttribute("aria-controls");
            expect(controls).not.toBeNull();
            if (controls !== null) {
                await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);
                await expect(page.locator(`[id="${controls}"]`)).toHaveAttribute(
                    "role",
                    "tabpanel",
                );
            }
        }
        await expectNoViolations(page);

        await page.goto("/projects/projects.campus-status-board");
        const stageTabs = page.getByRole("tablist", { name: "Project stages" });
        await expect(stageTabs.getByRole("tab").first()).toHaveAttribute("tabindex", "0");
        await expect(stageTabs.getByRole("tab").nth(1)).toHaveAttribute("tabindex", "-1");
        const stageControls = await stageTabs
            .getByRole("tab")
            .first()
            .getAttribute("aria-controls");
        expect(stageControls).not.toBeNull();
        if (stageControls !== null) {
            await expect(page.locator(`[id="${stageControls}"]`)).toHaveAttribute(
                "role",
                "tabpanel",
            );
        }
        await expectNoViolations(page);
    });

    test("@a11y CodeView and BinaryView tables have captions", async function tableCaptions({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/campus.inventory-went-negative");
        await page.getByRole("button", { name: /start mission/i }).click();
        await page.getByRole("button", { name: /run tests/i }).click();
        await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible();
        await expect(
            page.locator("table").filter({ hasText: "Test results" }).locator("caption"),
        ).toHaveCount(1);
        await expectNoViolations(page);

        await page.goto("/missions/before-code.everything-is-information");
        await page.getByRole("button", { name: /start mission/i }).click();
        await expect(
            page.locator("table caption", { hasText: "Binary reference values" }),
        ).toHaveCount(1);
        await expectNoViolations(page);
    });
});
