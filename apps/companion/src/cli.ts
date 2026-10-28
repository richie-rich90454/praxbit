import { buildDoctorReport, formatDoctorReport } from "./commands/doctor.ts";
import { executeOpen } from "./commands/open.ts";
import { executeTest } from "./commands/test.ts";
import { executeExport } from "./commands/export.ts";
import { COMPANION_VERSION } from "./version.ts";

class CliError extends Error {
    public override name = "CliError";
}

interface ParsedArguments {
    readonly positionals: readonly string[];
    readonly flags: ReadonlySet<string>;
    readonly values: ReadonlyMap<string, string>;
}

const VALUE_OPTIONS: readonly string[] = ["--dir", "--timeout", "--out"];

function parseArguments(argv: readonly string[], valueOptions: readonly string[]): ParsedArguments {
    const positionals: string[] = [];
    const flags = new Set<string>();
    const values = new Map<string, string>();
    let index = 0;

    while (index < argv.length) {
        const argument = argv[index];
        if (argument === undefined) {
            index += 1;
            continue;
        }

        if (argument.startsWith("--")) {
            const equalsIndex = argument.indexOf("=");
            const option = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
            if (!valueOptions.includes(option) && equalsIndex !== -1) {
                throw new CliError(`Option ${option} does not take a value.`);
            }
            if (valueOptions.includes(option)) {
                if (equalsIndex !== -1) {
                    const value = argument.slice(equalsIndex + 1);
                    if (value.length === 0) {
                        throw new CliError(`Option ${option} requires a value.`);
                    }
                    values.set(option, value);
                    index += 1;
                    continue;
                }
                const value = argv[index + 1];
                if (value === undefined || value.startsWith("--")) {
                    throw new CliError(`Option ${option} requires a value.`);
                }
                values.set(option, value);
                index += 2;
                continue;
            }
            if (option === "--yes" || option === "--help" || option === "--version") {
                flags.add(option);
                index += 1;
                continue;
            }
            throw new CliError(`Unknown option: ${option}`);
        }

        positionals.push(argument);
        index += 1;
    }

    return { positionals, flags, values };
}

function helpText(): string {
    return [
        "Praxbit companion",
        "",
        "Usage:",
        "  praxbit doctor",
        "  praxbit open <mission-or-project-id> [--dir <path>] [--yes]",
        "  praxbit test [directory] [--yes] [--timeout <milliseconds>] [--out <report.json>]",
        "  praxbit export <results.json> [--dir <path>]",
        "",
        "Commands:",
        "  doctor   Detect installed toolchains and print their reported versions.",
        "  open     Write starter files for a mission or project into a directory.",
        "  test     Detect a project, show exact commands, and run approved local tests after consent.",
        "  export   Wrap local results with toolchain versions and an explicit untrusted-for-ranked flag.",
        "",
        "The companion never downloads or runs remote scripts. Local results are not a",
        "cryptographic attestation and are not trusted for ranked competitions.",
    ].join("\n");
}

function timeoutValue(raw: string | undefined): number {
    if (raw === undefined) {
        return 120_000;
    }
    if (!/^[0-9]+$/.test(raw)) {
        throw new CliError("--timeout must be a whole number of milliseconds.");
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1000 || parsed > 600_000) {
        throw new CliError("--timeout must be between 1000 and 600000 milliseconds.");
    }
    return parsed;
}

function runDoctor(argv: readonly string[]): number {
    const parsed = parseArguments(argv, []);
    if (parsed.flags.has("--help")) {
        process.stdout.write(`${helpText()}\n`);
        return 0;
    }
    if (parsed.positionals.length > 0) {
        throw new CliError("doctor does not accept positional arguments.");
    }
    const report = buildDoctorReport();
    process.stdout.write(formatDoctorReport(report));
    return 0;
}

async function runOpen(argv: readonly string[]): Promise<number> {
    const parsed = parseArguments(argv, VALUE_OPTIONS);
    if (parsed.flags.has("--help")) {
        process.stdout.write(`${helpText()}\n`);
        return 0;
    }
    if (parsed.positionals.length !== 1) {
        throw new CliError("open requires exactly one mission or project id.");
    }
    const identifier = parsed.positionals[0];
    if (identifier === undefined) {
        throw new CliError("open requires exactly one mission or project id.");
    }
    await executeOpen({
        identifier,
        directory: parsed.values.get("--dir"),
        preApproved: parsed.flags.has("--yes"),
    });
    return 0;
}

async function runTest(argv: readonly string[]): Promise<number> {
    const parsed = parseArguments(argv, VALUE_OPTIONS);
    if (parsed.flags.has("--help")) {
        process.stdout.write(`${helpText()}\n`);
        return 0;
    }
    if (parsed.positionals.length > 1) {
        throw new CliError("test accepts at most one directory.");
    }
    const report = await executeTest({
        directory: parsed.positionals[0] ?? ".",
        preApproved: parsed.flags.has("--yes"),
        timeoutMs: timeoutValue(parsed.values.get("--timeout")),
        outputPath: parsed.values.get("--out"),
    });
    const failed = report.commands.some(function isFailure(item): boolean {
        return item.timedOut || item.failure !== undefined || item.exitCode !== 0;
    });
    return failed ? 2 : 0;
}

function runExport(argv: readonly string[]): number {
    const parsed = parseArguments(argv, VALUE_OPTIONS);
    if (parsed.flags.has("--help")) {
        process.stdout.write(`${helpText()}\n`);
        return 0;
    }
    if (parsed.positionals.length !== 1) {
        throw new CliError("export requires exactly one results file.");
    }
    const resultsPath = parsed.positionals[0];
    if (resultsPath === undefined) {
        throw new CliError("export requires exactly one results file.");
    }
    executeExport({
        resultsPath,
        directory: parsed.values.get("--dir") ?? ".",
    });
    return 0;
}

export async function runCli(argv: readonly string[]): Promise<number> {
    if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
        process.stdout.write(`${helpText()}\n`);
        return 0;
    }
    if (argv[0] === "--version") {
        process.stdout.write(`${COMPANION_VERSION}\n`);
        return 0;
    }

    const command = argv[0];
    const rest = argv.slice(1);
    try {
        if (command === "doctor") {
            return runDoctor(rest);
        }
        if (command === "open") {
            return await runOpen(rest);
        }
        if (command === "test") {
            return await runTest(rest);
        }
        if (command === "export") {
            return runExport(rest);
        }
        throw new CliError(`Unknown command: ${command ?? ""}. Run "praxbit help".`);
    } catch (error) {
        if (error instanceof Error) {
            process.stderr.write(`Error: ${error.message}\n`);
        } else {
            process.stderr.write("Error: the command failed.\n");
        }
        return 1;
    }
}
