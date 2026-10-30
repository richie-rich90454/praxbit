import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CRITERIA = [
    ["1.1.1", "Non-text Content", "A"],
    ["1.2.1", "Audio-only and Video-only (Prerecorded)", "A"],
    ["1.2.2", "Captions (Prerecorded)", "A"],
    ["1.2.3", "Audio Description or Media Alternative (Prerecorded)", "A"],
    ["1.2.4", "Captions (Live)", "AA"],
    ["1.2.5", "Audio Description (Prerecorded)", "AA"],
    ["1.3.1", "Info and Relationships", "A"],
    ["1.3.2", "Meaningful Sequence", "A"],
    ["1.3.3", "Sensory Characteristics", "A"],
    ["1.3.4", "Orientation", "AA"],
    ["1.3.5", "Identify Input Purpose", "AA"],
    ["1.4.1", "Use of Color", "A"],
    ["1.4.2", "Audio Control", "A"],
    ["1.4.3", "Contrast (Minimum)", "AA"],
    ["1.4.4", "Resize Text", "AA"],
    ["1.4.5", "Images of Text", "AA"],
    ["1.4.10", "Reflow", "AA"],
    ["1.4.11", "Non-text Contrast", "AA"],
    ["1.4.12", "Text Spacing", "AA"],
    ["1.4.13", "Content on Hover or Focus", "AA"],
    ["2.1.1", "Keyboard", "A"],
    ["2.1.2", "No Keyboard Trap", "A"],
    ["2.1.4", "Character Key Shortcuts", "A"],
    ["2.2.1", "Timing Adjustable", "A"],
    ["2.2.2", "Pause, Stop, Hide", "A"],
    ["2.3.1", "Three Flashes or Below Threshold", "A"],
    ["2.4.1", "Bypass Blocks", "A"],
    ["2.4.2", "Page Titled", "A"],
    ["2.4.3", "Focus Order", "A"],
    ["2.4.4", "Link Purpose (In Context)", "A"],
    ["2.4.5", "Multiple Ways", "AA"],
    ["2.4.6", "Headings and Labels", "AA"],
    ["2.4.7", "Focus Visible", "AA"],
    ["2.4.11", "Focus Not Obscured (Minimum)", "AA"],
    ["2.5.1", "Pointer Gestures", "A"],
    ["2.5.2", "Pointer Cancellation", "A"],
    ["2.5.3", "Label in Name", "A"],
    ["2.5.4", "Motion Actuation", "A"],
    ["2.5.7", "Dragging Movements", "AA"],
    ["2.5.8", "Target Size (Minimum)", "AA"],
    ["3.1.1", "Language of Page", "A"],
    ["3.1.2", "Language of Parts", "AA"],
    ["3.2.1", "On Focus", "A"],
    ["3.2.2", "On Input", "A"],
    ["3.2.3", "Consistent Navigation", "AA"],
    ["3.2.4", "Consistent Identification", "AA"],
    ["3.2.6", "Consistent Help", "A"],
    ["3.3.1", "Error Identification", "A"],
    ["3.3.2", "Labels or Instructions", "A"],
    ["3.3.3", "Error Suggestion", "AA"],
    ["3.3.4", "Error Prevention (Legal, Financial, Data)", "AA"],
    ["3.3.7", "Redundant Entry", "A"],
    ["3.3.8", "Accessible Authentication (Minimum)", "AA"],
    ["4.1.2", "Name, Role, Value", "A"],
    ["4.1.3", "Status Messages", "AA"],
];

function criterionTags(title) {
    const tags = [];
    for (const match of title.matchAll(/@(\d+\.\d+\.\d+)/g)) {
        if (match[1] !== undefined) {
            tags.push(match[1]);
        }
    }
    return tags;
}

function resultStatus(result) {
    if (result.status === "passed") {
        return "pass";
    }
    if (result.status === "skipped") {
        return "skip";
    }
    return "fail";
}

function recordSpec(spec, coverage) {
    const tags = criterionTags(spec.title);
    if (tags.length === 0) {
        return;
    }
    const statuses = [];
    for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
            statuses.push(resultStatus(result));
        }
    }
    const failed = statuses.includes("fail");
    const passed = statuses.includes("pass");
    const status = failed ? "fail" : passed ? "pass" : statuses.length > 0 ? "skip" : "skip";
    for (const tag of tags) {
        const entry = coverage.get(tag) ?? { pass: 0, fail: 0, skip: 0, names: [] };
        entry[status] += 1;
        entry.names.push(spec.title);
        coverage.set(tag, entry);
    }
}

