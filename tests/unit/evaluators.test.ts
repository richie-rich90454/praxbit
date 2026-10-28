import { describe, expect, it } from "vitest";
import {
    assistanceForHints,
    defaultEvidenceCategory,
    evaluateMission,
    evaluateStep,
    independenceForHints,
    isRuntimeStep,
} from "../../packages/domain/src/missions/evaluation.ts";
import type { StepResponse } from "../../packages/domain/src/missions/evaluation.ts";
import { loadContent } from "../../packages/content-validator/src/index.ts";
import type { MissionStep } from "../../packages/contracts/src/index.ts";
import { fileURLToPath } from "node:url";
import { makeMission, makeQuizStep } from "./support/fixtures.ts";

function correctResponse(step: MissionStep): StepResponse {
    switch (step.kind) {
        case "lesson":
            return { kind: "lesson", acknowledged: true };
        case "quiz":
            return { kind: "quiz", optionId: step.quiz.correctId };
        case "machine":
            return {
                kind: "machine",
                runs: step.machine.minRuns,
                predictionId: step.prediction.correctId,
                transferId: step.transfer.correctId,
            };
        case "order":
            return { kind: "order", order: step.correctOrder };
        case "state":
            return { kind: "state", values: step.target };
        case "rule":
            return { kind: "rule", ruleId: step.correctRuleId };
        case "loop":
            return { kind: "loop", repeat: step.correctRepeat, body: step.correctBody };
        case "trace": {
            const finalSnapshot = step.snapshots[step.snapshots.length - 1];
            return { kind: "trace", values: finalSnapshot?.values ?? {} };
        }
        case "debug":
            return { kind: "debug", buggyId: step.buggyId, fixId: step.correctFixId };
        case "binary":
            return { kind: "binary", bits: step.expectedBits };
        case "filesystem":
            return { kind: "filesystem", path: step.targetPath };
        case "network":
            return { kind: "network", path: step.correctPath };
        case "review":
            return {
                kind: "review",
                findings: step.findings
                    .filter(function correct(finding): boolean {
                        return finding.correct;
                    })
                    .map(function idOf(finding): string {
                        return finding.id;
                    }),
                verdict: step.correctVerdict,
            };
        case "code":
            return {
                kind: "code",
                passedTests: step.tests.map(function nameOf(test): string {
                    return test.description;
                }),
                failedTests: [],
                totalTests: step.tests.length,
            };
        case "git":
            return { kind: "git", checks: { branch: true }, log: [] };
        case "terminal":
            return {
                kind: "terminal",
                completedObjectiveIds: step.objectives.map(function idOf(objective): string {
                    return objective.id;
                }),
                transcript: [],
            };
        case "test-design":
            return {
                kind: "test-design",
                selected: step.cases
                    .filter(function selected(testCase): boolean {
                        return testCase.shouldSelect;
                    })
                    .map(function idOf(testCase): string {
                        return testCase.id;
                    }),
            };
        case "explain":
            return {
                kind: "explain",
                selected: step.statements
                    .filter(function correct(statement): boolean {
                        return statement.correct;
                    })
                    .map(function idOf(statement): string {
                        return statement.id;
                    }),
            };
    }
}

