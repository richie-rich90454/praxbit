import { expect, test, type Page } from "@playwright/test";

async function replaceEditor(page: Page, source: string): Promise<void> {
    const editor = page.locator(".cm-content").first();
    await editor.click();
    await editor.fill(source);
}

test.describe("real programming environments", function codeSuite(): void {
    test("the browser JavaScript worker executes a repaired stock function", async function javascriptMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/campus.inventory-went-negative");
        await page.getByRole("button", { name: /start mission/i }).click();
        await replaceEditor(
            page,
            "function canFulfill(stock, quantity) {\n  return Number.isInteger(stock) && Number.isInteger(quantity) && stock >= 0 && quantity >= 1 && quantity <= stock;\n}\n",
        );
        await page.getByRole("button", { name: /run tests/i }).click();
        await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible();
        await expect(page.locator("table").getByText("Fail")).toHaveCount(0);
        await expect(page.getByText("That works")).toBeVisible();
    });

    test("the deterministic terminal recovers a failed service", async function terminalMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/campus.a-failing-service");
        await page.getByRole("button", { name: /start mission/i }).click();
        const input = page.locator("#terminal-recover-service");
        for (const command of [
            "journalctl -u orders-api",
            "ps",
            "kill 4242",
            "systemctl restart orders-api",
            "curl http://localhost:8080/health",
        ]) {
            await input.fill(command);
            await expect(input).toHaveValue(command);
            await input.press("Enter");
        }
        await expect(page.getByText("Complete: orders-api is running.")).toBeVisible();
        await page.getByRole("button", { name: /check objectives/i }).click();
        await expect(page.getByText("That works")).toBeVisible();
    });

    test("the in-browser Git repository restores a known-good file", async function gitMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/missions/campus.changes-nobody-can-find");
        await page.getByRole("button", { name: /start mission/i }).click();
        const input = page.locator("#git-command-restore-file");
        for (const command of [
            "git log --oneline",
            "git checkout HEAD~1 -- src/store.js",
            "git status",
        ]) {
            await input.fill(command);
            await expect(input).toHaveValue(command);
            await input.press("Enter");
        }
        await page.getByRole("button", { name: /check repository/i }).click();
        await expect(page.getByText("That works")).toBeVisible();
    });

    test("the world screen presents an accessible system list and records recovery", async function worldMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/world");
        await expect(page.getByRole("heading", { name: "Accessible system list" })).toBeVisible();
        await page
            .getByRole("button", { name: /Campus storefront/i })
            .first()
            .click();
        await expect(page.getByRole("heading", { name: "Campus storefront" })).toBeVisible();
        await page.getByRole("button", { name: "Restart service" }).click();
        await expect(page.getByText(/storefront service restarts/i)).toBeVisible();
    });

    test("a project stage runs real HTML and CSS checks", async function projectStage({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await page.goto("/projects/projects.campus-status-board");
        await expect(page.getByRole("heading", { name: "Campus status board" })).toBeVisible();
        await page.getByRole("button", { name: /run stage checks/i }).click();
        await expect(page.getByText("Pass").first()).toBeVisible();
    });
});
