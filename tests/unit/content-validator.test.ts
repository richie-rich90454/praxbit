import { describe, expect, it } from "vitest";
import {
    inferCodeVerification,
    parseMissionSolution,
    runCodeTests,
    runMissionReferenceSolutions,
    validateContentDocuments,
} from "../../packages/content-validator/src/index.ts";
import type { LoadedContent } from "../../packages/content-validator/src/index.ts";
import { runAstTests } from "../../packages/execution/src/browser/ast-runner.ts";
import type { CodeStep, CodeTest, Mission, Track } from "../../packages/contracts/src/index.ts";
import { makeMission, makeQuizStep, makeSkill, makeSkillDocument } from "./support/fixtures.ts";

function loadedContent(
    missions: readonly Mission[] = [],
    tracks: readonly Track[] = [],
): LoadedContent {
    return {
        skills: makeSkillDocument([makeSkill("concept.testing")]),
        tracks,
        missions,
        placement: { version: 1, questions: [], recommendations: [] },
        projects: [],
        achievements: [],
        events: [],
        missionPaths: new Map(
            missions.map(function toEntry(mission): [string, string] {
                return [mission.id, `content/mission/${mission.id}.json`];
            }),
        ),
        rawFiles: [],
        issues: [],
    };
}

type AstTest = Extract<CodeTest, { kind: "ast" }>;

function makeAstTest(overrides: Partial<AstTest> = {}): AstTest {
    return {
        kind: "ast",
        description: "The source has the required shape.",
        file: "answer.js",
        language: "javascript",
        require: [{ node: "function-declaration", name: "answer" }],
        ...overrides,
    };
}

function makeCodeStep(overrides: Partial<CodeStep> = {}): CodeStep {
    return {
        kind: "code",
        id: "code",
        title: "Code step",
        prompt: "Edit the file.",
        language: "javascript",
        files: [
            {
                path: "answer.js",
                content: "function answer() {\n  return 1;\n}\n",
                editable: true,
                language: "javascript",
            },
        ],
        entry: "answer.js",
        preview: "console",
        tests: [makeAstTest()],
        ...overrides,
    };
}

function codeMission(step: CodeStep, overrides: Partial<Mission> = {}): Mission {
    return makeMission({
        steps: [step],
        objectives: [{ id: "objective", description: "Complete the step.", stepIds: [step.id] }],
        misconceptions: [
            {
                id: "one",
                description: "A wrong shape.",
                stepId: step.id,
                diagnostic: "The function is missing.",
                feedback: "Define the function.",
                followUpSkill: "concept.testing",
            },
            {
                id: "two",
                description: "Another wrong shape.",
                stepId: step.id,
                diagnostic: "The return is missing.",
                feedback: "Return a value.",
            },
        ],
        ...overrides,
    });
}

function issueCodes(issues: readonly { readonly code: string }[]): string[] {
    return issues.map(function codeOf(issue): string {
        return issue.code;
    });
}

