import type { VersionProbe } from "../security/commands.ts";
import { runVersionProbe } from "../security/commands.ts";

export interface DoctorReport {
    readonly generatedAt: string;
    readonly platform: string;
    readonly architecture: string;
    readonly node: string;
    readonly workingDirectory: string;
    readonly tools: readonly VersionProbe[];
}

interface ToolSpec {
    readonly id: string;
    readonly label: string;
    readonly command: string;
    readonly args: readonly string[];
}

const TOOL_SPECS: readonly ToolSpec[] = [
    { id: "pnpm", label: "pnpm", command: "pnpm", args: ["--version"] },
    { id: "python", label: "Python", command: "python", args: ["--version"] },
    { id: "java", label: "Java", command: "java", args: ["--version"] },
    { id: "go", label: "Go", command: "go", args: ["version"] },
    { id: "rustc", label: "Rust", command: "rustc", args: ["--version"] },
    { id: "dotnet", label: ".NET", command: "dotnet", args: ["--version"] },
    { id: "gcc", label: "GCC", command: "gcc", args: ["--version"] },
    { id: "g++", label: "G++", command: "g++", args: ["--version"] },
];

export function buildDoctorReport(): DoctorReport {
    const tools: VersionProbe[] = [];
    for (const spec of TOOL_SPECS) {
        tools.push(runVersionProbe(spec.id, spec.label, spec.command, spec.args));
    }
    return {
        generatedAt: new Date().toISOString(),
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        workingDirectory: process.cwd(),
        tools,
    };
}

export function formatDoctorReport(report: DoctorReport): string {
    const lines: string[] = [];
    lines.push("Praxbit companion doctor");
    lines.push(`Platform: ${report.platform} ${report.architecture}`);
    lines.push(`Node.js: ${report.node}`);
    lines.push(`Working directory: ${report.workingDirectory}`);
    lines.push("");
    lines.push("Detected toolchains:");
    for (const tool of report.tools) {
        if (tool.found) {
            lines.push(`  ${tool.label}: ${tool.version}`);
        } else {
            lines.push(`  ${tool.label}: not found (${tool.error})`);
        }
    }
    lines.push("");
    lines.push(
        "Only installed tools are listed with a version. Missing tools are reported as missing.",
    );
    lines.push(
        'A detected toolchain does not mean a particular project can run; use "praxbit test" to inspect commands first.',
    );
    return `${lines.join("\n")}\n`;
}
