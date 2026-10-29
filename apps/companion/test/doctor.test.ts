import { describe, expect, it } from "vitest";
import {
    buildDoctorReport,
    formatDoctorReport,
    type DoctorReport,
} from "../src/commands/doctor.ts";

describe("doctor command", function doctorSuite(): void {
    it("formats a found tool with its reported version", function foundTool(): void {
        const report: DoctorReport = {
            generatedAt: "2026-01-01T00:00:00.000Z",
            platform: "win32",
            architecture: "x64",
            node: "v24.0.0",
            workingDirectory: "C:\\work",
            tools: [{ id: "pnpm", label: "pnpm", found: true, version: "12.14.0", error: "" }],
        };

        const text = formatDoctorReport(report);

        expect(text).toContain("Platform: win32 x64");
        expect(text).toContain("Node.js: v24.0.0");
        expect(text).toContain("  pnpm: 12.14.0\n");
    });

    it("reports missing tools as missing without inventing a version", function missingTool(): void {
        const report: DoctorReport = {
            generatedAt: "2026-01-01T00:00:00.000Z",
            platform: "win32",
            architecture: "x64",
            node: "v24.0.0",
            workingDirectory: "C:\\work",
            tools: [
                { id: "pnpm", label: "pnpm", found: true, version: "12.14.0", error: "" },
                {
                    id: "python",
                    label: "Python",
                    found: false,
                    version: "",
                    error: "not found on PATH",
                },
                {
                    id: "java",
                    label: "Java",
                    found: false,
                    version: "",
                    error: "exited with code 1",
                },
            ],
        };

        const lines = formatDoctorReport(report).split("\n");

        expect(lines).toContain("  pnpm: 12.14.0");
        expect(lines).toContain("  Python: not found (not found on PATH)");
        expect(lines).toContain("  Java: not found (exited with code 1)");
        for (const line of lines) {
            if (line.includes("not found")) {
                expect(line).toMatch(/^  \S.*: not found \(.+\)$/);
            }
        }
    });

    it("never pairs a missing real tool with a version", function honestRealReport(): void {
        const report = buildDoctorReport();
        const text = formatDoctorReport(report);

        expect(report.tools.length).toBeGreaterThanOrEqual(8);
        for (const tool of report.tools) {
            if (tool.found) {
                expect(tool.version.length).toBeGreaterThan(0);
                expect(tool.error).toBe("");
                expect(text).toContain(`  ${tool.label}: ${tool.version}`);
            } else {
                expect(tool.version).toBe("");
                expect(tool.error.length).toBeGreaterThan(0);
                expect(text).toContain(`  ${tool.label}: not found (${tool.error})`);
            }
        }
    }, 30_000);
});