function walkSuites(suites, coverage) {
    for (const suite of suites ?? []) {
        for (const spec of suite.specs ?? []) {
            recordSpec(spec, coverage);
        }
        walkSuites(suite.suites, coverage);
    }
}

function criterionStatus(entry) {
    if (entry === undefined) {
        return "NOT AUTOMATED";
    }
    if (entry.fail > 0) {
        return "FAIL";
    }
    if (entry.pass > 0) {
        return "PASS";
    }
    if (entry.skip > 0) {
        return "SKIP";
    }
    return "NOT AUTOMATED";
}

function writeTable(coverage) {
    const header = `${"ID".padEnd(6)} ${"Criterion".padEnd(58)} ${"Level".padEnd(5)} ${"Status".padEnd(
        14,
    )} Tests`;
    console.log(header);
    console.log("-".repeat(header.length));
    for (const [id, name, level] of CRITERIA) {
        const entry = coverage.get(id);
        const status = criterionStatus(entry);
        const tests =
            entry === undefined
                ? "-"
                : `${String(entry.pass)} pass, ${String(entry.fail)} fail, ${String(entry.skip)} skip`;
        console.log(
            `${id.padEnd(6)} ${name.padEnd(58)} ${level.padEnd(5)} ${status.padEnd(14)} ${tests}`,
        );
    }
}

const outputFile = join(tmpdir(), `praxbit-wcag-${String(process.pid)}-${String(Date.now())}.json`);
const forwardedArgs = process.argv.slice(2);
const result = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--grep", "@wcag22", "--reporter=json", ...forwardedArgs],
    {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: outputFile },
        shell: process.platform === "win32",
        maxBuffer: 50 * 1024 * 1024,
    },
);

if (!existsSync(outputFile)) {
    console.error("The WCAG report could not read Playwright JSON output.");
    if (result.stdout.length > 0) {
        console.error(result.stdout);
    }
    if (result.stderr.length > 0) {
        console.error(result.stderr);
    }
    process.exit(result.status ?? 1);
}

let report;
try {
    report = JSON.parse(readFileSync(outputFile, "utf8"));
} catch (error) {
    console.error(
        `The WCAG report could not parse Playwright JSON: ${
            error instanceof Error ? error.message : String(error)
        }`,
    );
    process.exit(1);
} finally {
    rmSync(outputFile, { force: true });
}

const coverage = new Map();
walkSuites(report.suites, coverage);

console.log("WCAG 2.2 A/AA internal audit evidence");
console.log("Project: praxbit");
console.log(`Command: pnpm exec playwright test --grep @wcag22 ${forwardedArgs.join(" ")}`.trim());
console.log("This table is internal, automated evidence. It is not third-party certification.");
console.log("");
writeTable(coverage);

const counts = { pass: 0, fail: 0, skip: 0, notAutomated: 0 };
for (const [id] of CRITERIA) {
    const status = criterionStatus(coverage.get(id));
    if (status === "PASS") {
        counts.pass += 1;
    } else if (status === "FAIL") {
        counts.fail += 1;
    } else if (status === "SKIP") {
        counts.skip += 1;
    } else {
        counts.notAutomated += 1;
    }
}
console.log("");
console.log(
    `Summary: ${String(counts.pass)} pass, ${String(counts.fail)} fail, ${String(
        counts.skip,
    )} skip, ${String(counts.notAutomated)} not automated.`,
);
console.log(
    "Criteria marked NOT AUTOMATED need the manual evidence recorded in docs/product/wcag-2.2-aa-audit.md.",
);

const failures = [];
for (const [id, entry] of coverage) {
    if (entry.fail > 0) {
        failures.push({ id, names: entry.names });
    }
}
if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const failure of failures) {
        console.log(`${failure.id}: ${failure.names.join(" | ")}`);
    }
}

const errors = report.errors ?? [];
if (errors.length > 0) {
    console.log("");
    console.log("Playwright reported errors:");
    for (const error of errors) {
        console.log(error.message ?? String(error));
    }
}

if ((result.status ?? 0) !== 0 || counts.fail > 0 || errors.length > 0) {
    process.exit(1);
}
