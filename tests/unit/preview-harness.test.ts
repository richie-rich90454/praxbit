import { describe, expect, it } from "vitest";
import { buildPreviewDocument } from "../../packages/execution/src/browser/html-runner.ts";
import { domFrom } from "./support/jsdom.ts";
import type { PreviewOutcome } from "./support/jsdom.ts";

const files = {
    "index.html": `<!doctype html><html><body>
<button id="add" type="button">Add</button>
<p><span id="count">0</span></p>
<p id="status">Cart empty</p>
<script src="script.js"></script>
</body></html>`,
    "script.js": `let count = 0;
document.querySelector("#add").addEventListener("click", function () {
  count += 1;
  document.querySelector("#count").textContent = String(count);
  document.querySelector("#status").textContent = count === 1 ? "1 item" : count + " items";
});`,
};

interface PreviewMessage {
    readonly type?: string;
    readonly outcomes?: readonly PreviewOutcome[];
}

async function runChecks(checks: readonly unknown[]): Promise<readonly PreviewOutcome[]> {
    const dom = domFrom(buildPreviewDocument(files));
    try {
        return await new Promise<readonly PreviewOutcome[]>(function executor(resolve): void {
            const timer = setTimeout(function timeout(): void {
                resolve([{ description: "preview timeout", passed: false }]);
            }, 3000);
            dom.window.addEventListener("message", function onMessage(event): void {
                const message = event.data as PreviewMessage | undefined;
                if (message?.type === "praxbit-preview-result") {
                    clearTimeout(timer);
                    resolve(message.outcomes ?? []);
                }
            });
            dom.window.postMessage({ type: "praxbit-preview-run", checks }, "*");
        });
    } finally {
        dom.window.close();
    }
}

describe("browser preview harness", function previewHarness(): void {
    it("isolates click checks so mission 15 starts each test from zero", async function isolation(): Promise<void> {
        // The authored mission 15 expects one click and three clicks as separate checks.
        // Reusing one document makes the second check observe the first click.
        const outcomes = await runChecks([
            {
                kind: "dom",
                description: "One click.",
                selector: "#count",
                property: "text",
                click: "#add",
                expected: "1",
            },
            {
                kind: "dom",
                description: "Three clicks.",
                selector: "#count",
                property: "text",
                click: "#add",
                clickCount: 3,
                expected: "3",
            },
            {
                kind: "dom",
                description: "Singular status.",
                selector: "#status",
                property: "text",
                click: "#add",
                expected: "1 item",
            },
        ]);
        expect(
            outcomes.map(function passed(outcome): boolean {
                return outcome.passed;
            }),
        ).toEqual([true, true, true]);
    });
});
