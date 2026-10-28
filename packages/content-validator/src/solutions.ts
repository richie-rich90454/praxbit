import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CodeStep, Mission, ProjectDefinition } from "@praxbit/contracts";
import { isSafeRelativePath } from "./paths.ts";
import { runCodeTests } from "./runtime/index.ts";
import { errorIssue } from "./types.ts";
import type {
    LoadedContent,
    MissionSolution,
    MissionStepSolution,
    ProjectSolution,
    ReferenceRunReport,
    ReferenceSolutionBundle,
    ValidationIssue,
} from "./types.ts";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
    record: Readonly<Record<string, unknown>>,
    allowed: readonly string[],
): string | undefined {
    for (const key of Object.keys(record)) {
        if (!allowed.includes(key)) {
            return key;
        }
    }
    return undefined;
}

function parseFileMap(
    value: unknown,
    pathLabel: string,
    issues: ValidationIssue[],
    allowedFiles?: ReadonlySet<string>,
): Readonly<Record<string, string>> | undefined {
    if (!isRecord(value)) {
        issues.push(
            errorIssue(
                "solution-files-type",
                pathLabel,
                "Solution files must be an object of file contents.",
            ),
        );
        return undefined;
    }
    const files: Record<string, string> = {};
    for (const [filePath, content] of Object.entries(value)) {
        if (!isSafeRelativePath(filePath)) {
            issues.push(
                errorIssue(
                    "unsafe-solution-path",
                    pathLabel,
                    `Unsafe solution file path: ${filePath}`,
                ),
            );
            continue;
        }
        if (allowedFiles !== undefined && !allowedFiles.has(filePath)) {
            issues.push(
                errorIssue(
                    "unknown-solution-file",
                    pathLabel,
                    `Solution file ${filePath} is not one of the authored project files.`,
                ),
            );
            continue;
        }
        if (typeof content !== "string") {
            issues.push(
                errorIssue(
                    "solution-file-content-type",
                    pathLabel,
                    `Solution file ${filePath} must be a string.`,
                ),
            );
            continue;
        }
        files[filePath] = content;
    }
    return files;
}

export interface ParsedMissionSolution {
    readonly solution?: MissionSolution;
    readonly issues: readonly ValidationIssue[];
}

export function parseMissionSolution(
    missionId: string,
    value: unknown,
    codeStepIds: ReadonlySet<string>,
): ParsedMissionSolution {
    const issues: ValidationIssue[] = [];
    const sourcePath = `content-solutions/${missionId}.json`;
    if (!isRecord(value)) {
        return {
            issues: [
                errorIssue("solution-shape", sourcePath, "A mission solution must be an object."),
            ],
        };
    }
    const unexpected = hasOnlyKeys(value, ["steps"]);
    if (unexpected !== undefined) {
        issues.push(
            errorIssue("solution-shape", sourcePath, `Unexpected solution key: ${unexpected}`),
        );
    }
    const stepsValue = value["steps"];
    if (!isRecord(stepsValue)) {
        issues.push(
            errorIssue("solution-shape", sourcePath, "A mission solution needs a steps object."),
        );
        return { issues };
    }
    const steps: Record<string, MissionStepSolution> = {};
    for (const [stepId, stepValue] of Object.entries(stepsValue)) {
        if (!codeStepIds.has(stepId)) {
            issues.push(
                errorIssue(
                    "solution-unknown-step",
                    sourcePath,
                    `Unknown code step in solution: ${stepId}`,
                ),
            );
            continue;
        }
        if (!isRecord(stepValue)) {
            issues.push(
                errorIssue(
                    "solution-shape",
                    sourcePath,
                    `Solution step ${stepId} must be an object.`,
                ),
            );
            continue;
        }
        const unexpectedStep = hasOnlyKeys(stepValue, ["files"]);
        if (unexpectedStep !== undefined) {
            issues.push(
                errorIssue(
                    "solution-shape",
                    sourcePath,
                    `Unexpected key in step ${stepId}: ${unexpectedStep}`,
                ),
            );
        }
        const files = parseFileMap(stepValue["files"], `${sourcePath}#${stepId}`, issues);
        if (files !== undefined) {
            steps[stepId] = { files };
        }
    }
    if (Object.keys(steps).length === 0) {
        issues.push(
            errorIssue(
                "solution-empty",
                sourcePath,
                "The solution does not define any step files.",
            ),
        );
    }
    return { solution: { missionId, steps }, issues };
}

