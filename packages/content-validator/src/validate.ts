import { createHash } from "node:crypto";
import {
    WorldSystemIdSchema,
    type AchievementDefinition,
    type CodeStep,
    type CodeTest,
    type ContentLanguage,
    type Mission,
    type MissionStep,
    type ProjectDefinition,
    type SkillDefinition,
} from "@praxbit/contracts";
import { SkillGraph } from "@praxbit/domain";
import { isSafeRelativePath } from "./paths.ts";
import { errorIssue, warningIssue } from "./types.ts";
import type { LoadedContent, ValidationIssue } from "./types.ts";

export type CodeLanguage = ContentLanguage;

const VALID_TEST_KINDS: Readonly<Record<CodeLanguage, readonly CodeTest["kind"][]>> = {
    javascript: ["function", "dom", "css", "regex", "static", "json"],
    typescript: ["function", "regex", "static", "json"],
    html: ["dom", "css", "regex", "static", "json"],
    css: ["css", "regex", "static"],
    json: ["json", "regex", "static"],
    python: ["function", "regex", "static"],
    sql: ["sql"],
    text: ["regex", "static"],
    java: ["regex", "static"],
    c: ["regex", "static"],
    cpp: ["regex", "static"],
    csharp: ["regex", "static"],
    go: ["regex", "static"],
    rust: ["regex", "static"],
    kotlin: ["regex", "static"],
    swift: ["regex", "static"],
    ruby: ["regex", "static"],
    zig: ["regex", "static"],
    lua: ["regex", "static"],
};

const RUNTIME_FOR_LANGUAGE: Readonly<Record<CodeLanguage, string>> = {
    javascript: "browser-javascript",
    typescript: "browser-typescript",
    html: "browser-html",
    css: "browser-css",
    json: "static-analysis",
    python: "browser-python",
    sql: "browser-sql",
    text: "static-analysis",
    java: "static-analysis",
    c: "static-analysis",
    cpp: "static-analysis",
    csharp: "static-analysis",
    go: "static-analysis",
    rust: "static-analysis",
    kotlin: "static-analysis",
    swift: "static-analysis",
    ruby: "static-analysis",
    zig: "static-analysis",
    lua: "static-analysis",
};

const PIP_POSES = new Set(["observing", "explaining", "thinking", "alert", "celebrating"]);
const SYSTEMS = new Set<string>(WorldSystemIdSchema.options);

const RULE_KIND: Readonly<Record<AchievementDefinition["rule"], AchievementDefinition["kind"]>> = {
    "first-independent-transfer": "independent-transfer",
    "three-boundary-tests": "hidden-boundary",
    "five-debugging-successes": "difficult-debugging",
    "team-event-participation": "helping-teammate",
    "first-project-complete": "authentic-project",
    "three-ai-reviews": "ai-review",
    "second-language": "new-language",
    "world-recovered": "recovery",
};

function pathForMission(loaded: LoadedContent, missionId: string): string {
    return loaded.missionPaths.get(missionId) ?? `content/mission/${missionId}.json`;
}

function checkUnique(
    values: readonly string[],
    code: string,
    filePath: string,
    label: string,
    issues: ValidationIssue[],
): void {
    const seen = new Map<string, number>();
    for (const value of values) {
        seen.set(value, (seen.get(value) ?? 0) + 1);
    }
    for (const [value, count] of seen) {
        if (count > 1) {
            issues.push(errorIssue(code, filePath, `${label} "${value}" appears ${count} times.`));
        }
    }
}

function validateSkillGraph(loaded: LoadedContent, issues: ValidationIssue[]): void {
    const ids = loaded.skills.skills.map(function idOf(skill: SkillDefinition): string {
        return skill.id;
    });
    checkUnique(ids, "duplicate-skill-id", "content/skills.json", "Skill id", issues);

    const graph = new SkillGraph(loaded.skills);
    for (const issue of graph.validate()) {
        issues.push(
            errorIssue(
                `skill-graph-${issue.kind}`,
                "content/skills.json",
                `Skill ${issue.skillId}: ${issue.message}`,
            ),
        );
    }
}