describe("ast tests", function astTests(): void {
    const source = [
        "// function answer() { return 1; }",
        'const note = "function answer() { return 1; }";',
        "function answer(values) {",
        "  let total = 0;",
        "  for (const value of values) {",
        "    if (value > 0) { total += value; }",
        "  }",
        "  return total;",
        "}",
        "answer([1, 2]);",
    ].join("\n");

    it("matches real nodes and ignores comments and strings", async function ignoresText(): Promise<void> {
        const outcomes = await runAstTests({ "answer.js": source }, [
            makeAstTest({
                require: [
                    { node: "function-declaration", name: "answer" },
                    { node: "variable-declaration", name: "total" },
                    { node: "for-statement" },
                    { node: "if-statement" },
                    { node: "return-statement" },
                    { node: "function-call", name: "answer" },
                ],
            }),
        ]);
        expect(outcomes[0]?.passed).toBe(true);
    });

    it("does not treat commented or quoted calls as forbidden nodes", async function forbidsRealNodes(): Promise<void> {
        const outcomes = await runAstTests({ "answer.js": source }, [
            makeAstTest({
                require: [{ node: "function-declaration", name: "answer" }],
                forbid: [{ node: "function-call", name: "eval" }],
            }),
        ]);
        expect(outcomes[0]?.passed).toBe(true);
    });

    it("reports a missing required node with a useful message", async function missingNode(): Promise<void> {
        const outcomes = await runAstTests({ "answer.js": source }, [
            makeAstTest({ require: [{ node: "function-declaration", name: "missing" }] }),
        ]);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain('function-declaration "missing"');
    });

    it("reports a forbidden node that is really present", async function forbiddenNode(): Promise<void> {
        const outcomes = await runAstTests({ "answer.js": source }, [
            makeAstTest({
                require: [{ node: "function-call", name: "answer" }],
                forbid: [{ node: "function-call", name: "answer" }],
            }),
        ]);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain('Forbids function-call "answer"');
    });

    it("parses TypeScript syntax and counts declarations", async function typescript(): Promise<void> {
        const outcomes = await runAstTests(
            { "answer.ts": "function answer(value: number): number {\n  return value;\n}\n" },
            [
                makeAstTest({
                    file: "answer.ts",
                    language: "typescript",
                    require: [
                        { node: "function-declaration", name: "answer" },
                        { node: "return-statement", min: 1 },
                    ],
                }),
            ],
        );
        expect(outcomes[0]?.passed).toBe(true);
    });

    it("fails a test when the source cannot be parsed", async function parseError(): Promise<void> {
        const outcomes = await runAstTests({ "answer.js": "function broken( {" }, [
            makeAstTest({ require: [{ node: "function-declaration" }] }),
        ]);
        expect(outcomes[0]?.passed).toBe(false);
        expect(outcomes[0]?.error).toContain("could not be parsed");
    });

    it("runs ast tests through the content runtime", async function runtimeIntegration(): Promise<void> {
        const report = await runCodeTests({
            language: "javascript",
            files: { "answer.js": "function answer() {\n  return 1;\n}\n" },
            entry: "answer.js",
            tests: [makeAstTest()],
        });
        expect(report.outcomes).toHaveLength(1);
        expect(report.outcomes[0]?.passed).toBe(true);
        expect(report.outcomes[0]?.deferred).toBe(false);
    });
});

describe("code verification modes", function verificationModes(): void {
    it("infers execution, ast, and structural modes from test kinds", function inference(): void {
        expect(
            inferCodeVerification([
                {
                    kind: "function",
                    description: "Runs.",
                    name: "answer",
                    args: [],
                    expected: 1,
                },
            ]),
        ).toBe("execution");
        expect(inferCodeVerification([makeAstTest()])).toBe("ast");
        expect(
            inferCodeVerification([
                {
                    kind: "static",
                    description: "Contains.",
                    file: "answer.js",
                    includes: ["answer"],
                    excludes: [],
                },
            ]),
        ).toBe("structural");
    });

    it("requires a structural declaration and local verification for static-only JavaScript", function staticOnly(): void {
        const step = makeCodeStep({
            tests: [
                {
                    kind: "static",
                    description: "Contains the function.",
                    file: "answer.js",
                    includes: ["function answer"],
                    excludes: [],
                },
            ],
        });
        const codes = issueCodes(validateContentDocuments(loadedContent([codeMission(step)])));
        expect(codes).toContain("verification-mode-missing");
        expect(codes).toContain("local-verification-missing");
        expect(codes).toContain("static-tests-javascript");
    });

    it("accepts an honest structural declaration for a non-executed language", function structuralLanguage(): void {
        const step = makeCodeStep({
            language: "java",
            files: [
                {
                    path: "Answer.java",
                    content: "class Answer {}\n",
                    editable: true,
                    language: "java",
                },
            ],
            entry: "Answer.java",
            verification: "structural",
            localVerification: {
                command: "javac Answer.java",
                description: "Compile locally with a JDK.",
            },
            tests: [
                {
                    kind: "static",
                    description: "Contains the class.",
                    file: "Answer.java",
                    includes: ["class Answer"],
                    excludes: [],
                },
            ],
        });
        const codes = issueCodes(
            validateContentDocuments(
                loadedContent(
                    [codeMission(step)],
                    [
                        {
                            id: "java",
                            title: "Java",
                            summary: "Java track.",
                            kind: "language",
                            missionIds: ["campus.test-mission"],
                            interests: ["professional"],
                        },
                    ],
                ),
            ),
        );
        expect(codes).not.toContain("verification-mode-missing");
        expect(codes).not.toContain("local-verification-missing");
        expect(codes).not.toContain("static-tests-javascript");
    });

    it("rejects an execution claim without an executable test", function overclaim(): void {
        const step = makeCodeStep({
            verification: "execution",
            tests: [makeAstTest()],
        });
        const codes = issueCodes(validateContentDocuments(loadedContent([codeMission(step)])));
        expect(codes).toContain("verification-overclaim");
    });

    it("accepts an ast declaration with an ast test", function astDeclaration(): void {
        const step = makeCodeStep({ verification: "ast" });
        const codes = issueCodes(validateContentDocuments(loadedContent([codeMission(step)])));
        expect(codes).not.toContain("verification-mode-mismatch");
        expect(codes).not.toContain("verification-overclaim");
    });
});

