import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { validateRepository } from "../../packages/content-validator/src/index.ts";
import type { RepositoryValidation } from "../../packages/content-validator/src/index.ts";
import type { CodeStep, MissionStep } from "../../packages/contracts/src/index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

let validationResult: Promise<RepositoryValidation> | undefined;

async function validation(): Promise<RepositoryValidation> {
    validationResult ??= validateRepository(ROOT);
    return await validationResult;
}

function codeSteps(missionSteps: readonly MissionStep[]): readonly CodeStep[] {
    return missionSteps.filter(function isCode(step): step is CodeStep {
        return step.kind === "code";
    });
}

describe("reference solutions", function referenceSolutions(): void {
    it("validates the whole repository without errors", async function valid(): Promise<void> {
        const result = await validation();
        const errors = result.report.issues.filter(function isError(issue): boolean {
            return issue.severity === "error";
        });
        expect(errors).toEqual([]);
        expect(result.report.executedChecks).toBeGreaterThan(100);
    }, 30_000);

    it("covers every mission with code steps", async function missionCoverage(): Promise<void> {
        const result = await validation();
        const missions = result.content.missions.filter(function hasCode(mission): boolean {
            return codeSteps(mission.steps).length > 0;
        });
        expect(missions.length).toBeGreaterThanOrEqual(20);
        for (const mission of missions) {
            const solution = result.solutions.missionSolutions.get(mission.id);
            expect(solution, mission.id).toBeDefined();
            for (const step of codeSteps(mission.steps)) {
                expect(solution?.steps[step.id], `${mission.id}/${step.id}`).toBeDefined();
            }
        }
    });

    it("covers every project and stage", async function projectCoverage(): Promise<void> {
        const result = await validation();
        expect(result.content.projects.length).toBeGreaterThanOrEqual(3);
        for (const project of result.content.projects) {
            expect(result.solutions.projectSolutions.get(project.id), project.id).toBeDefined();
        }
    });

    it("counts every CSS check as deferred instead of passing it", async function deferredCss(): Promise<void> {
        const result = await validation();
        let cssChecks = 0;
        for (const mission of result.content.missions) {
            for (const step of codeSteps(mission.steps)) {
                cssChecks += step.tests.filter(function isCss(test): boolean {
                    return test.kind === "css";
                }).length;
            }
        }
        for (const project of result.content.projects) {
            for (const stage of project.stages) {
                cssChecks += stage.tests.filter(function isCss(test): boolean {
                    return test.kind === "css";
                }).length;
            }
        }
        expect(cssChecks).toBeGreaterThan(0);
        expect(result.report.deferredChecks).toBe(cssChecks);
    });

    it("runs all non-deferred checks for real", async function executed(): Promise<void> {
        const result = await validation();
        let declared = 0;
        for (const mission of result.content.missions) {
            for (const step of codeSteps(mission.steps)) {
                declared += step.tests.length;
            }
        }
        for (const project of result.content.projects) {
            for (const stage of project.stages) {
                declared += stage.tests.length;
            }
        }
        const total = result.report.executedChecks + result.report.deferredChecks;
        expect(total).toBe(declared);
    });
});