function validateAssets(mission: Mission, filePath: string, issues: ValidationIssue[]): void {
    for (const asset of mission.assets) {
        const separator = asset.indexOf(":");
        const prefix = separator < 0 ? asset : asset.slice(0, separator);
        const value = separator < 0 ? "" : asset.slice(separator + 1);
        if (prefix === "pip") {
            if (!PIP_POSES.has(value)) {
                issues.push(
                    errorIssue(
                        "unknown-pip-pose",
                        filePath,
                        `Mission ${mission.id} uses pip:${value}; known poses are ${[...PIP_POSES].join(", ")}.`,
                    ),
                );
            }
        } else if (prefix === "scene") {
            if (value !== "campus") {
                issues.push(
                    errorIssue(
                        "unknown-scene",
                        filePath,
                        `Mission ${mission.id} uses an unknown scene: ${asset}.`,
                    ),
                );
            }
        } else if (prefix === "system") {
            if (!SYSTEMS.has(value)) {
                issues.push(
                    errorIssue(
                        "unknown-system",
                        filePath,
                        `Mission ${mission.id} uses an unknown system: ${asset}.`,
                    ),
                );
            }
        } else if (prefix === "icon") {
            if (!/^[a-z0-9-]+$/.test(value)) {
                issues.push(
                    errorIssue(
                        "invalid-icon",
                        filePath,
                        `Mission ${mission.id} uses an invalid icon slug: ${asset}.`,
                    ),
                );
            }
        } else {
            issues.push(
                errorIssue(
                    "invalid-asset",
                    filePath,
                    `Mission ${mission.id} uses an unsupported asset form: ${asset}.`,
                ),
            );
        }
    }
}

function validateHints(mission: Mission, filePath: string, issues: ValidationIssue[]): void {
    if (mission.hints.length !== 4) {
        issues.push(
            errorIssue(
                "mission-hint-count",
                filePath,
                `Mission ${mission.id} has ${mission.hints.length} hints; exactly 4 are required.`,
            ),
        );
    }
    const normalized = mission.hints.map(function normalize(hint: string): string {
        return hint.trim();
    });
    checkUnique(normalized, "duplicate-hint", filePath, "Mission hint", issues);
    for (const step of mission.steps) {
        if (step.hints === undefined) {
            continue;
        }
        if (step.hints.length !== 4) {
            issues.push(
                errorIssue(
                    "step-hint-count",
                    filePath,
                    `Step ${mission.id}/${step.id} has ${step.hints.length} hints; exactly 4 are required when present.`,
                ),
            );
        }
        for (const hint of step.hints) {
            if (hint.trim().length === 0) {
                issues.push(
                    errorIssue(
                        "empty-step-hint",
                        filePath,
                        `Step ${mission.id}/${step.id} has an empty hint.`,
                    ),
                );
            }
        }
    }
}

