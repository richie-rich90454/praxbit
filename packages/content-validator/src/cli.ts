import path from "node:path";
import { validateRepository } from "./index.ts";
import type { ValidationIssue } from "./types.ts";

function printIssue(issue: ValidationIssue): void {
    console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.path}`);
    console.log(`  ${issue.message}`);
}

function resolveRepositoryRoot(): string {
    const argument = process.argv[2];
    if (argument !== undefined && argument.length > 0) {
        return path.resolve(argument);
    }
    return process.cwd();
}

async function main(): Promise<void> {
    const root = resolveRepositoryRoot();
    let result;
    try {
        result = await validateRepository(root);
    } catch (error) {
        console.error(
            `Content validation could not start: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
        return;
    }

    const errors = result.report.issues.filter(function isError(issue): boolean {
        return issue.severity === "error";
    });
    const warnings = result.report.issues.filter(function isWarning(issue): boolean {
        return issue.severity === "warning";
    });

    console.log("Praxbit content validation");
    console.log(`Repository: ${root}`);
    console.log(
        `Missions: ${result.content.missions.length}; tracks: ${result.content.tracks.length}; projects: ${result.content.projects.length}; skills: ${result.content.skills.skills.length}`,
    );
    console.log("");

    for (const issue of errors) {
        printIssue(issue);
    }
    for (const issue of warnings) {
        printIssue(issue);
    }

    console.log("");
    console.log(`Executed checks: ${result.report.executedChecks}`);
    console.log(`Deferred checks: ${result.report.deferredChecks}`);
    if (result.report.deferredChecks > 0) {
        console.log(
            "  CSS computed-style and layout checks cannot be faithfully evaluated in jsdom. They are browser-validated separately and are not counted as passes.",
        );
        console.log(
            "  Python function checks fail normally when Pyodide loads; they are counted as deferred only when Pyodide cannot load in this environment.",
        );
    }
    console.log(`Errors: ${errors.length}; warnings: ${warnings.length}`);

    if (errors.length > 0) {
        console.log("Content validation failed.");
        process.exitCode = 1;
        return;
    }
    console.log("Content validation passed.");
}

await main();
