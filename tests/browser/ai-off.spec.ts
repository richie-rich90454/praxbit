import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

interface Capabilities {
    readonly aiTutor: boolean;
}

const AI_MISSION = JSON.parse(
    readFileSync(
        new URL("../../content/campaigns/campus/25-the-ai-says-it-is-fixed.json", import.meta.url),
        "utf8",
    ),
) as {
    readonly steps: readonly { readonly id: string; readonly hints?: readonly string[] }[];
};

function hintsForStep(stepId: string): readonly string[] {
    const step = AI_MISSION.steps.find(function same(item): boolean {
        return item.id === stepId;
    });
    if (step?.hints === undefined || step.hints.length !== 4) {
        throw new Error(`No four-level step hints for ${stepId}.`);
    }
    return step.hints;
}

async function replaceEditor(page: Page, source: string): Promise<void> {
    const editor = page.locator(".cm-content").first();
    await editor.click();
    await editor.fill(source);
}

test.describe("AI independence", function aiIndependence(): void {
    test("an AI-less server keeps curated hints working end to end", async function aiOff({
        page,
        request,
    }: {
        page: Page;
        request: APIRequestContext;
    }): Promise<void> {
        const capabilitiesResponse = await request.get("/api/v1/capabilities");
        expect(capabilitiesResponse.status()).toBe(200);
        expect(((await capabilitiesResponse.json()) as Capabilities).aiTutor).toBe(false);

        const hintRequests: string[] = [];
        const capabilityStatuses: number[] = [];
        const consoleErrors: string[] = [];
        page.on("request", function recordRequest(networkRequest): void {
            if (new URL(networkRequest.url()).pathname === "/api/v1/ai/hints") {
                hintRequests.push(networkRequest.url());
            }
        });
        page.on("response", function recordResponse(response): void {
            if (new URL(response.url()).pathname === "/api/v1/capabilities") {
                capabilityStatuses.push(response.status());
            }
        });
        page.on("console", function recordConsole(message): void {
            if (message.type() === "error") {
                consoleErrors.push(message.text());
            }
        });
        page.on("pageerror", function recordPageError(error): void {
            consoleErrors.push(error.message);
        });

        await page.goto("/settings");
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
        await expect
            .poll(function capabilitiesLoaded(): boolean {
                return capabilityStatuses.includes(200);
            })
            .toBe(true);
        await expect(
            page.getByText(
                "Curated hints are available offline. This server has no live AI provider configured.",
            ),
        ).toBeVisible();
        await expect(
            page.getByRole("checkbox", { name: /Allow live AI tutor requests/i }),
        ).toHaveCount(0);

        await page.goto("/missions/campus.the-ai-says-it-is-fixed");
        await expect(
            page.getByRole("heading", { name: "The AI says it is fixed", exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: /start mission/i }).click();
        await expect(
            page.getByRole("heading", { name: "Review the proposed patch", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: "Live AI tutor" })).toHaveCount(0);

        const hints = hintsForStep("ai-review");
        await page.getByRole("button", { name: "Show a hint" }).click();
        await expect(page.getByText(hints[0] ?? "", { exact: true })).toBeVisible();
        for (const hint of hints.slice(1)) {
            await page.getByRole("button", { name: "Next hint" }).click();
            await expect(page.getByText(hint, { exact: true })).toBeVisible();
        }
        await expect(page.getByText("Hint 4 of 4")).toBeVisible();

        await page.getByRole("checkbox", { name: "The function accepts quantity 0." }).check();
        await page
            .getByRole("checkbox", { name: "The function accepts negative quantities." })
            .check();
        await page
            .getByRole("checkbox", { name: "The claim rests on one ordinary input." })
            .check();
        await page
            .getByRole("radio", { name: "Reject and repair with complete boundary tests" })
            .check();
        await page.getByRole("button", { name: "Submit review" }).click();
        await expect(page.getByText("That works")).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(page.locator(".cm-content").first()).toBeVisible();
        await replaceEditor(
            page,
            "function canFulfill(stock, quantity) {\n  return Number.isInteger(stock) && Number.isInteger(quantity) && stock >= 0 && quantity >= 1 && quantity <= stock;\n}\n",
        );
        await page.getByRole("button", { name: /run tests/i }).click();
        await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible({
            timeout: 60_000,
        });
        await expect(page.locator("table").getByText("Fail")).toHaveCount(0);
        await expect(page.getByText("That works")).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(
            page.getByRole("heading", { name: "What counts as verification?", exact: true }),
        ).toBeVisible();
        await page
            .getByRole("checkbox", {
                name: "The reviewer should read the actual change rather than only the summary.",
            })
            .check();
        await page
            .getByRole("checkbox", {
                name: "Boundary and invalid inputs are necessary evidence for a range rule.",
            })
            .check();
        await page
            .getByRole("checkbox", {
                name: "The person accepting the change remains responsible for the outcome.",
            })
            .check();
        await page.getByRole("button", { name: "Submit selection" }).click();
        await expect(page.getByText("That works")).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible();

        expect(hintRequests).toEqual([]);
        expect(
            consoleErrors.filter(function mentionsAi(text): boolean {
                return /\bAI\b/i.test(text) || /aiTutor|\/api\/v1\/ai\//i.test(text);
            }),
        ).toEqual([]);
    });
});
