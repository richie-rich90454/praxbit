export interface DomCheck {
    readonly kind: "dom";
    readonly description: string;
    readonly selector: string;
    readonly property: "exists" | "text" | "count" | "attribute";
    readonly attribute?: string;
    readonly click?: string;
    readonly clickCount?: number;
    readonly expected: unknown;
}

export interface CssCheck {
    readonly kind: "css";
    readonly description: string;
    readonly selector: string;
    readonly property: string;
    readonly expected: string;
}

export type PreviewCheck = DomCheck | CssCheck;

export interface PreviewCheckOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: string;
    readonly error?: string;
}

export interface PreviewTestReport {
    readonly outcomes: readonly PreviewCheckOutcome[];
    readonly timedOut: boolean;
}

const HARNESS_SCRIPT = String.raw`
<script id="praxbit-harness">
(function () {
    var initialMarkup = null;
    function captureInitialMarkup() {
        var clone = document.body.cloneNode(true);
        var harness = clone.querySelector("#praxbit-harness");
        if (harness) {
            harness.remove();
        }
        initialMarkup = clone.innerHTML;
    }
    function resetDocument() {
        if (initialMarkup === null) {
            return;
        }
        document.body.innerHTML = initialMarkup;
        var scripts = document.body.querySelectorAll("script");
        for (var index = 0; index < scripts.length; index += 1) {
            try {
                new Function(scripts[index].textContent || "")();
            } catch (error) {
                // A script that failed during reset is reported by the next check.
            }
        }
    }
    function normalizeText(value) {
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    }
    function runCheck(check) {
        if (check.click) {
            var button = document.querySelector(check.click);
            if (!button) {
                return { description: check.description, passed: false, error: "Click target not found: " + check.click };
            }
            var count = check.clickCount || 1;
            for (var i = 0; i < count; i += 1) {
                button.click();
            }
        }
        var element = document.querySelector(check.selector);
        if (check.kind === "css") {
            if (!element) {
                return { description: check.description, passed: false, error: "Element not found: " + check.selector };
            }
            var style = window.getComputedStyle(element);
            var computed = style.getPropertyValue(check.property);
            if (!computed) {
                var camel = check.property.replace(/-([a-z])/g, function (_match, letter) {
                    return letter.toUpperCase();
                });
                computed = style[camel] || "";
            }
            var actualCss = String(computed).replace(/\s+/g, " ").trim();
            return {
                description: check.description,
                passed: actualCss === String(check.expected),
                actual: actualCss
            };
        }
        if (check.property === "exists") {
            var exists = element !== null;
            return { description: check.description, passed: exists === check.expected, actual: String(exists) };
        }
        if (!element) {
            return { description: check.description, passed: false, error: "Element not found: " + check.selector };
        }
        if (check.property === "count") {
            var total = document.querySelectorAll(check.selector).length;
            return { description: check.description, passed: total === check.expected, actual: String(total) };
        }
        if (check.property === "text") {
            var text = normalizeText(element.textContent);
            return { description: check.description, passed: text === normalizeText(check.expected), actual: text };
        }
        if (check.property === "attribute") {
            var attribute = element.getAttribute(check.attribute || "");
            var expected = check.expected;
            var passed = expected === "not-empty"
                ? attribute !== null && normalizeText(attribute).length > 0
                : attribute === String(expected);
            return { description: check.description, passed: passed, actual: attribute == null ? "(missing)" : attribute };
        }
        return { description: check.description, passed: false, error: "Unknown property: " + check.property };
    }
    window.addEventListener("message", function (event) {
        if (!event.data || event.data.type !== "praxbit-preview-run") {
            return;
        }
        void document.body.offsetHeight;
        var results = [];
        for (var index = 0; index < event.data.checks.length; index += 1) {
            if (index > 0) {
                resetDocument();
                void document.body.offsetHeight;
            }
            try {
                results.push(runCheck(event.data.checks[index]));
            } catch (error) {
                results.push({
                    description: event.data.checks[index].description,
                    passed: false,
                    error: error && error.message ? error.message : String(error)
                });
            }
        }
        parent.postMessage({ type: "praxbit-preview-result", outcomes: results }, "*");
    });
    captureInitialMarkup();
})();
</script>
`;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildPreviewDocument(files: Readonly<Record<string, string>>): string {
    const entryName = Object.keys(files).find(function isHtml(path: string): boolean {
        return path.endsWith(".html");
    });
    let html =
        entryName === undefined
            ? "<!doctype html><html><body></body></html>"
            : (files[entryName] ?? "");

    for (const [path, content] of Object.entries(files)) {
        if (path.endsWith(".css")) {
            const linkPattern = new RegExp(
                `<link[^>]+href=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*>`,
                "gi",
            );
            if (linkPattern.test(html)) {
                linkPattern.lastIndex = 0;
                html = html.replace(linkPattern, `<style>${content}</style>`);
            } else {
                html = html.replace("</head>", `<style>${content}</style></head>`);
            }
        }
        if (path.endsWith(".js")) {
            const scriptPattern = new RegExp(
                `<script[^>]+src=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*>\\s*</script>`,
                "gi",
            );
            if (scriptPattern.test(html)) {
                scriptPattern.lastIndex = 0;
                html = html.replace(scriptPattern, `<script>${content}</script>`);
            } else {
                html = html.replace("</body>", `<script>${content}</script></body>`);
            }
        }
    }

    if (html.includes("</body>")) {
        return html.replace("</body>", `${HARNESS_SCRIPT}</body>`);
    }
    return `${html}${HARNESS_SCRIPT}`;
}

