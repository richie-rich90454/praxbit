import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeExport } from "../src/commands/export.ts";

const tempDirectories: string[] = [];

interface ExportToolchainReport {
    generatedAt: string;
    platform: string;
    architecture: string;
    node: string;
    workingDirectory: string;
    tools: Array<{
        id: string;
        label: string;
        found: boolean;
        version: string;
        error: string;
    }>;
}

interface ExportEnvelope {
    format: string;
    formatVersion: number;
    exportedAt: string;
    companion: { name: string; version: string };
    trustedForRankedCompetition: boolean;
    trustNote: string;
    toolchains: ExportToolchainReport;
    results: unknown;
    inputClaimedRankedTrust: boolean;
}

function createTempDirectory(prefix: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirectories.push(directory);
    return directory;
}

describe("export command", function exportSuite(): void {
    afterEach(function cleanup(): void {
        for (const directory of tempDirectories.splice(0)) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    it("wraps a result file and overrides a claimed ranked trust", function exportClaimed(): void {
        const directory = createTempDirectory("praxbit-export-");
        const inputPath = path.join(directory, "results.json");
        const outputDirectory = path.join(directory, "results");
        const results = {
            tool: "praxbit-companion",
            trustedForRankedCompetition: true,
            commands: [{ command: "npm", args: ["test"], exitCode: 0 }],
        };
        fs.writeFileSync(inputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");

        const outputPath = executeExport({ resultsPath: inputPath, directory: outputDirectory });
        const envelope = JSON.parse(fs.readFileSync(outputPath, "utf8")) as ExportEnvelope;

        expect(path.dirname(outputPath)).toBe(path.resolve(outputDirectory));
        expect(path.basename(outputPath)).toMatch(/^praxbit-results-.+\.json$/);
        expect(envelope.format).toBe("praxbit-companion-export");
        expect(envelope.formatVersion).toBe(1);
        expect(new Date(envelope.exportedAt).toISOString()).toBe(envelope.exportedAt);
        expect(envelope.companion).toEqual({ name: "praxbit-companion", version: "0.1.0" });
        expect(envelope.trustedForRankedCompetition).toBe(false);
        expect(envelope.trustNote.length).toBeGreaterThan(0);
        expect(envelope.results).toEqual(results);
        expect(envelope.inputClaimedRankedTrust).toBe(true);
        expect(new Date(envelope.toolchains.generatedAt).toISOString()).toBe(
            envelope.toolchains.generatedAt,
        );
        expect(envelope.toolchains.platform.length).toBeGreaterThan(0);
        expect(envelope.toolchains.architecture.length).toBeGreaterThan(0);
        expect(envelope.toolchains.node).toBe(process.version);
        expect(envelope.toolchains.workingDirectory).toBe(process.cwd());
        expect(envelope.toolchains.tools.length).toBeGreaterThanOrEqual(8);
        for (const tool of envelope.toolchains.tools) {
            if (tool.found) {
                expect(tool.version.length).toBeGreaterThan(0);
            } else {
                expect(tool.version).toBe("");
                expect(tool.error.length).toBeGreaterThan(0);
            }
        }
    }, 60_000);
});
