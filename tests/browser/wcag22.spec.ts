import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

const AUDITED_ROUTES = [
    "/learn",
    "/world",
    "/practice",
    "/projects",
    "/projects/projects.campus-status-board",
    "/club",
    "/settings",
    "/placement",
    "/missions/before-code.make-it-respond",
    "/missions/campus.the-button-does-nothing",
    "/this-page-does-not-exist",
] as const;

const TITLED_ROUTES = [
    { path: "/learn", title: "Learn · Praxbit" },
    { path: "/world", title: "World · Praxbit" },
    { path: "/practice", title: "Practice · Praxbit" },
    { path: "/projects", title: "Projects · Praxbit" },
    { path: "/projects/projects.campus-status-board", title: "Campus status board · Praxbit" },
    { path: "/club", title: "Club · Praxbit" },
    { path: "/settings", title: "Settings · Praxbit" },
    { path: "/placement", title: "Placement · Praxbit" },
    { path: "/missions/before-code.make-it-respond", title: "Make it respond · Praxbit" },
    {
        path: "/missions/campus.the-button-does-nothing",
        title: "The button does nothing · Praxbit",
    },
    { path: "/this-page-does-not-exist", title: "Page not found · Praxbit" },
] as const;

const TARGET_SELECTORS = [
    ".primary-nav__link",
    ".brand-link",
    ".footer-link",
    "main .button",
    "main .button--small",
    "main .tab",
    "main .method-tab",
    "main .map-node",
    "main .input",
    "main .select",
    "main input[type='range']",
    "main .choice",
    "main .world-system-list button",
] as const;

interface ContrastSpec {
    readonly label: string;
    readonly selector: string;
    readonly part: "border" | "text" | "background";
    readonly minimum: number;
}

interface ContrastSample {
    readonly label: string;
    readonly foreground: string;
    readonly background: string;
    readonly ratio: number;
    readonly minimum: number;
}

interface TargetBox {
    readonly label: string;
    readonly width: number;
    readonly height: number;
}

