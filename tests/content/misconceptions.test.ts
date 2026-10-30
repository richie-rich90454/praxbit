import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { evaluateStep } from "../../packages/domain/src/missions/evaluation.ts";
import type { StepResponse } from "../../packages/domain/src/missions/evaluation.ts";
import { loadContent } from "../../packages/content-validator/src/index.ts";
import type { MissionStep } from "../../packages/contracts/src/index.ts";

function responseFor(step: MissionStep, answer: string): StepResponse | undefined {
    switch (step.kind) {
        case "quiz":
            return { kind: "quiz", optionId: answer };
        case "machine": {
            const prediction = step.prediction.options.some(function matches(option): boolean {
                return option.id === answer;
            });
            const transfer = step.transfer.options.some(function matches(option): boolean {
                return option.id === answer;
            });
            if (prediction) {
                return {
                    kind: "machine",
                    runs: step.machine.minRuns,
                    predictionId: answer,
                    transferId: step.transfer.correctId,
                };
            }
            if (transfer) {
                return {
                    kind: "machine",
                    runs: step.machine.minRuns,
                    predictionId: step.prediction.correctId,
                    transferId: answer,
                };
            }
            return undefined;
        }
        case "order":
            return { kind: "order", order: answer.split(",") };
        case "rule":
            return { kind: "rule", ruleId: answer };
        case "debug": {
            const parts = answer.split(":");
            if (parts.length === 2) {
                return { kind: "debug", buggyId: parts[0] ?? "", fixId: parts[1] ?? "" };
            }
            const isInstruction = step.instructions.some(function matches(item): boolean {
                return item.id === answer;
            });
            return {
                kind: "debug",
                buggyId: isInstruction ? answer : step.buggyId,
                fixId: isInstruction ? step.correctFixId : answer,
            };
        }
        case "binary":
            return { kind: "binary", bits: answer };
        case "filesystem":
            return { kind: "filesystem", path: answer.split("/") };
        case "network":
            return { kind: "network", path: answer.split(">") };
        case "state": {
            try {
                const values = JSON.parse(answer) as Readonly<Record<string, string>>;
                return { kind: "state", values };
            } catch {
                return undefined;
            }
        }
        case "trace": {
            try {
                const values = JSON.parse(answer) as Readonly<Record<string, string>>;
                return { kind: "trace", values };
            } catch {
                return undefined;
            }
        }
        case "loop": {
            const separator = answer.indexOf(":");
            if (separator < 0) {
                return undefined;
            }
            const repeat = Number.parseInt(answer.slice(0, separator), 10);
            if (!Number.isInteger(repeat)) {
                return undefined;
            }
            return {
                kind: "loop",
                repeat,
                body: answer
                    .slice(separator + 1)
                    .split(",")
                    .filter(function present(item): boolean {
                        return item.length > 0;
                    }),
            };
        }
        case "review": {
            const separator = answer.indexOf(":");
            if (separator >= 0) {
                return {
                    kind: "review",
                    verdict: answer.slice(0, separator),
                    findings: answer
                        .slice(separator + 1)
                        .split(",")
                        .filter(function present(item): boolean {
                            return item.length > 0;
                        }),
                };
            }
            return {
                kind: "review",
                verdict: step.correctVerdict,
                findings: answer.split(",").filter(function present(item): boolean {
                    return item.length > 0;
                }),
            };
        }
        case "test-design":
            return {
                kind: "test-design",
                selected: answer.split(",").filter(function present(item): boolean {
                    return item.length > 0;
                }),
            };
        case "explain":
            return {
                kind: "explain",
                selected: answer.split(",").filter(function present(item): boolean {
                    return item.length > 0;
                }),
            };
        case "code":
            return {
                kind: "code",
                passedTests: [],
                failedTests: [answer],
                totalTests: 1,
            };
        default:
            return undefined;
    }
}

describe("misconception answer keys", function misconceptionAnswers(): void {
    it("every authored answer is a response that still fails the step", async function fails(): Promise<void> {
        const content = await loadContent(fileURLToPath(new URL("../../content", import.meta.url)));
        expect(content.issues).toEqual([]);
        let checked = 0;
        for (const mission of content.missions) {
            for (const misconception of mission.misconceptions) {
                if (misconception.answer === undefined) {
                    continue;
                }
                const step = mission.steps.find(function sameStep(item): boolean {
                    return item.id === misconception.stepId;
                });
                expect(step, `${mission.id}/${misconception.id}`).toBeDefined();
                if (step === undefined) {
                    continue;
                }
                const response = responseFor(step, misconception.answer);
                expect(
                    response,
                    `${mission.id}/${misconception.id} answer ${misconception.answer}`,
                ).toBeDefined();
                if (response === undefined) {
                    continue;
                }
                const result = evaluateStep(step, response);
                expect(result.passed, `${mission.id}/${misconception.id}`).toBe(false);
                checked += 1;
            }
        }
        expect(checked).toBeGreaterThanOrEqual(10);
    });
});