export interface ParsedProjectSolutions {
    readonly solutions: ReadonlyMap<string, ProjectSolution>;
    readonly issues: readonly ValidationIssue[];
}

export function parseProjectSolutions(
    value: unknown,
    filesByProject: ReadonlyMap<string, ReadonlySet<string>>,
    stagesByProject: ReadonlyMap<string, ReadonlySet<string>>,
): ParsedProjectSolutions {
    const sourcePath = "content-solutions/projects.json";
    const issues: ValidationIssue[] = [];
    const solutions = new Map<string, ProjectSolution>();
    if (!isRecord(value)) {
        return {
            solutions,
            issues: [
                errorIssue("solution-shape", sourcePath, "Project solutions must be an object."),
            ],
        };
    }
    const unexpected = hasOnlyKeys(value, ["projects"]);
    if (unexpected !== undefined) {
        issues.push(
            errorIssue("solution-shape", sourcePath, `Unexpected solution key: ${unexpected}`),
        );
    }
    const projectsValue = value["projects"];
    if (!isRecord(projectsValue)) {
        issues.push(
            errorIssue("solution-shape", sourcePath, "Project solutions need a projects object."),
        );
        return { solutions, issues };
    }

    for (const [projectId, projectValue] of Object.entries(projectsValue)) {
        const allowedFiles = filesByProject.get(projectId);
        const allowedStages = stagesByProject.get(projectId);
        if (allowedFiles === undefined || allowedStages === undefined) {
            issues.push(
                errorIssue(
                    "solution-unknown-project",
                    sourcePath,
                    `Unknown project solution: ${projectId}`,
                ),
            );
            continue;
        }
        if (!isRecord(projectValue)) {
            issues.push(
                errorIssue(
                    "solution-shape",
                    sourcePath,
                    `Project solution ${projectId} must be an object.`,
                ),
            );
            continue;
        }
        const unexpectedProject = hasOnlyKeys(projectValue, ["files", "stages"]);
        if (unexpectedProject !== undefined) {
            issues.push(
                errorIssue(
                    "solution-shape",
                    sourcePath,
                    `Unexpected key in project ${projectId}: ${unexpectedProject}`,
                ),
            );
        }
        let files: Readonly<Record<string, string>> | undefined;
        if (projectValue["files"] !== undefined) {
            files = parseFileMap(
                projectValue["files"],
                `${sourcePath}#${projectId}`,
                issues,
                allowedFiles,
            );
        }
        let stages: Readonly<Record<string, MissionStepSolution>> | undefined;
        const stagesValue = projectValue["stages"];
        if (stagesValue !== undefined) {
            if (!isRecord(stagesValue)) {
                issues.push(
                    errorIssue(
                        "solution-shape",
                        sourcePath,
                        `Stages for ${projectId} must be an object.`,
                    ),
                );
            } else {
                const parsedStages: Record<string, MissionStepSolution> = {};
                for (const [stageId, stageValue] of Object.entries(stagesValue)) {
                    if (!allowedStages.has(stageId)) {
                        issues.push(
                            errorIssue(
                                "solution-unknown-stage",
                                sourcePath,
                                `Unknown stage in project solution ${projectId}: ${stageId}`,
                            ),
                        );
                        continue;
                    }
                    if (!isRecord(stageValue)) {
                        issues.push(
                            errorIssue(
                                "solution-shape",
                                sourcePath,
                                `Stage ${projectId}/${stageId} must be an object.`,
                            ),
                        );
                        continue;
                    }
                    const unexpectedStage = hasOnlyKeys(stageValue, ["files"]);
                    if (unexpectedStage !== undefined) {
                        issues.push(
                            errorIssue(
                                "solution-shape",
                                sourcePath,
                                `Unexpected key in stage ${projectId}/${stageId}: ${unexpectedStage}`,
                            ),
                        );
                    }
                    const stageFiles = parseFileMap(
                        stageValue["files"],
                        `${sourcePath}#${projectId}/${stageId}`,
                        issues,
                        allowedFiles,
                    );
                    if (stageFiles !== undefined) {
                        parsedStages[stageId] = { files: stageFiles };
                    }
                }
                stages = parsedStages;
            }
        }
        if (files === undefined && (stages === undefined || Object.keys(stages).length === 0)) {
            issues.push(
                errorIssue(
                    "solution-empty",
                    sourcePath,
                    `Project ${projectId} has neither shared files nor stage solutions.`,
                ),
            );
            continue;
        }
        solutions.set(projectId, {
            ...(files === undefined ? {} : { files }),
            ...(stages === undefined ? {} : { stages }),
        });
    }
    return { solutions, issues };
}