describe("StepEvaluator", function stepEvaluator(): void {
    it("passes every authored step with its correct response", async function allAuthoredSteps(): Promise<void> {
        const contentRoot = fileURLToPath(new URL("../../content", import.meta.url));
        const content = await loadContent(contentRoot);
        expect(content.issues).toEqual([]);
        let evaluated = 0;
        for (const mission of content.missions) {
            for (const step of mission.steps) {
                const result = evaluateStep(step, correctResponse(step));
                expect(result.stepId).toBe(step.id);
                expect(result.passed, `${mission.id}/${step.id}`).toBe(true);
                expect(result.score, `${mission.id}/${step.id}`).toBeGreaterThanOrEqual(0.5);
                evaluated += 1;
            }
        }
        expect(evaluated).toBeGreaterThanOrEqual(100);
        expect(evaluated).toBe(
            content.missions.reduce(function total(sum, mission): number {
                return sum + mission.steps.length;
            }, 0),
        );
    });

    it("rejects a response of the wrong interaction kind", function wrongKind(): void {
        const step = makeQuizStep("answer");
        const result = evaluateStep(step, { kind: "order", order: ["a"] });
        expect(result.passed).toBe(false);
        expect(result.score).toBe(0);
        expect(result.detail.length).toBeGreaterThan(0);
    });

    it("rejects a lesson that was not acknowledged", function lesson(): void {
        const step: MissionStep = {
            kind: "lesson",
            id: "read",
            title: "Read",
            prompt: "Read the explanation.",
            sections: [{ title: "Concept", body: "A concept." }],
            vocabulary: [{ term: "Term", definition: "Definition." }],
        };
        expect(evaluateStep(step, { kind: "lesson", acknowledged: false }).passed).toBe(false);
        expect(evaluateStep(step, { kind: "lesson", acknowledged: true }).passed).toBe(true);
        expect(defaultEvidenceCategory(step)).toBe("explanation");
    });

    it("scores order steps by correct positions", function order(): void {
        const step: MissionStep = {
            kind: "order",
            id: "order-steps",
            title: "Order",
            prompt: "Order the steps.",
            items: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
                { id: "c", label: "C" },
            ],
            correctOrder: ["a", "b", "c"],
            explanation: "A then B then C.",
        };
        const result = evaluateStep(step, { kind: "order", order: ["a", "c", "b"] });
        expect(result.passed).toBe(false);
        expect(result.score).toBeCloseTo(1 / 3);
    });

    it("normalizes whitespace in binary answers", function binary(): void {
        const step: MissionStep = {
            kind: "binary",
            id: "bits",
            title: "Bits",
            prompt: "Encode the message.",
            message: "A",
            bitsPerChar: 8,
            expectedBits: "01000001",
            reference: [
                { char: "A", bits: "01000001" },
                { char: "B", bits: "01000010" },
            ],
            explanation: "A is 01000001.",
        };
        expect(evaluateStep(step, { kind: "binary", bits: "0100 0001" }).passed).toBe(true);
        expect(evaluateStep(step, { kind: "binary", bits: "01000000" }).passed).toBe(false);
    });

    it("rejects a code step when there are no tests", function zeroTests(): void {
        const step: MissionStep = {
            kind: "code",
            id: "code",
            title: "Code",
            prompt: "Write code.",
            language: "javascript",
            files: [{ path: "main.js", content: "", editable: true, language: "javascript" }],
            entry: "main.js",
            preview: "console",
            tests: [
                {
                    kind: "function",
                    description: "Unused function test.",
                    name: "missing",
                    args: [],
                    expected: true,
                },
            ],
        };
        const result = evaluateStep(step, {
            kind: "code",
            passedTests: [],
            failedTests: [],
            totalTests: 0,
        });
        expect(result.passed).toBe(false);
        expect(result.score).toBe(0);
    });

    it("rejects a review with a false positive finding", function reviewFalsePositive(): void {
        const step: MissionStep = {
            kind: "review",
            id: "review",
            title: "Review",
            prompt: "Review the artifact.",
            artifact: {
                title: "Code",
                caption: "A snippet.",
                kind: "code",
                language: "javascript",
                content: "const value = 1;",
            },
            findings: [
                { id: "real", label: "A real problem.", correct: true },
                { id: "noise", label: "Not a problem.", correct: false },
            ],
            verdicts: [
                { id: "accept", label: "Accept" },
                { id: "revise", label: "Revise" },
            ],
            correctVerdict: "revise",
            explanation: "Revise the code.",
        };
        expect(
            evaluateStep(step, { kind: "review", findings: ["real", "noise"], verdict: "revise" })
                .passed,
        ).toBe(false);
        expect(
            evaluateStep(step, { kind: "review", findings: ["real"], verdict: "revise" }).passed,
        ).toBe(true);
    });

    it("rejects extra selected test cases", function testDesign(): void {
        const step: MissionStep = {
            kind: "test-design",
            id: "design",
            title: "Design",
            prompt: "Select the cases.",
            cases: [
                { id: "boundary", label: "Boundary", shouldSelect: true },
                { id: "ordinary", label: "Ordinary", shouldSelect: false },
                { id: "invalid", label: "Invalid", shouldSelect: true },
            ],
            explanation: "Keep boundary and invalid cases.",
        };
        expect(
            evaluateStep(step, {
                kind: "test-design",
                selected: ["boundary", "invalid", "ordinary"],
            }).passed,
        ).toBe(false);
        expect(
            evaluateStep(step, { kind: "test-design", selected: ["invalid", "boundary"] }).passed,
        ).toBe(true);
    });

    it("scores partial terminal objective completion", function terminal(): void {
        const step: MissionStep = {
            kind: "terminal",
            id: "terminal",
            title: "Terminal",
            prompt: "Recover the service.",
            initial: {
                cwd: "/srv",
                files: [{ path: "/srv/app.js", content: "", mode: "644" }],
                services: [{ id: "api", name: "api", status: "failed", logs: [] }],
                symlinks: [],
            },
            objectives: [
                {
                    id: "one",
                    description: "First.",
                    check: { kind: "service", serviceId: "api", status: "running" },
                },
                {
                    id: "two",
                    description: "Second.",
                    check: { kind: "command-output", contains: "healthy" },
                },
            ],
            explanation: "Recovered.",
        };
        const result = evaluateStep(step, {
            kind: "terminal",
            completedObjectiveIds: ["one"],
            transcript: [],
        });
        expect(result.passed).toBe(false);
        expect(result.score).toBe(0.5);
    });

    it("maps assistance and independence from hint usage", function hints(): void {
        expect(assistanceForHints(0)).toBe("independent");
        expect(assistanceForHints(2)).toBe("hint-2");
        expect(assistanceForHints(9)).toBe("hint-4");
        expect(independenceForHints(0)).toBe(1);
        expect(independenceForHints(4)).toBe(0.2);
        expect(independenceForHints(99)).toBe(0.2);
    });

    it("identifies runtime steps", function runtimeSteps(): void {
        const quiz = makeQuizStep("quiz");
        expect(isRuntimeStep(quiz)).toBe(false);
    });
});

describe("Mission evaluation", function missionEvaluation(): void {
    it("completes only when every step passes the threshold", function complete(): void {
        const mission = makeMission({
            steps: [makeQuizStep("one"), makeQuizStep("two")],
            objectives: [{ id: "all", description: "All steps.", stepIds: ["one", "two"] }],
            evaluation: { kind: "steps", passScore: 1 },
        });
        const result = evaluateMission(mission, {
            one: { stepId: "one", passed: true, score: 1, detail: "ok" },
            two: { stepId: "two", passed: true, score: 1, detail: "ok" },
        });
        expect(result.completed).toBe(true);
        expect(result.score).toBe(1);
        expect(result.failedStepIds).toEqual([]);
    });

    it("reports failed and missing steps", function partial(): void {
        const mission = makeMission({
            steps: [makeQuizStep("one"), makeQuizStep("two")],
            evaluation: { kind: "steps", passScore: 0.5 },
        });
        const result = evaluateMission(mission, {
            one: { stepId: "one", passed: true, score: 1, detail: "ok" },
        });
        expect(result.completed).toBe(false);
        expect(result.score).toBe(0.5);
        expect(result.failedStepIds).toEqual(["two"]);
    });
});
