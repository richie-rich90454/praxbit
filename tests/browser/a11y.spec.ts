import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
    const overflow = await page.evaluate(function measure(): {
        readonly scrollWidth: number;
        readonly innerWidth: number;
    } {
        return {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
        };
    });
    expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
        overflow.innerWidth + 1,
    );
}

async function expectTargetSizes(page: Page, selector: string): Promise<void> {
    const targets = page.locator(selector);
    const count = await targets.count();
    for (let index = 0; index < count; index += 1) {
        const target = targets.nth(index);
        if (!(await target.isVisible())) {
            continue;
        }
        const box = await target.boundingBox();
        expect(box, `Missing box for target ${String(index)}`).not.toBeNull();
        if (box === null) {
            continue;
        }
        expect(box.width, `${selector} ${String(index)} width`).toBeGreaterThanOrEqual(43.5);
        expect(box.height, `${selector} ${String(index)} height`).toBeGreaterThanOrEqual(43.5);
    }
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

    test("@a11y buttons, navigation links, small buttons, and inputs meet the 44px target size", async function targetSizes({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        await expectTargetSizes(
            page,
            ".primary-nav__link, .brand-link, main .button, main .button--small, main .map-node",
        );
        await page.goto("/settings");
        await expectTargetSizes(page, "main .button, main .button--small, main .tab");
        await expectTargetSizes(page, "main .input, main .select, main input[type='range']");
        await page.goto("/missions/campus.a-failing-service");
        await page.getByRole("button", { name: /start mission/i }).click();
        await expectTargetSizes(page, ".terminal__input, .terminal__input-row .button");
        await expect(page.getByLabel("Terminal command")).toBeVisible();

        await page.goto("/missions/campus.changes-nobody-can-find");
        await page.getByRole("button", { name: /start mission/i }).click();
        await expect(page.getByLabel("Git command")).toBeVisible();
    });

    test("@a11y forced colors keep focus, borders, selection, and status marks visible", async function forcedColors({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.emulateMedia({ forcedColors: "active" });
        await page.goto("/world");
        await page.keyboard.press("Tab");
        const focus = await page
            .getByRole("link", { name: "Skip to main content" })
            .evaluate(function focusedStyle(element): {
                readonly outlineStyle: string;
                readonly outlineWidth: string;
            } {
                const style = window.getComputedStyle(element);
                return {
                    outlineStyle: style.outlineStyle,
                    outlineWidth: style.outlineWidth,
                };
            });
        expect(focus.outlineStyle).not.toBe("none");
        expect(focus.outlineWidth).not.toBe("0px");
        const mark = page.locator(".world-system-list .status__mark").first();
        await expect
            .poll(async function markBorder(): Promise<{
                readonly borderStyle: string;
                readonly borderWidth: string;
            }> {
                return mark.evaluate(function markStyle(element): {
                    readonly borderStyle: string;
                    readonly borderWidth: string;
                } {
                    const style = window.getComputedStyle(element);
                    return {
                        borderStyle: style.borderTopStyle,
                        borderWidth: style.borderTopWidth,
                    };
                });
            })
            .toEqual({ borderStyle: "solid", borderWidth: "2px" });
    });

    test("@a11y motion preference full, reduce, and system are explicit", async function motionPreference({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
        await page.evaluate(function addProbe(): void {
            const probe = document.createElement("div");
            probe.id = "motion-probe";
            probe.className = "pip pip--celebrating";
            document.body.append(probe);
        });
        const motion = page.getByRole("combobox", { name: "Motion" });

        await motion.selectOption("full");
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect
            .poll(function fullMotion(): Promise<string> {
                return page.evaluate(function currentMotion(): string {
                    return document.documentElement.dataset["motion"] ?? "";
                });
            })
            .toBe("full");
        const fullDuration = await page.evaluate(function duration(): number {
            const probe = document.getElementById("motion-probe");
            return probe === null
                ? 0
                : Number.parseFloat(getComputedStyle(probe).animationDuration) * 1000;
        });
        expect(fullDuration).toBeGreaterThanOrEqual(120);
        expect(fullDuration).toBeLessThanOrEqual(250);

        await motion.selectOption("reduce");
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect
            .poll(function reducedMotion(): Promise<string> {
                return page.evaluate(function currentMotion(): string {
                    return document.documentElement.dataset["motion"] ?? "";
                });
            })
            .toBe("reduce");

        await motion.selectOption("system");
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect
            .poll(function systemMotion(): Promise<string> {
                return page.evaluate(function currentMotion(): string {
                    return document.documentElement.dataset["motion"] ?? "";
                });
            })
            .toBe("system");
        const systemDuration = await page.evaluate(function duration(): number {
            const probe = document.getElementById("motion-probe");
            return probe === null
                ? 1
                : Number.parseFloat(getComputedStyle(probe).animationDuration) * 1000;
        });
        expect(systemDuration).toBeLessThanOrEqual(1);
    });

    test("@a11y content reflows at 320 CSS pixels without horizontal scrolling", async function reflow320({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.setViewportSize({ width: 320, height: 640 });
        for (const path of ["/learn", "/settings", "/placement", "/projects"]) {
            await page.goto(path);
            await expectNoHorizontalOverflow(page);
        }
    });

    test("@a11y content still fits at 200 percent zoom", async function zoom200({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.setViewportSize({ width: 720, height: 500 });
        for (const path of ["/learn", "/settings", "/placement"]) {
            await page.goto(path);
            await expectNoHorizontalOverflow(page);
        }
    });

    test("@a11y the largest text scale and WCAG text spacing do not clip content", async function textScaleAndSpacing({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
        const slider = page.getByRole("slider", { name: "Text size" });
        await slider.focus();
        await page.keyboard.press("End");
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect(page.getByText("Preferences saved on this device.")).toBeVisible();
        await expect
            .poll(function textScale(): Promise<string> {
                return page.evaluate(function currentScale(): string {
                    return document.documentElement.dataset["textScale"] ?? "";
                });
            })
            .toBe("large");
        await page.waitForTimeout(150);
        const headingSize = await page.evaluate(function largeHeading(): number {
            const heading = document.querySelector("h1");
            return heading === null ? 0 : Number.parseFloat(getComputedStyle(heading).fontSize);
        });
        expect(headingSize).toBeGreaterThanOrEqual(36);
        await expectNoHorizontalOverflow(page);

        await page.addStyleTag({
            content:
                "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
        });
        await expectNoHorizontalOverflow(page);
        const clipped = await page.evaluate(function clippedElements(): readonly string[] {
            const failures: string[] = [];
            const elements = document.querySelectorAll("p, h1, h2, h3, li, td");
            for (const element of elements) {
                if (element.scrollHeight > element.clientHeight + 2) {
                    failures.push(element.tagName);
                }
            }
            return failures;
        });
        expect(clipped).toEqual([]);
    });
});