async function gotoAuditedPage(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
    const metrics = await page.evaluate(function measure(): {
        readonly documentWidth: number;
        readonly viewportWidth: number;
    } {
        return {
            documentWidth: Math.max(
                document.documentElement.scrollWidth,
                document.body.scrollWidth,
            ),
            viewportWidth: window.innerWidth,
        };
    });
    expect(metrics.documentWidth, `${label}: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(
        metrics.viewportWidth + 1,
    );
}

async function expectNoWcagViolations(page: Page): Promise<void> {
    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    const details = results.violations
        .map(function describeViolation(violation): string {
            const targets = violation.nodes
                .map(function describeNode(node): string {
                    return node.target.join(" ");
                })
                .join("\n  ");
            return `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n  ${targets}`;
        })
        .join("\n");
    expect(results.violations, details).toEqual([]);
}

async function expectNoClippedText(page: Page, label: string): Promise<void> {
    const clipped = await page.evaluate(function clippedText(): readonly string[] {
        const failures: string[] = [];
        const elements = document.querySelectorAll("p, h1, h2, h3, li, td, th");
        for (const element of elements) {
            if (element.scrollHeight > element.clientHeight + 2) {
                const text = (element.textContent ?? "").trim().slice(0, 80);
                failures.push(`${element.tagName}: ${text}`);
            }
        }
        return failures;
    });
    expect(clipped, label).toEqual([]);
}

async function collectTargetBoxes(page: Page, selector: string): Promise<readonly TargetBox[]> {
    return page
        .locator(selector)
        .evaluateAll(function measureTargets(elements): readonly TargetBox[] {
            const boxes: TargetBox[] = [];
            for (const element of elements) {
                const style = window.getComputedStyle(element);
                if (style.display === "none" || style.visibility === "hidden") {
                    continue;
                }
                const rect = element.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) {
                    continue;
                }
                boxes.push({
                    label: (element.textContent ?? "").trim().slice(0, 40),
                    width: Math.round(rect.width * 100) / 100,
                    height: Math.round(rect.height * 100) / 100,
                });
            }
            return boxes;
        });
}

async function expectVisibleFocus(target: Locator): Promise<void> {
    const style = await target.evaluate(function measureFocus(element): {
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

async function collectContrast(
    page: Page,
    specifications: readonly ContrastSpec[],
): Promise<readonly ContrastSample[]> {
    return page.evaluate(function measureContrast(
        specs: readonly ContrastSpec[],
    ): readonly ContrastSample[] {
        interface Rgba {
            readonly r: number;
            readonly g: number;
            readonly b: number;
            readonly a: number;
        }

        function parseColor(value: string): Rgba {
            const match = /rgba?\(([^)]+)\)/.exec(value);
            if (match === null) {
                return { r: 0, g: 0, b: 0, a: 1 };
            }
            const parts = (match[1] ?? "")
                .split(/[, /]+/)
                .filter(function nonEmpty(part): boolean {
                    return part.length > 0;
                })
                .map(Number);
            return {
                r: parts[0] ?? 0,
                g: parts[1] ?? 0,
                b: parts[2] ?? 0,
                a: parts[3] ?? 1,
            };
        }

        function opaque(color: Rgba, base: Rgba): Rgba {
            return {
                r: color.r * color.a + base.r * (1 - color.a),
                g: color.g * color.a + base.g * (1 - color.a),
                b: color.b * color.a + base.b * (1 - color.a),
                a: 1,
            };
        }

        function backgroundColorOf(element: Element | null): Rgba {
            let current = element;
            while (current !== null) {
                const color = parseColor(window.getComputedStyle(current).backgroundColor);
                if (color.a > 0) {
                    return color.a >= 1 ? color : opaque(color, { r: 255, g: 255, b: 255, a: 1 });
                }
                current = current.parentElement;
            }
            return { r: 255, g: 255, b: 255, a: 1 };
        }

        function channel(value: number): number {
            const normalized = value / 255;
            return normalized <= 0.03928
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
        }

        function luminance(color: Rgba): number {
            return (
                0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
            );
        }

        function contrastRatio(foreground: Rgba, background: Rgba): number {
            const first = luminance(foreground);
            const second = luminance(background);
            return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        }

        function cssColor(color: Rgba): string {
            return `rgb(${String(Math.round(color.r))}, ${String(Math.round(color.g))}, ${String(
                Math.round(color.b),
            )})`;
        }

        function visible(element: Element): boolean {
            if (element.matches(":disabled, [aria-disabled='true']")) {
                return false;
            }
            const style = window.getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden") {
                return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        const samples: ContrastSample[] = [];
        for (const spec of specs) {
            const candidates = document.querySelectorAll(spec.selector);
            let element: Element | undefined;
            for (const candidate of candidates) {
                if (visible(candidate)) {
                    element = candidate;
                    break;
                }
            }
            if (element === undefined) {
                continue;
            }
            const style = window.getComputedStyle(element);
            const foreground =
                spec.part === "text"
                    ? parseColor(style.color)
                    : spec.part === "border"
                      ? parseColor(style.borderTopColor)
                      : parseColor(style.backgroundColor);
            const background =
                spec.part === "background"
                    ? backgroundColorOf(element.parentElement ?? document.body)
                    : backgroundColorOf(element);
            samples.push({
                label: spec.label,
                foreground: cssColor(foreground),
                background: cssColor(background),
                ratio: contrastRatio(foreground, background),
                minimum: spec.minimum,
            });
        }
        return samples;
    }, specifications);
}

async function openMission(page: Page, missionId: string): Promise<void> {
    await page.goto(`/missions/${missionId}`);
    await page.getByRole("button", { name: /start mission/i }).click();
}

async function completeMachineStep(page: Page): Promise<void> {
    await page.locator("#machine-stamp-count").fill("3");
    await page.getByRole("button", { name: /run machine/i }).click();
    await page.locator("#machine-stamp-count").fill("4");
    await page.getByRole("button", { name: /run machine/i }).click();
    await page.getByRole("radio", { name: "4 marks" }).check();
    await page.getByRole("radio", { name: "CAMPUS", exact: true }).check();
    await page.getByRole("button", { name: /check prediction/i }).click();
}

test.describe("WCAG 2.2 AA internal audit", function wcag22Suite(): void {
    test("@wcag22 @2.4.2 every route sets a meaningful document title", async function routeTitles({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/");
        await expect(page).toHaveURL(/\/missions\/before-code\.make-it-respond$/);
        await expect(page).toHaveTitle("Make it respond · Praxbit");

        for (const route of TITLED_ROUTES) {
            await gotoAuditedPage(page, route.path);
            await expect(page).toHaveTitle(route.title);
        }
    });

    test("@wcag22 @1.3.1 @2.4.1 @2.4.3 @2.4.6 pages expose one h1, one main, stable landmarks, and no positive tabindex", async function pageStructure({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        for (const path of AUDITED_ROUTES) {
            await gotoAuditedPage(page, path);
            await expect(page.getByRole("main"), path).toHaveCount(1);
            await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(1);
            await expect(page.getByRole("navigation", { name: "Primary" }), path).toHaveCount(1);
            await expect(page.locator("header"), path).toHaveCount(1);
            await expect(page.locator("footer"), path).toHaveCount(1);
            await expect(page.locator("#main"), path).toHaveAttribute("tabindex", "-1");
            const positiveTabindex = await page
                .locator("[tabindex]")
                .evaluateAll(function countPositive(elements): number {
                    return elements.filter(function positive(element): boolean {
                        return Number(element.getAttribute("tabindex")) > 0;
                    }).length;
                });
            expect(positiveTabindex, path).toBe(0);
        }
    });

    test("@wcag22 @1.4.4 @1.4.10 200 percent browser zoom keeps audited routes free of horizontal scrolling", async function zoom200({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.setViewportSize({ width: 720, height: 500 });
        for (const path of AUDITED_ROUTES) {
            await gotoAuditedPage(page, path);
            await expectNoHorizontalOverflow(page, `200% zoom ${path}`);
        }
    });

    test("@wcag22 @1.4.10 320 CSS pixel reflow keeps audited routes free of horizontal scrolling", async function reflow320({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.setViewportSize({ width: 320, height: 640 });
        for (const path of AUDITED_ROUTES) {
            await gotoAuditedPage(page, path);
            await expectNoHorizontalOverflow(page, `320px ${path}`);
        }
    });

    test("@wcag22 @1.4.12 text spacing overrides do not clip text or create horizontal scrolling", async function textSpacing({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        for (const path of ["/learn", "/settings", "/placement"] as const) {
            await gotoAuditedPage(page, path);
            await page.addStyleTag({
                content:
                    "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
            });
            await expectNoHorizontalOverflow(page, `text spacing ${path}`);
            await expectNoClippedText(page, `text spacing ${path}`);
        }
    });

    test("@wcag22 @1.4.4 the in-app 1.4 text scale setting applies large text without clipping", async function textScale14({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
        const slider = page.getByRole("slider", { name: "Text size" });
        await expect(slider).toHaveAttribute("max", "1.4");
        await slider.focus();
        await page.keyboard.press("End");
        await expect(slider).toHaveValue("1.4");
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect
            .poll(function textScale(): Promise<string> {
                return page.evaluate(function currentScale(): string {
                    return document.documentElement.dataset["textScale"] ?? "";
                });
            })
            .toBe("large");
        const rootFontSize = await page.evaluate(function rootSize(): number {
            return Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
        });
        expect(rootFontSize).toBeGreaterThan(16);
        await expectNoHorizontalOverflow(page, "text scale 1.4");
        await expectNoClippedText(page, "text scale 1.4");
    });

    test("@wcag22 @1.4.3 @1.4.11 text and non-text colors meet AA contrast", async function contrast({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
        const settingsSamples = await collectContrast(page, [
            { label: "Input border", selector: "main .input", part: "border", minimum: 3 },
            { label: "Select border", selector: "main .select", part: "border", minimum: 3 },
            {
                label: "Secondary button border",
                selector: "main .button--secondary",
                part: "border",
                minimum: 3,
            },
            {
                label: "Primary button fill",
                selector: "main .button",
                part: "background",
                minimum: 3,
            },
            {
                label: "Selected tab indicator",
                selector: "main .tab[aria-selected='true']",
                part: "border",
                minimum: 3,
            },
            { label: "Body text", selector: "main p", part: "text", minimum: 4.5 },
            { label: "Meta text", selector: "main .meta", part: "text", minimum: 4.5 },
            { label: "Link text", selector: "main a:not(.button)", part: "text", minimum: 4.5 },
        ]);
        expect(settingsSamples.length).toBeGreaterThan(0);
        for (const sample of settingsSamples) {
            expect(
                sample.ratio,
                `${sample.label}: ${sample.foreground} on ${sample.background}`,
            ).toBeGreaterThanOrEqual(sample.minimum);
        }

        await page.goto("/world");
        await expect(page.getByRole("heading", { name: "Campus systems" })).toBeVisible();
        const worldSamples = await collectContrast(page, [
            {
                label: "Success status text",
                selector: ".status--success",
                part: "text",
                minimum: 4.5,
            },
            {
                label: "Warning status text",
                selector: ".status--warning",
                part: "text",
                minimum: 4.5,
            },
            { label: "Status mark border", selector: ".status__mark", part: "border", minimum: 3 },
        ]);
        expect(worldSamples.length).toBeGreaterThan(0);
        for (const sample of worldSamples) {
            expect(
                sample.ratio,
                `${sample.label}: ${sample.foreground} on ${sample.background}`,
            ).toBeGreaterThanOrEqual(sample.minimum);
        }
    });

    test("@wcag22 @2.5.8 interactive controls meet 24px WCAG and 44px project target sizes", async function targetSizes({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        for (const path of [
            "/learn",
            "/world",
            "/settings",
            "/placement",
            "/projects/projects.campus-status-board",
        ] as const) {
            await gotoAuditedPage(page, path);
            for (const selector of TARGET_SELECTORS) {
                const boxes = await collectTargetBoxes(page, selector);
                for (const box of boxes) {
                    const detail = `${path} ${selector} "${box.label}"`;
                    expect(box.width, `${detail} WCAG width`).toBeGreaterThanOrEqual(24);
                    expect(box.height, `${detail} WCAG height`).toBeGreaterThanOrEqual(24);
                    expect(box.width, `${detail} project width`).toBeGreaterThanOrEqual(44);
                    expect(box.height, `${detail} project height`).toBeGreaterThanOrEqual(44);
                }
            }
        }
    });

    test("@wcag22 @2.4.1 @2.4.7 the skip link is first, visible on focus, and focuses main content", async function skipLink({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await gotoAuditedPage(page, "/learn");
        await page.keyboard.press("Tab");
        const skip = page.getByRole("link", { name: "Skip to main content" });
        await expect(skip).toBeFocused();
        await expectVisibleFocus(skip);
        await page.keyboard.press("Enter");
        await expect(page.locator("#main")).toBeFocused();
    });

    test("@wcag22 @2.4.3 focus moves to main after a route change", async function routeFocus({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        await page.getByRole("link", { name: "World", exact: true }).click();
        await expect(page).toHaveURL(/\/world$/);
        await expect(page).toHaveTitle("World · Praxbit");
        await expect(page.locator("#main")).toBeFocused();

        await page.getByRole("link", { name: "Settings", exact: true }).click();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(page).toHaveTitle("Settings · Praxbit");
        await expect(page.locator("#main")).toBeFocused();
    });

    test("@wcag22 @2.4.3 @2.4.7 focus moves to the step heading after mission step changes", async function stepFocus({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openMission(page, "before-code.make-it-respond");
        const heading = page.locator("h1").first();
        await expect(heading).toHaveText("The unlabeled stamp press");
        await expect(heading).toBeFocused();

        await completeMachineStep(page);
        await expect(page.locator(".feedback[role='status']")).toContainText("That works");
        // Step evidence is recorded asynchronously; let the click handler settle before advancing.
        await page.waitForTimeout(500);
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.locator("h1").first()).toHaveText("Name the three parts");
        await expect(page.locator("h1").first()).toBeFocused();
    });

    test("@wcag22 @4.1.3 live regions announce route changes, saved preferences, and mission feedback", async function liveRegions({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/learn");
        await page.getByRole("link", { name: "World", exact: true }).click();
        await expect(page.locator("[data-status-region]")).toContainText("World · Praxbit");

        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect(
            page.getByRole("status").filter({ hasText: "Preferences saved on this device." }),
        ).toBeVisible();

        await openMission(page, "before-code.make-it-respond");
        await completeMachineStep(page);
        const feedback = page.locator(".feedback[role='status']");
        await expect(feedback).toContainText("That works");
    });

    test("@wcag22 @2.1.1 @2.5.8 tab lists support arrow, Home, and End keys with a roving tab stop", async function tabKeys({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/projects/projects.campus-status-board");
        const tabs = page.getByRole("tablist", { name: "Project stages" });
        const first = tabs.getByRole("tab").first();
        await first.focus();
        await page.keyboard.press("ArrowRight");
        await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(tabs.getByRole("tab").nth(1)).toBeFocused();
        await page.keyboard.press("End");
        await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
        await expect(tabs.getByRole("tab").last()).toBeFocused();
        await page.keyboard.press("Home");
        await expect(tabs.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
        await expect(tabs.getByRole("tab").first()).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
        await expect(tabs.getByRole("tab").last()).toHaveAttribute("tabindex", "0");
        await expect(first).toHaveAttribute("tabindex", "-1");
    });

    test("@wcag22 @1.4.11 forced colors keep focus and status marks visible", async function forcedColors({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.emulateMedia({ forcedColors: "active" });
        await page.goto("/world");
        await expect(page.getByRole("heading", { name: "Campus systems" })).toBeVisible();
        await page.keyboard.press("Tab");
        const skip = page.getByRole("link", { name: "Skip to main content" });
        await expect(skip).toBeFocused();
        await expectVisibleFocus(skip);
        const mark = page.locator(".world-system-list .status__mark").first();
        await expect
            .poll(async function markBorder(): Promise<{
                readonly borderStyle: string;
                readonly borderWidth: number;
            }> {
                return mark.evaluate(function markStyle(element): {
                    readonly borderStyle: string;
                    readonly borderWidth: number;
                } {
                    const computed = window.getComputedStyle(element);
                    return {
                        borderStyle: computed.borderTopStyle,
                        borderWidth: Number.parseFloat(computed.borderTopWidth),
                    };
                });
            })
            .toEqual({ borderStyle: "solid", borderWidth: 2 });
    });

    test("@wcag22 @2.2.2 @2.3.1 reduced motion removes non-essential animation and no flashing content is present", async function reducedMotion({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
        await page.evaluate(function addProbe(): void {
            const probe = document.createElement("div");
            probe.id = "wcag-motion-probe";
            probe.className = "pip pip--celebrating";
            document.body.append(probe);
        });
        const reduced = await page.evaluate(function reducedStyle(): {
            readonly duration: number;
            readonly iterations: string;
        } {
            const probe = document.getElementById("wcag-motion-probe");
            if (probe === null) {
                return { duration: 0, iterations: "0" };
            }
            const computed = window.getComputedStyle(probe);
            return {
                duration: Number.parseFloat(computed.animationDuration) * 1000,
                iterations: computed.animationIterationCount,
            };
        });
        expect(reduced.duration).toBeLessThanOrEqual(1);
        expect(reduced.iterations).toBe("1");

        const flashing = await page.evaluate(function flashingElements(): number {
            return document.querySelectorAll("blink, marquee, video[autoplay]").length;
        });
        expect(flashing).toBe(0);

        await page.getByRole("combobox", { name: "Motion" }).selectOption("full");
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect
            .poll(function fullMotion(): Promise<string> {
                return page.evaluate(function currentMotion(): string {
                    return document.documentElement.dataset["motion"] ?? "";
                });
            })
            .toBe("full");
        const fullDuration = await page.evaluate(function fullStyle(): number {
            const probe = document.getElementById("wcag-motion-probe");
            return probe === null
                ? 0
                : Number.parseFloat(window.getComputedStyle(probe).animationDuration) * 1000;
        });
        expect(fullDuration).toBeGreaterThanOrEqual(120);
        expect(fullDuration).toBeLessThanOrEqual(250);
    });

    test("@wcag22 @1.3.1 @2.4.6 @4.1.2 axe finds no WCAG 2.2 A or AA violations on audited routes", async function axeRoutes({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        for (const path of AUDITED_ROUTES) {
            await gotoAuditedPage(page, path);
            await page.waitForTimeout(250);
            await expectNoWcagViolations(page);
        }
    });

    test("@wcag22 @1.3.1 @3.3.1 @4.1.2 @4.1.3 axe finds no violations in interactive states", async function axeStates({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
        await page.getByRole("tab", { name: "Sign in", exact: true }).click();
        await expectNoWcagViolations(page);

        await page.goto("/placement");
        const groups = page.locator("fieldset");
        const groupCount = await groups.count();
        for (let index = 0; index < groupCount; index += 1) {
            await groups.nth(index).getByRole("radio").first().check();
        }
        await page.getByRole("button", { name: /see suggested start/i }).click();
        await expect(page.getByRole("heading", { name: "Suggested start" })).toBeVisible();
        await expectNoWcagViolations(page);

        await openMission(page, "before-code.make-it-respond");
        await expectNoWcagViolations(page);

        await page.goto("/projects/projects.campus-status-board");
        await page.getByRole("tab").nth(1).click();
        await expectNoWcagViolations(page);
    });
});
