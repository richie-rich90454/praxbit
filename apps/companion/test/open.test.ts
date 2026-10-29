import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeOpen } from "../src/commands/open.ts";
import { PathConfinementError } from "../src/security/paths.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const missionFixturePath = path.join(
    repositoryRoot,
    "content",
    "campaigns",
    "campus",
    "13-page-with-no-identity.json",
);

const tempDirectories: string[] = [];
const originalWorkingDirectory = process.cwd();

interface FixtureStarterFile {
    path: string;
    content: string;
}

interface FixtureMissionStep {
    kind: string;
    files?: FixtureStarterFile[];
}

interface FixtureMission {
    id: string;
    steps: FixtureMissionStep[];
}

function createTempDirectory(prefix: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirectories.push(directory);
    return directory;
}

function silenceStdout(): { restore(): void } {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(function discard(): boolean {
        return true;
    });
    return {
        restore: function restore(): void {
            spy.mockRestore();
        },
    };
}

function createFixtureMission(identifier: string, starterPath: string): FixtureMission {
    const mission = JSON.parse(fs.readFileSync(missionFixturePath, "utf8")) as FixtureMission;
    mission.id = identifier;
    const firstStep = mission.steps[0];
    if (firstStep === undefined || firstStep.files === undefined) {
        throw new Error("The mission fixture has no starter files.");
    }
    const firstFile = firstStep.files[0];
    if (firstFile === undefined) {
        throw new Error("The mission fixture has no starter file.");
    }
    firstFile.path = starterPath;
    return mission;
}

function createFixtureRepository(mission: FixtureMission): string {
    const base = createTempDirectory("praxbit-open-repository-");
    const repository = path.join(base, "repository");
    const campaignDirectory = path.join(repository, "content", "campaigns", "campus");
    fs.mkdirSync(campaignDirectory, { recursive: true });
    fs.writeFileSync(path.join(repository, "content", "tracks.json"), "{}\n", "utf8");
    fs.writeFileSync(
        path.join(campaignDirectory, "fixture.json"),
        `${JSON.stringify(mission, null, 2)}\n`,
        "utf8",
    );
    return repository;
}

describe("open command", function openSuite(): void {
    afterEach(function cleanup(): void {
        if (process.cwd() !== originalWorkingDirectory) {
            process.chdir(originalWorkingDirectory);
        }
        for (const directory of tempDirectories.splice(0)) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    it("writes starter files for a real mission resolved from the repository root", async function realMission(): Promise<void> {
        expect(fs.existsSync(path.join(process.cwd(), "content", "tracks.json"))).toBe(true);
        const outputDirectory = createTempDirectory("praxbit-open-real-");
        const stdout = silenceStdout();
        try {
            const result = await executeOpen({
                identifier: "campus.page-with-no-identity",
                directory: outputDirectory,
                preApproved: true,
            });

            expect(result.target.kind).toBe("mission");
            expect(result.target.id).toBe("campus.page-with-no-identity");
            expect(result.directory).toBe(path.resolve(outputDirectory));
            expect(result.writtenFiles).toEqual(["index.html", "styles.css"]);
            expect(result.overwrittenFiles).toEqual([]);
            expect(fs.readFileSync(path.join(outputDirectory, "index.html"), "utf8")).toContain(
                "Campus store",
            );
            expect(fs.readFileSync(path.join(outputDirectory, "styles.css"), "utf8")).toContain(
                "font-family",
            );
        } finally {
            stdout.restore();
        }
    });

    it("refuses a starter file path that traverses outside the target directory", async function traversal(): Promise<void> {
        const repository = createFixtureRepository(
            createFixtureMission("campus.traversal-fixture", "../escape.txt"),
        );
        const base = createTempDirectory("praxbit-open-traversal-");
        const outputDirectory = path.join(base, "work");
        const escapedPath = path.join(base, "escape.txt");
        const stdout = silenceStdout();
        try {
            process.chdir(repository);
            await expect(
                executeOpen({
                    identifier: "campus.traversal-fixture",
                    directory: outputDirectory,
                    preApproved: true,
                }),
            ).rejects.toThrow(PathConfinementError);
            expect(fs.existsSync(escapedPath)).toBe(false);
        } finally {
            process.chdir(originalWorkingDirectory);
            stdout.restore();
        }
    });

    it("refuses an absolute starter file path outside the target directory", async function absolute(): Promise<void> {
        const outsideDirectory = createTempDirectory("praxbit-open-outside-");
        const absoluteTarget = path.join(outsideDirectory, "escape.txt");
        const repository = createFixtureRepository(
            createFixtureMission("campus.absolute-fixture", absoluteTarget),
        );
        const outputDirectory = createTempDirectory("praxbit-open-absolute-");
        const stdout = silenceStdout();
        try {
            process.chdir(repository);
            await expect(
                executeOpen({
                    identifier: "campus.absolute-fixture",
                    directory: outputDirectory,
                    preApproved: true,
                }),
            ).rejects.toThrow(PathConfinementError);
            expect(fs.existsSync(absoluteTarget)).toBe(false);
        } finally {
            process.chdir(originalWorkingDirectory);
            stdout.restore();
        }
    });
});