function parseJsonObject(answer: string): Readonly<Record<string, unknown>> | undefined {
    try {
        const value: unknown = JSON.parse(answer);
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            return value as Readonly<Record<string, unknown>>;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

function answerMatchesStep(step: MissionStep, answer: string): boolean {
    switch (step.kind) {
        case "quiz":
            return step.quiz.options.some(function option(item): boolean {
                return item.id === answer;
            });
        case "machine":
            return (
                step.prediction.options.some(function option(item): boolean {
                    return item.id === answer;
                }) ||
                step.transfer.options.some(function option(item): boolean {
                    return item.id === answer;
                }) ||
                step.prediction.options.some(function predicted(item): boolean {
                    return step.transfer.options.some(function transferred(other): boolean {
                        return `${item.id}:${other.id}` === answer;
                    });
                })
            );
        case "order": {
            const ids = new Set(
                step.items.map(function itemId(item): string {
                    return item.id;
                }),
            );
            const parts = answer.split(",");
            return (
                parts.length === step.items.length &&
                new Set(parts).size === parts.length &&
                parts.every(function known(part): boolean {
                    return ids.has(part);
                })
            );
        }
        case "state": {
            const values = parseJsonObject(answer);
            if (values === undefined) {
                return false;
            }
            const cells = new Set(
                step.cells.map(function cellId(cell): string {
                    return cell.id;
                }),
            );
            return Object.entries(values).every(function known(entry): boolean {
                return cells.has(entry[0]) && typeof entry[1] === "string";
            });
        }
        case "rule":
            return step.rules.some(function rule(item): boolean {
                return item.id === answer;
            });
        case "loop": {
            const separator = answer.indexOf(":");
            if (separator < 0) {
                return false;
            }
            const repeat = Number(answer.slice(0, separator));
            const body = answer.slice(separator + 1).split(",");
            const ids = new Set(
                step.bodyItems.map(function itemId(item): string {
                    return item.id;
                }),
            );
            return (
                step.repeatChoices.includes(repeat) &&
                body.length === step.bodyItems.length &&
                new Set(body).size === body.length &&
                body.every(function known(part): boolean {
                    return ids.has(part);
                })
            );
        }
        case "trace": {
            const values = parseJsonObject(answer);
            if (values === undefined) {
                return false;
            }
            const watches = new Set(
                step.watches.map(function watchId(watch): string {
                    return watch.id;
                }),
            );
            return Object.entries(values).every(function known(entry): boolean {
                return watches.has(entry[0]) && typeof entry[1] === "string";
            });
        }
        case "debug":
            return (
                step.instructions.some(function instruction(item): boolean {
                    return item.id === answer;
                }) ||
                step.fixes.some(function fix(item): boolean {
                    return item.id === answer;
                }) ||
                step.instructions.some(function instruction(buggy): boolean {
                    return step.fixes.some(function fix(other): boolean {
                        return `${buggy.id}:${other.id}` === answer;
                    });
                })
            );
        case "binary":
            return /^[01]+$/.test(answer) && answer.length === step.expectedBits.length;
        case "filesystem": {
            const segments = answer.split("/").filter(function present(segment): boolean {
                return segment.length > 0;
            });
            const known = new Set<string>();
            for (const node of step.nodes) {
                for (const segment of node.path.split("/")) {
                    if (segment.length > 0) {
                        known.add(segment);
                    }
                }
            }
            return (
                segments.length >= 2 &&
                segments.every(function knownSegment(segment): boolean {
                    return known.has(segment);
                })
            );
        }
        case "network": {
            const ids = new Set(
                step.nodes.map(function nodeId(node): string {
                    return node.id;
                }),
            );
            const parts = answer.split(">");
            return (
                parts.length >= 2 &&
                parts.every(function known(part): boolean {
                    return ids.has(part);
                })
            );
        }
        case "review": {
            const findingIds = new Set(
                step.findings.map(function findingId(finding): string {
                    return finding.id;
                }),
            );
            if (
                step.verdicts.some(function verdict(item): boolean {
                    return item.id === answer;
                })
            ) {
                return true;
            }
            const colon = answer.indexOf(":");
            const verdict = colon < 0 ? undefined : answer.slice(0, colon);
            if (
                verdict !== undefined &&
                step.verdicts.some(function known(item): boolean {
                    return item.id === verdict;
                })
            ) {
                const findings = answer
                    .slice(colon + 1)
                    .split(",")
                    .filter(function present(item): boolean {
                        return item.length > 0;
                    });
                if (
                    findings.every(function known(finding): boolean {
                        return findingIds.has(finding);
                    })
                ) {
                    return true;
                }
            }
            const findings = answer.split(",").filter(function present(item): boolean {
                return item.length > 0;
            });
            return (
                findings.length > 0 &&
                findings.every(function known(finding): boolean {
                    return findingIds.has(finding);
                })
            );
        }
        case "test-design": {
            const ids = new Set(
                step.cases.map(function caseId(item): string {
                    return item.id;
                }),
            );
            const parts = answer.split(",").filter(function present(item): boolean {
                return item.length > 0;
            });
            return (
                parts.length > 0 &&
                parts.every(function known(part): boolean {
                    return ids.has(part);
                })
            );
        }
        case "explain": {
            const ids = new Set(
                step.statements.map(function statementId(item): string {
                    return item.id;
                }),
            );
            const parts = answer.split(",").filter(function present(item): boolean {
                return item.length > 0;
            });
            return (
                parts.length > 0 &&
                parts.every(function known(part): boolean {
                    return ids.has(part);
                })
            );
        }
        case "lesson":
            return false;
        case "code":
            // A code response is a set of test names, not one enumerable answer key.
            return false;
        case "git":
            return Object.keys(step.checks).some(function keyOf(key): boolean {
                return key === answer;
            });
        case "terminal":
            return step.objectives.some(function objectiveId(objective): boolean {
                return objective.id === answer;
            });
    }
}

function validateMisconceptions(
    mission: Mission,
    filePath: string,
    issues: ValidationIssue[],
): void {
    const stepIds = new Set(
        mission.steps.map(function stepId(step): string {
            return step.id;
        }),
    );
    const stepById = new Map(
        mission.steps.map(function toEntry(step): [string, MissionStep] {
            return [step.id, step];
        }),
    );
    const withFeedback = mission.misconceptions.filter(function hasFeedback(item): boolean {
        return item.feedback.trim().length > 0;
    });
    if (withFeedback.length < 2) {
        issues.push(
            errorIssue(
                "misconception-coverage",
                filePath,
                `Mission ${mission.id} has ${withFeedback.length} misconceptions with feedback; at least 2 are required.`,
            ),
        );
    }
    checkUnique(
        mission.misconceptions.map(function idOf(item): string {
            return item.id;
        }),
        "duplicate-misconception-id",
        filePath,
        "Misconception id",
        issues,
    );
    for (const misconception of mission.misconceptions) {
        if (!stepIds.has(misconception.stepId)) {
            issues.push(
                errorIssue(
                    "misconception-step-missing",
                    filePath,
                    `Misconception ${misconception.id} refers to missing step ${misconception.stepId}.`,
                ),
            );
            continue;
        }
        const step = stepById.get(misconception.stepId);
        if (step === undefined) {
            continue;
        }
        if (misconception.answer !== undefined && !answerMatchesStep(step, misconception.answer)) {
            issues.push(
                errorIssue(
                    "misconception-answer-unmatched",
                    filePath,
                    `Misconception ${misconception.id} answer "${misconception.answer}" cannot match a response key for ${step.kind} step ${step.id}.`,
                ),
            );
        }
    }
}

function validateCodeStep(
    mission: Mission,
    step: CodeStep,
    filePath: string,
    skillIds: ReadonlySet<string>,
    issues: ValidationIssue[],
): void {
    const stepPath = `${filePath}#${step.id}`;
    const language = step.language;
    const requiredRuntime = RUNTIME_FOR_LANGUAGE[language];
    if (step.files.length === 0) {
        issues.push(
            errorIssue(
                "code-step-no-files",
                stepPath,
                "A code step must include at least one file.",
            ),
        );
    }
    const fileNames = new Set<string>();
    let hasEditable = false;
    for (const file of step.files) {
        if (!isSafeRelativePath(file.path)) {
            issues.push(
                errorIssue(
                    "unsafe-content-file-path",
                    stepPath,
                    `Unsafe file path in content: ${file.path}`,
                ),
            );
        }
        if (fileNames.has(file.path)) {
            issues.push(
                errorIssue("duplicate-code-file", stepPath, `Duplicate file path: ${file.path}`),
            );
        }
        fileNames.add(file.path);
        if (file.editable) {
            hasEditable = true;
        }
    }
    if (!fileNames.has(step.entry)) {
        issues.push(
            errorIssue(
                "code-entry-missing",
                stepPath,
                `Entry file ${step.entry} is not one of the step files.`,
            ),
        );
    }
    if (!hasEditable) {
        issues.push(
            warningIssue("code-no-editable-file", stepPath, "The code step has no editable file."),
        );
    }

    if (mission.runtime.kind === "none") {
        issues.push(
            errorIssue(
                "runtime-missing",
                stepPath,
                `Code step ${step.id} needs ${requiredRuntime}, but the mission declares no runtime.`,
            ),
        );
    } else if (
        mission.runtime.kind !== requiredRuntime &&
        !mission.runtime.capabilities.includes(requiredRuntime)
    ) {
        issues.push(
            warningIssue(
                "runtime-mixed",
                stepPath,
                `Mission runtime is ${mission.runtime.kind}; step ${step.id} (${language}) needs ${requiredRuntime}, which is not listed in capabilities.`,
            ),
        );
    }

    const descriptions = new Set<string>();
    const validKinds = new Set(VALID_TEST_KINDS[language]);
    for (const test of step.tests) {
        if (descriptions.has(test.description)) {
            issues.push(
                errorIssue(
                    "duplicate-test-description",
                    stepPath,
                    `Duplicate test description: ${test.description}`,
                ),
            );
        }
        descriptions.add(test.description);
        if (!validKinds.has(test.kind)) {
            issues.push(
                errorIssue(
                    "invalid-test-kind",
                    stepPath,
                    `Test "${test.description}" has kind ${test.kind}, which is not valid for ${language}.`,
                ),
            );
        }
        validateTestDetails(test, fileNames, stepPath, issues);
        if (test.kind === "sql" && step.database === undefined) {
            issues.push(
                errorIssue(
                    "sql-fixture-missing",
                    stepPath,
                    `SQL test "${test.description}" has no database fixture on the step.`,
                ),
            );
        }
    }
    if (language === "sql" && step.database === undefined) {
        issues.push(
            errorIssue(
                "sql-fixture-missing",
                stepPath,
                "A SQL code step must include a database fixture.",
            ),
        );
    }

    for (const skillId of mission.misconceptions
        .filter(function sameStep(item): boolean {
            return item.stepId === step.id && item.followUpSkill !== undefined;
        })
        .map(function followUp(item): string {
            return item.followUpSkill ?? "";
        })) {
        if (!skillIds.has(skillId)) {
            issues.push(
                errorIssue(
                    "misconception-skill-missing",
                    stepPath,
                    `Follow-up skill does not exist: ${skillId}`,
                ),
            );
        }
    }
}

function validateTestDetails(
    test: CodeTest,
    fileNames: ReadonlySet<string>,
    stepPath: string,
    issues: ValidationIssue[],
): void {
    if (test.kind === "function" && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(test.name)) {
        issues.push(
            errorIssue(
                "invalid-function-name",
                stepPath,
                `Function test name is not an identifier: ${test.name}`,
            ),
        );
    }
    if (test.kind === "dom") {
        if (test.property === "attribute" && test.attribute === undefined) {
            issues.push(
                errorIssue(
                    "dom-attribute-missing",
                    stepPath,
                    `DOM test "${test.description}" checks an attribute but names none.`,
                ),
            );
        }
        if (test.property === "exists" && typeof test.expected !== "boolean") {
            issues.push(
                errorIssue(
                    "dom-exists-type",
                    stepPath,
                    `DOM exists test must expect a boolean: ${test.description}`,
                ),
            );
        }
        if (test.property === "count" && typeof test.expected !== "number") {
            issues.push(
                errorIssue(
                    "dom-count-type",
                    stepPath,
                    `DOM count test must expect a number: ${test.description}`,
                ),
            );
        }
        if (
            (test.property === "text" || test.property === "attribute") &&
            typeof test.expected !== "string"
        ) {
            issues.push(
                errorIssue(
                    "dom-text-type",
                    stepPath,
                    `DOM ${test.property} test must expect a string: ${test.description}`,
                ),
            );
        }
    }
    if (
        (test.kind === "regex" || test.kind === "static" || test.kind === "json") &&
        !fileNames.has(test.file)
    ) {
        issues.push(
            errorIssue(
                "test-file-missing",
                stepPath,
                `Test "${test.description}" refers to missing file ${test.file}.`,
            ),
        );
    }
}

function validateObjectives(mission: Mission, filePath: string, issues: ValidationIssue[]): void {
    const stepIds = new Set(
        mission.steps.map(function idOf(step): string {
            return step.id;
        }),
    );
    const covered = new Set<string>();
    checkUnique(
        mission.objectives.map(function idOf(objective): string {
            return objective.id;
        }),
        "duplicate-objective-id",
        filePath,
        "Objective id",
        issues,
    );
    for (const objective of mission.objectives) {
        for (const stepId of objective.stepIds) {
            if (!stepIds.has(stepId)) {
                issues.push(
                    errorIssue(
                        "objective-step-missing",
                        filePath,
                        `Objective ${objective.id} refers to missing step ${stepId}.`,
                    ),
                );
            }
            covered.add(stepId);
        }
    }
    const uncovered = mission.steps
        .filter(function notCovered(step): boolean {
            return step.kind !== "lesson" && !covered.has(step.id);
        })
        .map(function idOf(step): string {
            return step.id;
        });
    if (uncovered.length > 0) {
        issues.push(
            warningIssue(
                "objective-coverage",
                filePath,
                `Mission ${mission.id} has evaluated steps not covered by an objective: ${uncovered.join(", ")}.`,
            ),
        );
    }
}

function validateSolutionLeakage(loaded: LoadedContent, issues: ValidationIssue[]): void {
    for (const file of loaded.rawFiles) {
        if (file.path.includes("content-solutions")) {
            continue;
        }
        if (/"\s*(solution|solutions|referenceSolution)\s*"\s*:/.test(file.text)) {
            issues.push(
                errorIssue(
                    "solution-leakage",
                    file.path,
                    "Reference solutions must live in content-solutions/, not inside authored content.",
                ),
            );
        }
    }
}

function validateMission(
    mission: Mission,
    skillIds: ReadonlySet<string>,
    missionIds: ReadonlySet<string>,
    filePath: string,
    issues: ValidationIssue[],
): void {
    if (mission.version < 1) {
        issues.push(
            errorIssue(
                "invalid-mission-version",
                filePath,
                `Mission ${mission.id} has an invalid version.`,
            ),
        );
    }
    if (mission.courseId.length === 0) {
        issues.push(
            errorIssue("missing-course", filePath, `Mission ${mission.id} has no courseId.`),
        );
    }
    for (const skillId of mission.skills) {
        if (!skillIds.has(skillId)) {
            issues.push(
                errorIssue(
                    "mission-skill-missing",
                    filePath,
                    `Mission ${mission.id} teaches unknown skill ${skillId}.`,
                ),
            );
        }
    }
    for (const skillId of mission.prerequisites) {
        if (!skillIds.has(skillId)) {
            issues.push(
                errorIssue(
                    "mission-prerequisite-missing",
                    filePath,
                    `Mission ${mission.id} requires unknown skill ${skillId}.`,
                ),
            );
        }
    }
    if (mission.estimatedMinutes < 2 || mission.estimatedMinutes > 30) {
        issues.push(
            errorIssue(
                "invalid-estimated-duration",
                filePath,
                `Mission ${mission.id} has an estimated duration outside 2-30 minutes.`,
            ),
        );
    }
    if (mission.license.trim().length === 0) {
        issues.push(
            errorIssue("missing-license", filePath, `Mission ${mission.id} has no license.`),
        );
    }
    if (
        mission.accessibility.summary.trim().length === 0 ||
        mission.accessibility.keyboardNotes.trim().length === 0 ||
        mission.accessibility.screenReaderNotes.trim().length === 0
    ) {
        issues.push(
            errorIssue(
                "missing-accessibility",
                filePath,
                `Mission ${mission.id} has incomplete accessibility notes.`,
            ),
        );
    }
    if (mission.lesson.sections.length === 0 || mission.lesson.vocabulary.length === 0) {
        issues.push(
            errorIssue(
                "missing-lesson",
                filePath,
                `Mission ${mission.id} has an incomplete lesson.`,
            ),
        );
    }
    for (const unlockId of mission.rewards.unlocks) {
        if (!missionIds.has(unlockId)) {
            issues.push(
                errorIssue(
                    "unlock-missing",
                    filePath,
                    `Mission ${mission.id} unlocks unknown mission ${unlockId}.`,
                ),
            );
        }
    }
    if (mission.persistence.kind === "world-action" && mission.persistence.action === undefined) {
        issues.push(
            errorIssue(
                "persistence-action-missing",
                filePath,
                `Mission ${mission.id} has a world action with no action.`,
            ),
        );
    }

    validateAssets(mission, filePath, issues);
    validateHints(mission, filePath, issues);
    validateObjectives(mission, filePath, issues);
    validateMisconceptions(mission, filePath, issues);

    for (const step of mission.steps) {
        if (step.kind === "code") {
            validateCodeStep(mission, step, filePath, skillIds, issues);
        }
    }
}

function validatePrerequisites(
    loaded: LoadedContent,
    missions: readonly Mission[],
    skillsById: ReadonlyMap<string, SkillDefinition>,
    issues: ValidationIssue[],
): void {
    const taughtAt = new Map<string, number>();
    for (const mission of missions) {
        for (const skillId of mission.skills) {
            const previous = taughtAt.get(skillId);
            if (previous === undefined || mission.sequence < previous) {
                taughtAt.set(skillId, mission.sequence);
            }
        }
    }

    for (const mission of missions) {
        for (const skillId of mission.prerequisites) {
            const skill = skillsById.get(skillId);
            if (skill === undefined) {
                continue;
            }
            const isRootConcept = skill.kind === "concept" && skill.parents.length === 0;
            if (isRootConcept) {
                continue;
            }
            const taught = taughtAt.get(skillId);
            if (taught === undefined || taught >= mission.sequence) {
                issues.push(
                    warningIssue(
                        "prerequisite-placement-only",
                        pathForMission(loaded, mission.id),
                        `Mission ${mission.id} requires ${skillId}, which is not taught by an earlier mission. It is available only through placement or prior knowledge.`,
                    ),
                );
            }
        }
    }
}

function validateProjects(
    projects: readonly ProjectDefinition[],
    skillIds: ReadonlySet<string>,
    issues: ValidationIssue[],
): void {
    checkUnique(
        projects.map(function idOf(project): string {
            return project.id;
        }),
        "duplicate-project-id",
        "content/projects.json",
        "Project id",
        issues,
    );
    for (const project of projects) {
        const projectPath = `content/projects.json#${project.id}`;
        for (const skillId of project.skills) {
            if (!skillIds.has(skillId)) {
                issues.push(
                    errorIssue(
                        "project-skill-missing",
                        projectPath,
                        `Project teaches unknown skill ${skillId}.`,
                    ),
                );
            }
        }
        if (project.runtime !== RUNTIME_FOR_LANGUAGE[project.language]) {
            issues.push(
                warningIssue(
                    "project-runtime-mismatch",
                    projectPath,
                    `Project runtime ${project.runtime} does not match language ${project.language}.`,
                ),
            );
        }
        if (!Object.prototype.hasOwnProperty.call(project.files, project.entry)) {
            issues.push(
                errorIssue(
                    "project-entry-missing",
                    projectPath,
                    `Entry file ${project.entry} is not in project files.`,
                ),
            );
        }
        for (const filePath of Object.keys(project.files)) {
            if (!isSafeRelativePath(filePath)) {
                issues.push(
                    errorIssue(
                        "unsafe-content-file-path",
                        projectPath,
                        `Unsafe project file path: ${filePath}`,
                    ),
                );
            }
        }
        if (project.language === "sql" && project.database === undefined) {
            issues.push(
                errorIssue(
                    "project-sql-fixture-missing",
                    projectPath,
                    "A SQL project needs a database fixture.",
                ),
            );
        }
        checkUnique(
            project.stages.map(function idOf(stage): string {
                return stage.id;
            }),
            "duplicate-project-stage",
            projectPath,
            "Project stage id",
            issues,
        );
        for (const stage of project.stages) {
            const stagePath = `${projectPath}/${stage.id}`;
            const descriptions = new Set<string>();
            const validKinds = new Set(VALID_TEST_KINDS[project.language]);
            for (const test of stage.tests) {
                if (descriptions.has(test.description)) {
                    issues.push(
                        errorIssue(
                            "duplicate-test-description",
                            stagePath,
                            `Duplicate test description: ${test.description}`,
                        ),
                    );
                }
                descriptions.add(test.description);
                if (!validKinds.has(test.kind)) {
                    issues.push(
                        errorIssue(
                            "invalid-test-kind",
                            stagePath,
                            `Test "${test.description}" has kind ${test.kind}, which is not valid for ${project.language}.`,
                        ),
                    );
                }
                validateTestDetails(test, new Set(Object.keys(project.files)), stagePath, issues);
                if (test.kind === "sql" && project.database === undefined) {
                    issues.push(
                        errorIssue(
                            "project-sql-fixture-missing",
                            stagePath,
                            `SQL test "${test.description}" has no database fixture on the project.`,
                        ),
                    );
                }
            }
        }
    }
}

function validatePlacement(
    loaded: LoadedContent,
    skillIds: ReadonlySet<string>,
    missionIds: ReadonlySet<string>,
    issues: ValidationIssue[],
): void {
    const questionIds = new Set<string>();
    for (const question of loaded.placement.questions) {
        const questionPath = `content/placement.json#${question.id}`;
        if (questionIds.has(question.id)) {
            issues.push(
                errorIssue(
                    "duplicate-placement-id",
                    questionPath,
                    "Placement question ids must be unique.",
                ),
            );
        }
        questionIds.add(question.id);
        if (!skillIds.has(question.skillId)) {
            issues.push(
                errorIssue(
                    "placement-skill-missing",
                    questionPath,
                    `Unknown placement skill: ${question.skillId}`,
                ),
            );
        }
        const optionIds = question.options.map(function idOf(option): string {
            return option.id;
        });
        checkUnique(
            optionIds,
            "duplicate-placement-option",
            questionPath,
            "Placement option id",
            issues,
        );
        if (!optionIds.includes(question.correctId)) {
            issues.push(
                errorIssue(
                    "placement-correct-missing",
                    questionPath,
                    "The correct option does not exist.",
                ),
            );
        }
    }
    checkUnique(
        loaded.placement.recommendations.map(function missionOf(item): string {
            return item.missionId;
        }),
        "duplicate-placement-recommendation",
        "content/placement.json",
        "Placement recommendation mission",
        issues,
    );
    for (const recommendation of loaded.placement.recommendations) {
        if (!missionIds.has(recommendation.missionId)) {
            issues.push(
                errorIssue(
                    "placement-mission-missing",
                    "content/placement.json",
                    `Placement recommends unknown mission ${recommendation.missionId}.`,
                ),
            );
        }
    }
    if (
        !loaded.placement.recommendations.some(function startsAtZero(item): boolean {
            return item.minCorrect === 0;
        })
    ) {
        issues.push(
            warningIssue(
                "placement-no-entry-level",
                "content/placement.json",
                "No placement recommendation accepts zero correct answers.",
            ),
        );
    }
}

function validateAchievements(loaded: LoadedContent, issues: ValidationIssue[]): void {
    checkUnique(
        loaded.achievements.map(function idOf(item): string {
            return item.id;
        }),
        "duplicate-achievement-id",
        "content/achievements.json",
        "Achievement id",
        issues,
    );
    checkUnique(
        loaded.achievements.map(function ruleOf(item): string {
            return item.rule;
        }),
        "duplicate-achievement-rule",
        "content/achievements.json",
        "Achievement rule",
        issues,
    );
    for (const achievement of loaded.achievements) {
        if (RULE_KIND[achievement.rule] !== achievement.kind) {
            issues.push(
                warningIssue(
                    "achievement-kind-mismatch",
                    "content/achievements.json",
                    `Achievement ${achievement.id} uses rule ${achievement.rule} with kind ${achievement.kind}.`,
                ),
            );
        }
    }
    const achievementIds = new Set(
        loaded.achievements.map(function idOf(item): string {
            return item.id;
        }),
    );
    for (const mission of loaded.missions) {
        const achievementId = mission.rewards.achievement;
        if (achievementId !== undefined && !achievementIds.has(achievementId)) {
            issues.push(
                errorIssue(
                    "mission-achievement-missing",
                    pathForMission(loaded, mission.id),
                    `Mission ${mission.id} rewards unknown achievement ${achievementId}.`,
                ),
            );
        }
    }
}

function validateEvents(
    loaded: LoadedContent,
    skillIds: ReadonlySet<string>,
    issues: ValidationIssue[],
): void {
    checkUnique(
        loaded.events.map(function idOf(event): string {
            return event.id;
        }),
        "duplicate-event-id",
        "content/club-events",
        "Club event id",
        issues,
    );
    for (const event of loaded.events) {
        for (const skillId of event.skillIds) {
            if (!skillIds.has(skillId)) {
                issues.push(
                    errorIssue(
                        "event-skill-missing",
                        `content/club-events#${event.id}`,
                        `Unknown event skill: ${skillId}`,
                    ),
                );
            }
        }
        const optionIds = event.options.map(function idOf(option): string {
            return option.id;
        });
        checkUnique(
            optionIds,
            "duplicate-event-option",
            `content/club-events#${event.id}`,
            "Event option id",
            issues,
        );
        checkUnique(
            event.options.map(function labelOf(option): string {
                return option.label;
            }),
            "duplicate-event-option-label",
            `content/club-events#${event.id}`,
            "Event option label",
            issues,
        );
        const matched = event.options.some(function matchesOption(option): boolean {
            return (
                createHash("sha256").update(`${event.answerSalt}${option.id}`).digest("hex") ===
                event.answerHash
            );
        });
        if (!matched) {
            issues.push(
                warningIssue(
                    "event-answer-unmatched",
                    `content/club-events#${event.id}`,
                    "The answer hash does not match sha256(salt + option id) for any option.",
                ),
            );
        }
    }
}

export function validateContentDocuments(loaded: LoadedContent): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [...loaded.issues];
    validateSkillGraph(loaded, issues);

    const skillIds = new Set(
        loaded.skills.skills.map(function idOf(skill): string {
            return skill.id;
        }),
    );
    const skillsById = new Map(
        loaded.skills.skills.map(function toEntry(skill): [string, SkillDefinition] {
            return [skill.id, skill];
        }),
    );
    const missionIds = new Set(
        loaded.missions.map(function idOf(mission): string {
            return mission.id;
        }),
    );

    checkUnique(
        loaded.missions.map(function idOf(mission): string {
            return mission.id;
        }),
        "duplicate-mission-id",
        "content",
        "Mission id",
        issues,
    );
    checkUnique(
        loaded.missions.map(function sequenceOf(mission): string {
            return String(mission.sequence);
        }),
        "duplicate-mission-sequence",
        "content",
        "Mission sequence",
        issues,
    );

    const sorted = [...loaded.missions].sort(function bySequence(left, right): number {
        return left.sequence - right.sequence;
    });
    for (let index = 0; index < sorted.length; index += 1) {
        const mission = sorted[index];
        if (mission === undefined) {
            continue;
        }
        if (mission.sequence !== index + 1) {
            issues.push(
                warningIssue(
                    "mission-sequence-gap",
                    pathForMission(loaded, mission.id),
                    `Mission ${mission.id} has sequence ${mission.sequence} but is at position ${index + 1}.`,
                ),
            );
        }
    }

    const byCourse = new Map<string, Mission[]>();
    for (const mission of sorted) {
        const course = byCourse.get(mission.courseId) ?? [];
        course.push(mission);
        byCourse.set(mission.courseId, course);
    }
    for (const [courseId, courseMissions] of byCourse) {
        for (let index = 1; index < courseMissions.length; index += 1) {
            const previous = courseMissions[index - 1];
            const current = courseMissions[index];
            if (previous === undefined || current === undefined) {
                continue;
            }
            if (current.sequence !== previous.sequence + 1) {
                issues.push(
                    warningIssue(
                        "mission-course-sequence-gap",
                        pathForMission(loaded, current.id),
                        `Course ${courseId} skips from sequence ${previous.sequence} to ${current.sequence}.`,
                    ),
                );
            }
        }
    }

    for (const mission of loaded.missions) {
        validateMission(mission, skillIds, missionIds, pathForMission(loaded, mission.id), issues);
    }

    checkUnique(
        loaded.tracks.map(function idOf(track): string {
            return track.id;
        }),
        "duplicate-track-id",
        "content/tracks.json",
        "Track id",
        issues,
    );
    const tracked = new Set<string>();
    for (const track of loaded.tracks) {
        checkUnique(
            track.missionIds,
            "duplicate-track-mission",
            "content/tracks.json",
            `Track ${track.id} mission`,
            issues,
        );
        for (const missionId of track.missionIds) {
            tracked.add(missionId);
            if (!missionIds.has(missionId)) {
                issues.push(
                    errorIssue(
                        "track-mission-missing",
                        "content/tracks.json",
                        `Track ${track.id} contains unknown mission ${missionId}.`,
                    ),
                );
            }
        }
    }
    for (const mission of loaded.missions) {
        if (!tracked.has(mission.id)) {
            issues.push(
                errorIssue(
                    "mission-not-in-track",
                    pathForMission(loaded, mission.id),
                    `Mission ${mission.id} does not belong to any track.`,
                ),
            );
        }
    }

    validatePrerequisites(loaded, loaded.missions, skillsById, issues);
    validateProjects(loaded.projects, skillIds, issues);
    validatePlacement(loaded, skillIds, missionIds, issues);
    validateAchievements(loaded, issues);
    validateEvents(loaded, skillIds, issues);
    validateSolutionLeakage(loaded, issues);

    return issues;
}