async function runSinglePreviewCheck(
    files: Readonly<Record<string, string>>,
    check: PreviewCheck,
    timeoutMs: number,
): Promise<{ readonly outcome: PreviewCheckOutcome; readonly timedOut: boolean }> {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", "Exercise preview");
    iframe.style.width = "1024px";
    iframe.style.height = "768px";
    iframe.style.border = "0";
    iframe.style.position = "fixed";
    iframe.style.left = "0";
    iframe.style.top = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.srcdoc = buildPreviewDocument(files);

    return await new Promise(function executor(resolve): void {
        let settled = false;

        function finish(outcome: PreviewCheckOutcome, timedOut: boolean): void {
            if (settled) {
                return;
            }
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            iframe.remove();
            resolve({ outcome, timedOut });
        }

        function onMessage(
            event: MessageEvent<{ type: string; outcomes: readonly PreviewCheckOutcome[] }>,
        ): void {
            if (
                event.source !== iframe.contentWindow ||
                event.data.type !== "praxbit-preview-result"
            ) {
                return;
            }
            const outcome = event.data.outcomes[0] ?? {
                description: check.description,
                passed: false,
                error: "The preview returned no result.",
            };
            finish(outcome, false);
        }

        const timer = setTimeout(function onTimeout(): void {
            finish(
                { description: check.description, passed: false, error: "Preview timed out." },
                true,
            );
        }, timeoutMs);

        window.addEventListener("message", onMessage);
        iframe.addEventListener(
            "load",
            function onLoad(): void {
                iframe.contentWindow?.postMessage(
                    { type: "praxbit-preview-run", checks: [check] },
                    "*",
                );
            },
            { once: true },
        );
        document.body.appendChild(iframe);
    });
}

export async function runPreviewChecks(
    files: Readonly<Record<string, string>>,
    checks: readonly PreviewCheck[],
    timeoutMs = 5000,
): Promise<PreviewTestReport> {
    const outcomes: PreviewCheckOutcome[] = [];
    let timedOut = false;
    for (const check of checks) {
        let result = await runSinglePreviewCheck(files, check, timeoutMs);
        if (check.kind === "css" && result.outcome.actual === "") {
            // Firefox can report an empty computed value before the fresh iframe applies its stylesheet.
            await new Promise<void>(function wait(resolve): void {
                setTimeout(resolve, 50);
            });
            result = await runSinglePreviewCheck(files, check, timeoutMs);
        }
        outcomes.push(result.outcome);
        if (result.timedOut) {
            timedOut = true;
        }
    }
    return { outcomes, timedOut };
}

export function mountPreview(
    container: HTMLElement,
    files: Readonly<Record<string, string>>,
): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", "Live preview");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.background = "#FFFFFF";
    iframe.srcdoc = buildPreviewDocument(files);
    container.replaceChildren(iframe);
    return iframe;
}