describe("mission and track standards", function contentStandards(): void {
    it("requires step hints on every assessed step", function stepHints(): void {
        const codes = issueCodes(validateContentDocuments(loadedContent([makeMission()])));
        expect(codes).toContain("step-hints-missing");
    });

    it("requires every assessed step to have a reachable misconception and a follow-up skill", function misconceptions(): void {
        const mission = makeMission({
            steps: [makeQuizStep("first"), makeQuizStep("second")],
            objectives: [
                { id: "objective", description: "Complete both.", stepIds: ["first", "second"] },
            ],
            misconceptions: [
                {
                    id: "one",
                    description: "Wrong first answer.",
                    stepId: "first",
                    answer: "wrong",
                    feedback: "Try again.",
                },
                {
                    id: "two",
                    description: "No signature.",
                    stepId: "second",
                    feedback: "Try again.",
                },
            ],
        });
        const codes = issueCodes(validateContentDocuments(loadedContent([mission])));
        expect(codes).toContain("step-misconception-missing");
        expect(codes).toContain("misconception-signature-missing");
        expect(codes).toContain("mission-follow-up-skill-missing");
    });

    it("rejects a misconception that matches the correct answer", function correctAnswer(): void {
        const mission = makeMission({
            misconceptions: [
                {
                    id: "one",
                    description: "Correct answer.",
                    stepId: "answer",
                    answer: "correct",
                    feedback: "Not a misconception.",
                    followUpSkill: "concept.testing",
                },
                {
                    id: "two",
                    description: "Wrong answer.",
                    stepId: "answer",
                    answer: "wrong",
                    feedback: "Try again.",
                },
            ],
            steps: [{ ...makeQuizStep("answer"), hints: ["One.", "Two.", "Three.", "Four."] }],
        });
        const codes = issueCodes(validateContentDocuments(loadedContent([mission])));
        expect(codes).toContain("misconception-answer-correct");
    });

    it("reports track mission shortfalls and missing transfer evidence", function trackStandards(): void {
        const track: Track = {
            id: "typescript",
            title: "TypeScript",
            summary: "A language track.",
            kind: "language",
            missionIds: ["campus.test-mission"],
            interests: ["web"],
        };
        const codes = issueCodes(validateContentDocuments(loadedContent([makeMission()], [track])));
        expect(codes).toContain("track-mission-minimum");
        expect(codes).toContain("track-transfer-missing");
    });
});

describe("starter and alternative solutions", function solutionRuns(): void {
    const step = makeCodeStep({
        files: [
            {
                path: "answer.js",
                content: "function answer() {\n  return 0;\n}\n",
                editable: true,
                language: "javascript",
            },
        ],
        tests: [
            {
                kind: "function",
                description: "Adds two numbers.",
                name: "answer",
                args: [2, 3],
                expected: 5,
            },
        ],
    });
    const mission = codeMission(step);
    const solution = "function answer() {\n  return 2 + 3;\n}\n";

    it("reports a starter that already passes every test", async function starterPasses(): Promise<void> {
        const report = await runMissionReferenceSolutions(loadedContent([mission]), {
            missionSolutions: new Map([
                [
                    mission.id,
                    {
                        missionId: mission.id,
                        steps: { code: { files: { "answer.js": solution } } },
                    },
                ],
            ]),
            projectSolutions: new Map(),
            issues: [],
        });
        expect(issueCodes(report.issues)).not.toContain("starter-passes-tests");
        const passingStarter = {
            ...step,
            files: [
                {
                    path: "answer.js",
                    content: solution,
                    editable: true,
                    language: "javascript",
                },
            ],
        };
        const failedReport = await runMissionReferenceSolutions(
            loadedContent([codeMission(passingStarter)]),
            {
                missionSolutions: new Map([
                    [
                        mission.id,
                        {
                            missionId: mission.id,
                            steps: { code: { files: { "answer.js": solution } } },
                        },
                    ],
                ]),
                projectSolutions: new Map(),
                issues: [],
            },
        );
        expect(issueCodes(failedReport.issues)).toContain("starter-passes-tests");
    });

    it("runs alternatives and reports a failing one", async function alternativeFails(): Promise<void> {
        const report = await runMissionReferenceSolutions(loadedContent([mission]), {
            missionSolutions: new Map([
                [
                    mission.id,
                    {
                        missionId: mission.id,
                        steps: {
                            code: {
                                files: { "answer.js": solution },
                                alternatives: [
                                    { "answer.js": "function answer() {\n  return 5;\n}\n" },
                                    { "answer.js": "function answer() {\n  return 1;\n}\n" },
                                ],
                            },
                        },
                    },
                ],
            ]),
            projectSolutions: new Map(),
            issues: [],
        });
        const failures = report.issues.filter(function isAlternative(issue): boolean {
            return issue.code === "alternative-solution-test-failed";
        });
        expect(failures).toHaveLength(1);
        expect(failures[0]?.path).toContain("alternatives/1");
    });
});

