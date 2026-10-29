import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

interface SolutionDocument {
    readonly steps?: Readonly<Record<string, { readonly files: Readonly<Record<string, string>> }>>;
    readonly projects?: Readonly<
        Record<string, { readonly files: Readonly<Record<string, string>> }>
    >;
}

function readSolution(path: string): SolutionDocument {
    return JSON.parse(
        readFileSync(new URL(`../../content-solutions/${path}`, import.meta.url), "utf8"),
    ) as SolutionDocument;
}

async function openMissionCodeStep(page: Page, missionId: string): Promise<void> {
    await page.goto(`/missions/${missionId}`);
    await page.getByRole("button", { name: /start mission/i }).click();
    for (let attempt = 0; attempt < 10; attempt += 1) {
        if ((await page.locator(".cm-content").count()) > 0) {
            return;
        }
        await page.getByRole("button", { name: /^continue$/i }).click();
    }
    await expect(page.locator(".cm-content").first()).toBeVisible();
}

async function replaceEditor(page: Page, source: string): Promise<void> {
    const editor = page.locator(".cm-content").first();
    await editor.click();
    await editor.fill(source);
}

test.describe("browser-validated CSS checks", function cssChecksSuite(): void {
    test("the misplaced catalog mission passes every computed-style check", async function catalogCss({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        const solution = readSolution("campus.everything-is-misplaced.json");
        const files = solution.steps?.["repair-css"]?.files;
        if (files?.["styles.css"] === undefined) {
            throw new Error("The catalog CSS solution is missing.");
        }
        await openMissionCodeStep(page, "campus.everything-is-misplaced");
        await replaceEditor(page, files["styles.css"]);
        await page.getByRole("button", { name: /run tests/i }).click();
        await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible();
        await expect(page.locator("table").getByText("Fail")).toHaveCount(0);
        await expect(page.getByText("That works")).toBeVisible();
    });

    test("the status board layout stage passes every computed-style check", async function projectCss({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        const solution = readSolution("projects.json");
        const files = solution.projects?.["projects.campus-status-board"]?.files;
        if (files?.["index.html"] === undefined || files["styles.css"] === undefined) {
            throw new Error("The status board solution is missing.");
        }
        await page.goto("/projects/projects.campus-status-board");
        await page.getByRole("tab", { name: /Lay out the panels/i }).click();
        await page.getByRole("tab", { name: /^index\.html/ }).click();
        await replaceEditor(page, files["index.html"]);
        await page.getByRole("tab", { name: /^styles\.css/ }).click();
        await replaceEditor(page, files["styles.css"]);
        await page.getByRole("button", { name: /run stage checks/i }).click();
        await expect(page.getByRole("button", { name: /^run stage checks$/i })).toBeEnabled();
        await expect(page.locator("table").getByText("Fail")).toHaveCount(0);
        await expect(page.locator("table").getByText("Pass").first()).toBeVisible();
    });
});
