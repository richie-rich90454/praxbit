import { describe, expect, it } from "vitest";
import {
    isSafeRelativePath,
    parseMissionSolution,
    parseProjectSolutions,
} from "../../packages/content-validator/src/index.ts";

describe("solution path safety", function pathSafety(): void {
    it("accepts ordinary relative paths", function safe(): void {
        expect(isSafeRelativePath("index.html")).toBe(true);
        expect(isSafeRelativePath("src/app.js")).toBe(true);
        expect(isSafeRelativePath("src/nested/module.ts")).toBe(true);
    });

    it("rejects traversal, absolute, drive, and backslash paths", function unsafe(): void {
        expect(isSafeRelativePath("../evil.js")).toBe(false);
        expect(isSafeRelativePath("src/../../evil.js")).toBe(false);
        expect(isSafeRelativePath("/etc/passwd")).toBe(false);
        expect(isSafeRelativePath("\\\\server\\share\\file.js")).toBe(false);
        expect(isSafeRelativePath("C:/Windows/system32/file.js")).toBe(false);
        expect(isSafeRelativePath("src\\app.js")).toBe(false);
        expect(isSafeRelativePath("./app.js")).toBe(false);
        expect(isSafeRelativePath("src//app.js")).toBe(false);
        expect(isSafeRelativePath("")).toBe(false);
        expect(isSafeRelativePath("app.js\u0000.png")).toBe(false);
    });

    it("rejects a malicious mission solution before merging files", function missionSolution(): void {
        const parsed = parseMissionSolution(
            "campus.test",
            { steps: { "code-step": { files: { "../../outside.js": "alert(1)" } } } },
            new Set(["code-step"]),
        );
        expect(
            parsed.issues.some(function unsafe(issue): boolean {
                return issue.code === "unsafe-solution-path";
            }),
        ).toBe(true);
        expect(parsed.solution?.steps["code-step"]?.files).toEqual({});
    });

    it("rejects unknown steps and unexpected keys", function missionShape(): void {
        const parsed = parseMissionSolution(
            "campus.test",
            { steps: { other: { files: { "app.js": "x" } } }, extra: true },
            new Set(["code-step"]),
        );
        expect(
            parsed.issues.map(function codeOf(issue): string {
                return issue.code;
            }),
        ).toContain("solution-unknown-step");
        expect(
            parsed.issues.map(function codeOf(issue): string {
                return issue.code;
            }),
        ).toContain("solution-shape");
    });

    it("accepts a valid mission solution", function validMission(): void {
        const parsed = parseMissionSolution(
            "campus.test",
            {
                steps: {
                    "code-step": { files: { "app.js": "function add(a, b) { return a + b; }" } },
                },
            },
            new Set(["code-step"]),
        );
        expect(parsed.issues).toEqual([]);
        expect(parsed.solution?.steps["code-step"]?.files["app.js"]).toContain("function add");
    });

    it("rejects traversal and unknown files in project solutions", function projectSolution(): void {
        const parsed = parseProjectSolutions(
            {
                projects: {
                    "projects.test": {
                        files: { "../escape.html": "<html></html>", "app.js": "x" },
                        stages: {
                            "bad-stage": { files: { "app.js": "x" } },
                        },
                    },
                },
            },
            new Map([["projects.test", new Set(["index.html"])]]),
            new Map([["projects.test", new Set(["structure"])]]),
        );
        const codes = parsed.issues.map(function codeOf(issue): string {
            return issue.code;
        });
        expect(codes).toContain("unsafe-solution-path");
        expect(codes).toContain("unknown-solution-file");
        expect(codes).toContain("solution-unknown-stage");
        expect(parsed.solutions.get("projects.test")?.files ?? {}).toEqual({});
    });

    it("accepts per-stage project files", function projectStages(): void {
        const parsed = parseProjectSolutions(
            {
                projects: {
                    "projects.test": {
                        stages: {
                            structure: { files: { "index.html": "<html></html>" } },
                            layout: { files: { "styles.css": "body { margin: 0; }" } },
                        },
                    },
                },
            },
            new Map([["projects.test", new Set(["index.html", "styles.css"])]]),
            new Map([["projects.test", new Set(["structure", "layout"])]]),
        );
        expect(parsed.issues).toEqual([]);
        expect(
            parsed.solutions.get("projects.test")?.stages?.["layout"]?.files["styles.css"],
        ).toContain("margin");
    });
});
