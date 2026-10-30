import path from "node:path";
import type { Mission, Track } from "@praxbit/contracts";
import { validateRepository } from "./index.ts";
import { TRACK_MINIMUM_MISSIONS } from "./validate.ts";
import type { LoadedContent, ValidationIssue } from "./types.ts";

function printIssue(issue: ValidationIssue): void {
    console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.path}`);
    console.log(`  ${issue.message}`);
}

function resolveRepositoryRoot(argument: string | undefined): string {
    if (argument !== undefined && argument.length > 0) {
        return path.resolve(argument);
    }
    return process.cwd();
}

function hasTransferStep(track: Track, missionsById: ReadonlyMap<string, Mission>): boolean {
    return track.missionIds.some(function hasTransfer(missionId): boolean {
        const mission = missionsById.get(missionId);
        return (
            mission !== undefined &&
            mission.steps.some(function transfers(step): boolean {
                return step.evidence === "transfer";
            })
        );
    });
}

function printTrackReport(content: LoadedContent): void {
    const missionsById = new Map(
        content.missions.map(function toEntry(mission): [string, Mission] {
            return [mission.id, mission];
        }),
    );
    console.log("Track standards report");
    console.log("track\tkind\tmissions\tminimum\tstatus\ttransfer");
    for (const track of content.tracks) {
        const minimum = TRACK_MINIMUM_MISSIONS[track.kind];
        const transfer =
            track.kind === "campaign"
                ? "not-required"
                : hasTransferStep(track, missionsById)
                  ? "yes"
                  : "no";
        console.log(
            `${track.id}\t${track.kind}\t${track.missionIds.length}\t${minimum}\t${track.missionIds.length >= minimum ? "ok" : "short"}\t${transfer}`,
        );
    }
    console.log("");
}

async function main(): Promise<void> {
    const argumentsList = process.argv.slice(2);
    const reportMode = argumentsList.includes("--report");
    const root = resolveRepositoryRoot(
        argumentsList.find(function isPath(argument): boolean {
            return !argument.startsWith("--");
        }),
    );
    let result;
    try {
        result = await validateRepository(root);
    } catch (error) {
        console.error(
            `Content validation could not start: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = reportMode ? 0 : 1;
        return;
    }

    if (reportMode) {
        printTrackReport(result.content);
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

    if (reportMode) {
        console.log("Missing standards and warnings");
    }
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

    if (reportMode) {
        console.log("Report mode does not fail on content violations.");
        return;
    }
    if (errors.length > 0) {
        console.log("Content validation failed.");
        process.exitCode = 1;
        return;
    }
    console.log("Content validation passed.");
}

await main();
