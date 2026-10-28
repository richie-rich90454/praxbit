import { spawnSync } from "node:child_process";
import { limitText } from "../util/text.ts";

export interface ApprovedCommand {
    readonly label: string;
    readonly command: string;
    readonly args: readonly string[];
}

export interface CommandExecution {
    readonly label: string;
    readonly command: string;
    readonly args: readonly string[];
    readonly exitCode: number | null;
    readonly timedOut: boolean;
    readonly stdout: string;
    readonly stderr: string;
    readonly failure: string | undefined;
}

export interface VersionProbe {
    readonly id: string;
    readonly label: string;
    readonly found: boolean;
    readonly version: string;
    readonly error: string;
}

const MAXIMUM_CAPTURE_BYTES = 2_000_000;
const MAXIMUM_REPORT_CHARACTERS = 12_000;

function errorCode(error: Error): string {
    if ("code" in error && typeof error.code === "string") {
        return error.code;
    }
    return "";
}

interface SpawnTarget {
    readonly command: string;
    readonly args: readonly string[];
}

// Windows package managers are .cmd shims. Invoke them through the fixed system shell
// so no Node deprecation path concatenates arguments. All commands come from the
// companion's fixed allowlist and contain no spaces or user-supplied text.
function spawnTarget(command: string, args: readonly string[]): SpawnTarget {
    if (process.platform === "win32") {
        const shell = process.env["ComSpec"] ?? "cmd.exe";
        return {
            command: shell,
            args: ["/d", "/s", "/c", [command, ...args].join(" ")],
        };
    }
    return { command, args: [...args] };
}

export function runVersionProbe(
    id: string,
    label: string,
    command: string,
    args: readonly string[],
): VersionProbe {
    const target = spawnTarget(command, args);
    const result = spawnSync(target.command, [...target.args], {
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
        maxBuffer: 200_000,
    });
    if (result.error !== undefined) {
        const code = errorCode(result.error);
        return {
            id,
            label,
            found: false,
            version: "",
            error: code === "ENOENT" ? "not found on PATH" : result.error.message,
        };
    }
    if (result.status !== 0) {
        const detail = firstOutput(result.stdout, result.stderr);
        return {
            id,
            label,
            found: false,
            version: "",
            error: detail.length > 0 ? detail : `exited with code ${String(result.status)}`,
        };
    }
    const version = firstOutput(result.stdout, result.stderr);
    if (version.length === 0) {
        return { id, label, found: true, version: "reported no version text", error: "" };
    }
    return { id, label, found: true, version, error: "" };
}

function firstOutput(stdout: string, stderr: string): string {
    const source = stdout.trim().length > 0 ? stdout : stderr;
    const lines = source.replace(/\r/g, "").split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            return limitText(trimmed, 200).text;
        }
    }
    return "";
}

export function runApprovedCommand(
    approved: ApprovedCommand,
    workingDirectory: string,
    timeoutMs: number,
): CommandExecution {
    const target = spawnTarget(approved.command, approved.args);
    const result = spawnSync(target.command, [...target.args], {
        cwd: workingDirectory,
        encoding: "utf8",
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: MAXIMUM_CAPTURE_BYTES,
        env: {
            ...process.env,
            CI: "1",
            NO_COLOR: "1",
        },
    });

    const stdout = limitText(result.stdout ?? "", MAXIMUM_REPORT_CHARACTERS);
    const stderr = limitText(result.stderr ?? "", MAXIMUM_REPORT_CHARACTERS);
    const timedOut = result.error !== undefined && errorCode(result.error) === "ETIMEDOUT";
    const failure = result.error === undefined ? undefined : result.error.message;

    return {
        label: approved.label,
        command: approved.command,
        args: [...approved.args],
        exitCode: result.status,
        timedOut,
        stdout: stdout.text,
        stderr: stderr.text,
        failure,
    };
}

export function formatCommand(command: string, args: readonly string[]): string {
    return [command, ...args].join(" ");
}
