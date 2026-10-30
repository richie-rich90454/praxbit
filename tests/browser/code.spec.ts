import { expect, test, type Page } from "@playwright/test";

async function openFirstCodeStep(page: Page, missionId: string): Promise<void> {
    await page.goto(`/missions/${missionId}`);
    await page.getByRole("button", { name: /start mission/i }).click();
    for (let attempt = 0; attempt < 10; attempt += 1) {
        if ((await page.locator(".cm-content").count()) > 0) {
            return;
        }
        const next = page.getByRole("button", { name: /^continue$/i });
        if ((await next.count()) === 0) {
            break;
        }
        await next.click();
    }
    await expect(page.locator(".cm-content").first()).toBeVisible();
}

async function replaceEditor(page: Page, source: string): Promise<void> {
    const editor = page.locator(".cm-content").first();
    await editor.click();
    await editor.fill(source);
}

async function runUntilAllPassed(
    page: Page,
    source: string,
    buttonName: RegExp = /run tests/i,
): Promise<void> {
    await replaceEditor(page, source);
    await page.getByRole("button", { name: buttonName }).click();
    await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible({
        timeout: 60_000,
    });
    await expect(page.locator("table").getByText("Fail")).toHaveCount(0);
    await expect(page.getByText("That works")).toBeVisible();
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

    test("browser TypeScript transpiles and runs behavioral tests", async function typescriptMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openFirstCodeStep(page, "typescript.generics");
        await runUntilAllPassed(
            page,
            "function firstOrNull<T>(items: readonly T[]): T | null {\n    return items[0] ?? null;\n}\n",
        );
    });

    test("Pyodide runs Python tests without a network fetch", async function pythonMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openFirstCodeStep(page, "python.collections");
        await runUntilAllPassed(
            page,
            'def summarize(orders):\n    count = 0\n    total = 0\n    for order in orders:\n        count += 1\n        total += order["total"]\n    return {"count": count, "total": total}\n',
        );
    });

    test("SQLite evaluates a real SQL query", async function sqlMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openFirstCodeStep(page, "sql.filter-orders");
        await runUntilAllPassed(
            page,
            "SELECT id, total_cents FROM orders WHERE total_cents >= 5000 ORDER BY total_cents DESC;\n",
        );
    });

    test("static analysis checks a language without a browser runtime", async function staticMission({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await openFirstCodeStep(page, "java.values");
        await runUntilAllPassed(
            page,
            "public class Main {\n    static int countPositive(int[] values) {\n        int count = 0;\n        for (int value : values) {\n            if (value > 0) {\n                count += 1;\n            }\n        }\n        return count;\n    }\n\n    public static void main(String[] args) {\n        System.out.println(countPositive(new int[] { 3, -1, 2 }));\n    }\n}\n",
            /run checks/i,
        );
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
        const output = page.getByLabel("Git output");
        for (const command of [
            "git log --oneline",
            "git checkout HEAD~1 -- src/store.js",
            "git status",
        ]) {
            await input.fill(command);
            await expect(input).toHaveValue(command);
            await input.press("Enter");
            await expect(output).toContainText(`$ ${command}`);
        }
        await page.getByRole("button", { name: /check repository/i }).click();
        await expect(page.getByText("That works")).toBeVisible();
    });

    test("the world screen presents an accessible system list and guards recovery", async function worldMission({
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
        const restart = page.getByRole("button", { name: "Restart service" });
        await expect(restart).toBeDisabled();
        await expect(page.getByText(/not a restartable service/i)).toBeVisible();

        await page.getByRole("button", { name: /Orders API/i }).click();
        await expect(page.getByRole("heading", { name: "Orders API" })).toBeVisible();
        await expect(page.getByText(/This system is healthy, so no restart action/i)).toBeVisible();
        await expect(page.getByRole("button", { name: "Restart service" })).toHaveCount(0);
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