describe("solution alternatives", function solutionAlternatives(): void {
    it("parses optional alternatives for a code step", function parsesAlternatives(): void {
        const parsed = parseMissionSolution(
            "campus.test-mission",
            {
                steps: {
                    code: {
                        files: { "answer.js": "function answer() { return 1; }\n" },
                        alternatives: [
                            {
                                files: {
                                    "answer.js": "const answer = function () { return 1; };\n",
                                },
                            },
                        ],
                    },
                },
            },
            new Set(["code"]),
        );
        expect(parsed.issues).toEqual([]);
        expect(parsed.solution?.steps["code"]?.alternatives).toHaveLength(1);
    });

    it("rejects unknown keys inside an alternative", function rejectsUnknownKeys(): void {
        const parsed = parseMissionSolution(
            "campus.test-mission",
            {
                steps: {
                    code: {
                        files: { "answer.js": "function answer() { return 1; }\n" },
                        alternatives: [{ files: {}, note: "extra" }],
                    },
                },
            },
            new Set(["code"]),
        );
        expect(issueCodes(parsed.issues)).toContain("solution-shape");
    });
});

describe("validateContentDocuments", function contentValidator(): void {
    it("reports duplicate skill ids even though SkillGraph deduplicates them", function duplicateSkills(): void {
        const content = loadedContent();
        content.skills.skills.push(makeSkill("concept.testing"));
        const issues = validateContentDocuments(content);
        expect(
            issues.some(function duplicate(issue): boolean {
                return issue.code === "duplicate-skill-id";
            }),
        ).toBe(true);
    });

    it("reports unknown assets, missing skills, and missing tracks", function missionChecks(): void {
        const mission = makeMission({
            id: "campus.broken",
            skills: ["concept.missing"],
            assets: ["pip:unknown", "scene:elsewhere", "system:unknown", "icon:ok"],
        });
        const issues = validateContentDocuments(loadedContent([mission]));
        const codes = issues.map(function codeOf(issue): string {
            return issue.code;
        });
        expect(codes).toContain("mission-skill-missing");
        expect(codes).toContain("unknown-pip-pose");
        expect(codes).toContain("unknown-scene");
        expect(codes).toContain("unknown-system");
        expect(codes).toContain("mission-not-in-track");
    });

    it("reports a misconception that points at a missing step", function misconceptionStep(): void {
        const mission = makeMission({
            misconceptions: [
                {
                    id: "one",
                    description: "First.",
                    stepId: "missing-step",
                    feedback: "Feedback one.",
                },
                {
                    id: "two",
                    description: "Second.",
                    stepId: "missing-step",
                    feedback: "Feedback two.",
                },
            ],
        });
        const issues = validateContentDocuments(loadedContent([mission]));
        expect(
            issues.filter(function missingStep(issue): boolean {
                return issue.code === "misconception-step-missing";
            }),
        ).toHaveLength(2);
    });

    it("reports a misconception answer that is not a response key", function misconceptionAnswer(): void {
        const mission = makeMission({
            misconceptions: [
                {
                    id: "one",
                    description: "First.",
                    stepId: "answer",
                    answer: "not-an-option",
                    feedback: "Feedback one.",
                },
                {
                    id: "two",
                    description: "Second.",
                    stepId: "answer",
                    feedback: "Feedback two.",
                },
            ],
        });
        const issues = validateContentDocuments(loadedContent([mission]));
        expect(
            issues.some(function unmatched(issue): boolean {
                return issue.code === "misconception-answer-unmatched";
            }),
        ).toBe(true);
    });
});