async function readJsonSolution(
    filePath: string,
    shownPath: string,
): Promise<{ readonly value?: unknown; readonly issue?: ValidationIssue }> {
    try {
        const text = await readFile(filePath, "utf8");
        try {
            return { value: JSON.parse(text) as unknown };
        } catch (error) {
            return {
                issue: errorIssue(
                    "solution-invalid-json",
                    shownPath,
                    `The solution is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
                ),
            };
        }
    } catch (error) {
        return {
            issue: errorIssue(
                "solution-missing",
                shownPath,
                `The solution could not be read: ${error instanceof Error ? error.message : String(error)}`,
            ),
        };
    }
}

export async function loadReferenceSolutions(
    repositoryRoot: string,
    missions: readonly Mission[],
    projects: readonly ProjectDefinition[],
): Promise<ReferenceSolutionBundle> {
    const solutionsRoot = path.join(repositoryRoot, "content-solutions");
    const issues: ValidationIssue[] = [];
    const missionSolutions = new Map<string, MissionSolution>();
    const projectSolutions = new Map<string, ProjectSolution>();

    const codeStepIdsByMission = new Map<string, ReadonlySet<string>>();
    for (const mission of missions) {
        const ids = new Set(
            mission.steps
                .filter(function isCode(step): step is CodeStep {
                    return step.kind === "code";
                })
                .map(function idOf(step): string {
                    return step.id;
                }),
        );
        if (ids.size > 0) {
            codeStepIdsByMission.set(mission.id, ids);
        }
    }

    let entries: readonly string[] = [];
    try {
        const directoryEntries = await readdir(solutionsRoot, { withFileTypes: true });
        entries = directoryEntries
            .filter(function isJson(entry): boolean {
                return entry.isFile() && entry.name.endsWith(".json");
            })
            .map(function nameOf(entry): string {
                return entry.name;
            })
            .sort();
    } catch (error) {
        issues.push(
            errorIssue(
                "solution-directory-missing",
                "content-solutions",
                `The solutions directory could not be read: ${error instanceof Error ? error.message : String(error)}`,
            ),
        );
    }

    for (const fileName of entries) {
        const filePath = path.join(solutionsRoot, fileName);
        const shownPath = `content-solutions/${fileName}`;
        const read = await readJsonSolution(filePath, shownPath);
        if (read.issue !== undefined) {
            issues.push(read.issue);
            continue;
        }
        if (fileName === "projects.json") {
            const filesByProject = new Map(
                projects.map(function toEntry(project): [string, ReadonlySet<string>] {
                    return [project.id, new Set(Object.keys(project.files))];
                }),
            );
            const stagesByProject = new Map(
                projects.map(function toEntry(project): [string, ReadonlySet<string>] {
                    return [
                        project.id,
                        new Set(
                            project.stages.map(function idOf(stage): string {
                                return stage.id;
                            }),
                        ),
                    ];
                }),
            );
            const parsed = parseProjectSolutions(read.value, filesByProject, stagesByProject);
            issues.push(...parsed.issues);
            for (const [projectId, solution] of parsed.solutions) {
                projectSolutions.set(projectId, solution);
            }
            continue;
        }

        const missionId = fileName.slice(0, -".json".length);
        const codeStepIds = codeStepIdsByMission.get(missionId);
        if (codeStepIds === undefined) {
            issues.push(
                errorIssue(
                    "solution-unknown-mission",
                    shownPath,
                    `No mission with code steps matches solution file ${fileName}.`,
                ),
            );
            continue;
        }
        const parsed = parseMissionSolution(missionId, read.value, codeStepIds);
        issues.push(...parsed.issues);
        if (parsed.solution !== undefined) {
            missionSolutions.set(missionId, parsed.solution);
        }
    }

    for (const missionId of codeStepIdsByMission.keys()) {
        if (!missionSolutions.has(missionId)) {
            issues.push(
                errorIssue(
                    "solution-missing",
                    `content-solutions/${missionId}.json`,
                    `Mission ${missionId} has code steps but no reference solution.`,
                ),
            );
        }
    }
    for (const project of projects) {
        if (!projectSolutions.has(project.id)) {
            issues.push(
                errorIssue(
                    "solution-missing",
                    "content-solutions/projects.json",
                    `Project ${project.id} has no reference solution.`,
                ),
            );
        }
    }

    return { missionSolutions, projectSolutions, issues };
}

function mergeFiles(
    base: Readonly<Record<string, string>>,
    override: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [filePath, content] of Object.entries(base)) {
        result[filePath] = content;
    }
    if (override !== undefined) {
        for (const [filePath, content] of Object.entries(override)) {
            result[filePath] = content;
        }
    }
    return result;
}

export async function runMissionReferenceSolutions(
    loaded: LoadedContent,
    bundle: ReferenceSolutionBundle,
): Promise<ReferenceRunReport> {
    const issues: ValidationIssue[] = [];
    let executedChecks = 0;
    let deferredChecks = 0;

    for (const mission of loaded.missions) {
        const codeSteps = mission.steps.filter(function isCode(step): step is CodeStep {
            return step.kind === "code";
        });
        if (codeSteps.length === 0) {
            continue;
        }
        const solution = bundle.missionSolutions.get(mission.id);
        if (solution === undefined) {
            continue;
        }
        for (const step of codeSteps) {
            const stepSolution = solution.steps[step.id];
            if (stepSolution === undefined) {
                issues.push(
                    errorIssue(
                        "solution-step-missing",
                        `content-solutions/${mission.id}.json`,
                        `Solution does not cover code step ${mission.id}/${step.id}.`,
                    ),
                );
                continue;
            }
            const files = mergeFiles(
                Object.fromEntries(
                    step.files.map(function toEntry(file): [string, string] {
                        return [file.path, file.content];
                    }),
                ),
                stepSolution.files,
            );
            const report = await runCodeTests({
                language: step.language,
                files,
                entry: step.entry,
                tests: step.tests,
                ...(step.database === undefined ? {} : { database: step.database }),
            });
            const sourcePath = `content-solutions/${mission.id}.json#${step.id}`;
            for (const outcome of report.outcomes) {
                if (outcome.deferred) {
                    deferredChecks += 1;
                    continue;
                }
                executedChecks += 1;
                if (!outcome.passed) {
                    issues.push(
                        errorIssue(
                            "reference-solution-test-failed",
                            sourcePath,
                            `Test "${outcome.description}" failed: ${outcome.error ?? "no detail"}`,
                        ),
                    );
                }
            }
        }
    }

    return { issues, executedChecks, deferredChecks };
}

export async function runProjectReferenceSolutions(
    projects: readonly ProjectDefinition[],
    bundle: ReferenceSolutionBundle,
): Promise<ReferenceRunReport> {
    const issues: ValidationIssue[] = [];
    let executedChecks = 0;
    let deferredChecks = 0;

    for (const project of projects) {
        const solution = bundle.projectSolutions.get(project.id);
        if (solution === undefined) {
            continue;
        }
        for (const stage of project.stages) {
            const stageSolution = solution.stages?.[stage.id];
            const files = mergeFiles(
                mergeFiles(project.files, solution.files),
                stageSolution?.files,
            );
            const report = await runCodeTests({
                language: project.language,
                files,
                entry: project.entry,
                tests: stage.tests,
                ...(project.database === undefined ? {} : { database: project.database }),
            });
            const sourcePath = `content-solutions/projects.json#${project.id}/${stage.id}`;
            for (const outcome of report.outcomes) {
                if (outcome.deferred) {
                    deferredChecks += 1;
                    continue;
                }
                executedChecks += 1;
                if (!outcome.passed) {
                    issues.push(
                        errorIssue(
                            "reference-solution-test-failed",
                            sourcePath,
                            `Test "${outcome.description}" failed: ${outcome.error ?? "no detail"}`,
                        ),
                    );
                }
            }
        }
    }

    return { issues, executedChecks, deferredChecks };
}
