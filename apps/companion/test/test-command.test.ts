import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeTest } from "../src/commands/test.ts";
import { detectProject } from "../src/project/detect.ts";

const tempDirectories: string[] = [];

interface WrittenReport {
    projectKind: string;
    projectLabel: string;
    directory: string;
    trustedForRankedCompetition: boolean;
    commands: Array<{
        command: string;
        args: string[];
        exitCode: number | null;
        stdout: string;
        failure?: string;
    }>;
}

function createTempDirectory(prefix: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirectories.push(directory);
    return directory;
}

function writeNodeFixture(directory: string): void {
    fs.writeFileSync(
        path.join(directory, "package.json"),
        `${JSON.stringify(
            {
                name: "praxbit-companion-fixture",
                version: "1.0.0",
                private: true,
                scripts: {
                    test: "node -e \"console.log('PRAXBIT_FIXTURE_OK')\"",
                },
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
}

describe("test command", function testSuite(): void {
    afterEach(function cleanup(): void {
        for (const directory of tempDirectories.splice(0)) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    it("detects a Node test script and its approved command", function detectNode(): void {
        const directory = createTempDirectory("praxbit-test-node-");
        writeNodeFixture(directory);

        const project = detectProject(directory);

        expect(project.kind).toBe("node");
        expect(project.label).toBe("Node.js");
        expect(project.commands).toHaveLength(1);
        const command = project.commands[0];
        if (command === undefined) {
            throw new Error("Expected one approved command.");
        }
        expect(command.label).toBe("Node test script");
        expect(command.command).toBe("npm");
        expect(command.args).toEqual(["test"]);
    });

    it("detects a Makefile test target without running it", function detectMake(): void {
        const directory = createTempDirectory("praxbit-test-make-");
        fs.writeFileSync(path.join(directory, "Makefile"), "test:\n\t@echo fixture\n", "utf8");

        const project = detectProject(directory);

        expect(project.kind).toBe("make");
        expect(project.label).toBe("Make project");
        expect(project.commands).toEqual([
            { label: "Make test target", command: "make", args: ["test"] },
        ]);
    });

    it("prints and runs only the approved command after pre-approval", async function runApproved(): Promise<void> {
        const directory = createTempDirectory("praxbit-test-run-");
        writeNodeFixture(directory);
        const reportPath = path.join(directory, "report.json");
        const printed: string[] = [];
        const stdout = vi.spyOn(process.stdout, "write").mockImplementation(function capture(
            chunk: string | Uint8Array,
        ): boolean {
            printed.push(String(chunk));
            return true;
        });
        try {
            const report = await executeTest({
                directory,
                preApproved: true,
                timeoutMs: 60_000,
                outputPath: reportPath,
            });

            expect(report.projectKind).toBe("node");
            expect(report.projectLabel).toBe("Node.js");
            expect(report.directory).toBe(path.resolve(directory));
            expect(report.trustedForRankedCompetition).toBe(false);
            expect(report.commands).toHaveLength(1);
            const execution = report.commands[0];
            if (execution === undefined) {
                throw new Error("Expected one command execution.");
            }
            expect(execution.command).toBe("npm");
            expect(execution.args).toEqual(["test"]);
            expect(execution.exitCode).toBe(0);
            expect(execution.failure).toBeUndefined();
            expect(execution.stdout).toContain("PRAXBIT_FIXTURE_OK");

            const written = JSON.parse(fs.readFileSync(reportPath, "utf8")) as WrittenReport;
            expect(written.projectKind).toBe("node");
            expect(written.directory).toBe(path.resolve(directory));
            expect(written.trustedForRankedCompetition).toBe(false);
            expect(written.commands).toHaveLength(1);
        } finally {
            stdout.mockRestore();
        }

        const output = printed.join("");
        expect(output).toContain("Commands that will run, exactly:");
        expect(output).toContain("  npm test");
        expect(output.match(/^Running: /gm)).toHaveLength(1);
        expect(output).toContain("PRAXBIT_FIXTURE_OK");
    }, 30_000);
});
