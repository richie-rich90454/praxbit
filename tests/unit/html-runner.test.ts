import { describe, expect, it } from "vitest";
import {
    buildPreviewDocument,
    runCssDeferred,
    runDomTests,
} from "../../packages/content-validator/src/runtime/html.ts";
import type { CodeTest } from "../../packages/contracts/src/index.ts";

type DomTest = Extract<CodeTest, { kind: "dom" }>;

function page(script: string): Readonly<Record<string, string>> {
    return {
        "index.html": `<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body>
<main>
  <h1>Campus cart</h1>
  <p>Items: <span id="count">0</span></p>
  <p id="status" role="status">Cart empty</p>
  <button id="add" type="button">Add to cart</button>
</main>
<script src="script.js"></script>
</body></html>`,
        "styles.css": ".hidden { display: none; }",
        "script.js": script,
    };
}

const script = `const button = document.querySelector("#add");
const count = document.querySelector("#count");
const status = document.querySelector("#status");
let total = 0;
button.addEventListener("click", function () {
  total += 1;
  count.textContent = String(total);
  status.textContent = total === 1 ? "1 item" : total + " items";
});
`;

describe("buildPreviewDocument", function previewDocument(): void {
    it("inlines linked scripts and styles", function inline(): void {
        const document = buildPreviewDocument(page(script));
        expect(document).toContain("<style>.hidden { display: none; }</style>");
        expect(document).toContain("addEventListener");
        expect(document).not.toContain('src="script.js"');
    });

    it("appends unlinked assets before the closing body", function append(): void {
        const files = {
            "index.html": "<html><body><h1>Hi</h1></body></html>",
            "app.js": "console.log('x');",
        };
        const document = buildPreviewDocument(files);
        expect(document).toContain("<script>console.log('x');</script></body>");
    });
});

describe("runDomTests", function domRunner(): void {
    it("runs a script and observes a click", function click(): void {
        const tests: DomTest[] = [
            {
                kind: "dom",
                description: "One click increments.",
                selector: "#count",
                property: "text",
                click: "#add",
                expected: "1",
            },
            {
                kind: "dom",
                description: "One click uses singular.",
                selector: "#status",
                property: "text",
                click: "#add",
                expected: "1 item",
            },
        ];
        const outcomes = runDomTests(page(script), tests);
        expect(
            outcomes.map(function passed(outcome): boolean {
                return outcome.passed;
            }),
        ).toEqual([true, true]);
    });

    it("uses a fresh document for every test", function isolation(): void {
        const tests: DomTest[] = [
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
                description: "Two clicks.",
                selector: "#count",
                property: "text",
                click: "#add",
                clickCount: 2,
                expected: "2",
            },
        ];
        const outcomes = runDomTests(page(script), tests);
        expect(
            outcomes.map(function passed(outcome): boolean {
                return outcome.passed;
            }),
        ).toEqual([true, true]);
    });

    it("checks existence, count, attributes, and normalized text", function checks(): void {
        const tests: DomTest[] = [
            {
                kind: "dom",
                description: "Main exists.",
                selector: "main",
                property: "exists",
                expected: true,
            },
            {
                kind: "dom",
                description: "No aside.",
                selector: "aside",
                property: "exists",
                expected: false,
            },
            {
                kind: "dom",
                description: "One heading.",
                selector: "h1",
                property: "count",
                expected: 1,
            },
            {
                kind: "dom",
                description: "Button is labeled.",
                selector: "#add",
                property: "text",
                expected: "  Add   to cart ",
            },
            {
                kind: "dom",
                description: "Status role present.",
                selector: "#status",
                property: "attribute",
                attribute: "role",
                expected: "status",
            },
            {
                kind: "dom",
                description: "Button has a label.",
                selector: "#add",
                property: "attribute",
                attribute: "type",
                expected: "not-empty",
            },
        ];
        const outcomes = runDomTests(page(script), tests);
        expect(
            outcomes.filter(function failed(outcome): boolean {
                return !outcome.passed;
            }),
        ).toEqual([]);
    });

    it("fails cleanly when a click target is missing", function missingClick(): void {
        const tests: DomTest[] = [
            {
                kind: "dom",
                description: "Missing.",
                selector: "#count",
                property: "text",
                click: "#missing",
                expected: "1",
            },
        ];
        const outcomes = runDomTests(page(script), tests);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain("Click target not found");
    });

    it("defers CSS computed-style checks explicitly", function css(): void {
        const tests: CodeTest[] = [
            {
                kind: "css",
                description: "Display grid.",
                selector: "main",
                property: "display",
                expected: "grid",
            },
        ];
        const outcomes = runCssDeferred(tests);
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0]?.deferred).toBe(true);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain("browser-validated separately");
    });
});
