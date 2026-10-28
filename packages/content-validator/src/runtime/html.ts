import { JSDOM, VirtualConsole } from "jsdom";
import type { CodeTest } from "@praxbit/contracts";
import type { TestOutcome } from "../types.ts";
import { normalizedJson } from "./javascript.ts";

export type DomTest = Extract<CodeTest, { kind: "dom" }>;

function scalarText(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
        return String(value);
    }
    return normalizedJson(value);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildPreviewDocument(files: Readonly<Record<string, string>>): string {
    const entryName = Object.keys(files).find(function isHtml(filePath: string): boolean {
        return filePath.endsWith(".html");
    });
    let html =
        entryName === undefined
            ? "<!doctype html><html><body></body></html>"
            : (files[entryName] ?? "");

    for (const [filePath, content] of Object.entries(files)) {
        if (filePath.endsWith(".css")) {
            const linkPattern = new RegExp(
                `<link[^>]+href=["'](?:\\./)?${escapeRegExp(filePath)}["'][^>]*>`,
                "gi",
            );
            if (linkPattern.test(html)) {
                html = html.replace(linkPattern, `<style>${content}</style>`);
            } else if (!html.includes(`/* ${filePath} */`)) {
                html = html.replace("</head>", `<style>${content}</style></head>`);
            }
        }
        if (filePath.endsWith(".js")) {
            const scriptPattern = new RegExp(
                `<script[^>]+src=["'](?:\\./)?${escapeRegExp(filePath)}["'][^>]*>\\s*</script>`,
                "gi",
            );
            if (scriptPattern.test(html)) {
                html = html.replace(scriptPattern, `<script>${content}</script>`);
            } else if (!html.includes(`// ${filePath}`)) {
                html = html.replace("</body>", `<script>${content}</script></body>`);
            }
        }
    }

    return html;
}

export function normalizeText(value: string | null): string {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function runDomCheck(document: Document, test: DomTest): TestOutcome {
    if (test.click !== undefined) {
        const target = document.querySelector(test.click);
        if (target === null) {
            return {
                description: test.description,
                passed: false,
                deferred: false,
                error: `Click target not found: ${test.click}`,
            };
        }
        const count = test.clickCount ?? 1;
        for (let index = 0; index < count; index += 1) {
            const clickable = target as unknown as { click?(): void };
            if (typeof clickable.click === "function") {
                clickable.click();
            }
        }
    }

    if (test.property === "exists") {
        const exists = document.querySelector(test.selector) !== null;
        const passed = exists === test.expected;
        return {
            description: test.description,
            passed,
            deferred: false,
            actual: String(exists),
            ...(passed
                ? {}
                : {
                      error: `Expected exists=${scalarText(test.expected)}, received ${String(exists)}.`,
                  }),
        };
    }

    if (test.property === "count") {
        const total = document.querySelectorAll(test.selector).length;
        const passed = total === test.expected;
        return {
            description: test.description,
            passed,
            deferred: false,
            actual: String(total),
            ...(passed
                ? {}
                : { error: `Expected count ${scalarText(test.expected)}, received ${total}.` }),
        };
    }

    const element = document.querySelector(test.selector);
    if (element === null) {
        return {
            description: test.description,
            passed: false,
            deferred: false,
            error: `Element not found: ${test.selector}`,
        };
    }

    if (test.property === "text") {
        const text = normalizeText(element.textContent);
        const expected = normalizeText(scalarText(test.expected));
        const passed = text === expected;
        return {
            description: test.description,
            passed,
            deferred: false,
            actual: text,
            ...(passed ? {} : { error: `Expected text "${expected}", received "${text}".` }),
        };
    }

    if (test.property === "attribute") {
        if (test.attribute === undefined) {
            return {
                description: test.description,
                passed: false,
                deferred: false,
                error: "An attribute test requires an attribute name.",
            };
        }
        const attribute = element.getAttribute(test.attribute);
        const passed =
            test.expected === "not-empty"
                ? attribute !== null && normalizeText(attribute).length > 0
                : attribute === scalarText(test.expected);
        return {
            description: test.description,
            passed,
            deferred: false,
            actual: attribute ?? "(missing)",
            ...(passed
                ? {}
                : { error: `Attribute ${test.attribute} does not match the expected value.` }),
        };
    }

    return {
        description: test.description,
        passed: false,
        deferred: false,
        error: `Unknown DOM property: ${String(test.property)}`,
    };
}

export function runDomTests(
    files: Readonly<Record<string, string>>,
    tests: readonly DomTest[],
): TestOutcome[] {
    const outcomes: TestOutcome[] = [];
    const html = buildPreviewDocument(files);

    for (const test of tests) {
        const virtualConsole = new VirtualConsole();
        let runtimeError: string | undefined;
        virtualConsole.on("jsdomError", function onError(error: Error): void {
            runtimeError = error.message;
        });
        let dom: JSDOM | undefined;
        try {
            dom = new JSDOM(html, {
                runScripts: "dangerously",
                pretendToBeVisual: true,
                url: "https://praxbit.test/",
                virtualConsole,
            });
            const outcome = runDomCheck(dom.window.document, test);
            outcomes.push(
                runtimeError === undefined
                    ? outcome
                    : {
                          ...outcome,
                          passed: false,
                          error: `${outcome.error === undefined ? "" : `${outcome.error} `}Script error: ${runtimeError}`,
                      },
            );
        } catch (error) {
            outcomes.push({
                description: test.description,
                passed: false,
                deferred: false,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            dom?.window.close();
        }
    }

    return outcomes;
}

export function runCssDeferred(tests: readonly CodeTest[]): TestOutcome[] {
    return tests
        .filter(function isCss(test: CodeTest): boolean {
            return test.kind === "css";
        })
        .map(function deferred(test): TestOutcome {
            return {
                description: test.description,
                passed: false,
                deferred: true,
                error: "browser-validated separately: jsdom does not implement cascade-based computed styles or layout.",
            };
        });
}
