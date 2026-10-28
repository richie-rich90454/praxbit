import fs from "node:fs";
import path from "node:path";
import { isDirectory } from "../security/paths.ts";
import { requireConsent } from "../security/consent.ts";
import { formatCommand, runApprovedCommand, type CommandExecution } from "../security/commands.ts";
import { detectProject, type DetectedProject } from "../project/detect.ts";
import { COMPANION_NAME, COMPANION_VERSION, REPORT_FORMAT_VERSION } from "../version.ts";

export interface TestRequest {
    readonly directory: string;
    readonly preApproved: boolean;
    readonly timeoutMs: number;
    readonly outputPath: string | undefined;
}

export interface TestReport {
    readonly tool: string;
    readonly toolVersion: string;
    readonly reportVersion: number;
    readonly createdAt: string;
    readonly directory: string;
    readonly projectKind: string;
    readonly projectLabel: string;
    readonly commands: readonly CommandExecution[];
    readonly trustedForRankedCompetition: false;
}

export function buildTestReport(
    project: DetectedProject,
    directory: string,
    commands: readonly CommandExecution[],
): TestReport {
    return {
        tool: COMPANION_NAME,
        toolVersion: COMPANION_VERSION,
        reportVersion: REPORT_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        directory,
        projectKind: project.kind,
        projectLabel: project.label,
        commands,
        trustedForRankedCompetition: false,
    };
}

function printCommandPreview(project: DetectedProject, directory: string, timeoutMs: number): void {
    process.stdout.write(`\nProject: ${project.label}\n`);
    process.stdout.write(`Directory: ${directory}\n`);
    process.stdout.write(
        `Timeout per command: ${String(Math.round(timeoutMs / 1000))} seconds\n\n`,
    );
    if (project.commands.length === 0) {
        process.stdout.write("No approved test command was detected.\n");
    } else {
        process.stdout.write("Commands that will run, exactly:\n");
        for (const command of project.commands) {
            process.stdout.write(`  ${formatCommand(command.command, command.args)}\n`);
        }
    }
    for (const note of project.notes) {
        process.stdout.write(`Note: ${note}\n`);
    }
}

function writeReport(report: TestReport, outputPath: string): string {
    const resolved = path.resolve(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    return resolved;
}

export async function executeTest(request: TestRequest): Promise<TestReport> {
    const directory = path.resolve(process.cwd(), request.directory);
    if (!isDirectory(directory)) {
        throw new Error(`Not a directory: ${directory}`);
    }

    const project = detectProject(directory);
    printCommandPreview(project, directory, request.timeoutMs);

    if (project.commands.length === 0) {
        throw new Error("No approved test command is available for this directory.");
    }

    await requireConsent(
        `Run ${String(project.commands.length)} local test command(s) in ${directory}? This executes project code.`,
        request.preApproved,
    );

    const results: CommandExecution[] = [];
    for (const command of project.commands) {
        process.stdout.write(`\nRunning: ${formatCommand(command.command, command.args)}\n`);
        const result = runApprovedCommand(command, directory, request.timeoutMs);
        results.push(result);
        if (result.timedOut) {
            process.stdout.write(
                `Result: timed out after ${String(Math.round(request.timeoutMs / 1000))} seconds\n`,
            );
        } else if (result.failure !== undefined) {
            process.stdout.write(`Result: could not run (${result.failure})\n`);
        } else {
            process.stdout.write(`Result: exit code ${String(result.exitCode)}\n`);
        }
        if (result.stdout.length > 0) {
            process.stdout.write("stdout:\n");
            process.stdout.write(result.stdout);
            process.stdout.write("\n");
        }
        if (result.stderr.length > 0) {
            process.stdout.write("stderr:\n");
            process.stdout.write(result.stderr);
            process.stdout.write("\n");
        }
    }

    const report = buildTestReport(project, directory, results);
    const failures = results.filter(function failed(item): boolean {
        return item.timedOut || item.failure !== undefined || item.exitCode !== 0;
    });

    process.stdout.write("\nSummary\n");
    process.stdout.write(`  Commands: ${String(results.length)}\n`);
    process.stdout.write(`  Failed or timed out: ${String(failures.length)}\n`);
    process.stdout.write(
        "  Trust: local results are not independently verified and are not trusted for ranked competitions.\n",
    );

    if (request.outputPath !== undefined) {
        const written = writeReport(report, request.outputPath);
        process.stdout.write(`  Report written to: ${written}\n`);
    } else {
        process.stdout.write('  Use --out <file> to save this report for "praxbit export".\n');
    }

    return report;
}
