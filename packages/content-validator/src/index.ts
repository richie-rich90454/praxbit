import path from "node:path";
import { loadContent } from "./loader.ts";
import {
    loadReferenceSolutions,
    runMissionReferenceSolutions,
    runProjectReferenceSolutions,
} from "./solutions.ts";
import { validateContentDocuments } from "./validate.ts";
import type {
    LoadedContent,
    ReferenceSolutionBundle,
    ValidationIssue,
    ValidationReport,
} from "./types.ts";

export interface RepositoryValidation {
    readonly content: LoadedContent;
    readonly solutions: ReferenceSolutionBundle;
    readonly report: ValidationReport;
}

export async function validateRepository(repositoryRoot: string): Promise<RepositoryValidation> {
    const content = await loadContent(path.join(repositoryRoot, "content"));
    const structuralIssues = validateContentDocuments(content);
    const solutions = await loadReferenceSolutions(
        repositoryRoot,
        content.missions,
        content.projects,
    );
    const missionReport = await runMissionReferenceSolutions(content, solutions);
    const projectReport = await runProjectReferenceSolutions(content.projects, solutions);

    const issues: ValidationIssue[] = [
        ...structuralIssues,
        ...solutions.issues,
        ...missionReport.issues,
        ...projectReport.issues,
    ];

    return {
        content,
        solutions,
        report: {
            issues,
            executedChecks: missionReport.executedChecks + projectReport.executedChecks,
            deferredChecks: missionReport.deferredChecks + projectReport.deferredChecks,
        },
    };
}

export { loadContent } from "./loader.ts";
export { validateContentDocuments } from "./validate.ts";
export {
    loadReferenceSolutions,
    parseMissionSolution,
    parseProjectSolutions,
    runMissionReferenceSolutions,
    runProjectReferenceSolutions,
} from "./solutions.ts";
export { isSafeRelativePath } from "./paths.ts";
export {
    buildPreviewDocument,
    normalizeText,
    runCssDeferred,
    runDomTests,
} from "./runtime/html.ts";
export {
    canonicalize,
    combineSources,
    normalizedJson,
    runJavaScriptFunctionTests,
    runJavaScriptTests,
    transpileTypeScript,
} from "./runtime/javascript.ts";
export { runPythonFunctionTests } from "./runtime/python.ts";
export { runSqlTests } from "./runtime/sql.ts";
export { runStaticTests } from "./runtime/static.ts";
export { runCodeTests, type CodeLanguage, type CodeRunInput } from "./runtime/index.ts";
export type {
    IssueSeverity,
    LoadedContent,
    MissionSolution,
    MissionStepSolution,
    ProjectSolution,
    ReferenceRunReport,
    ReferenceSolutionBundle,
    TestOutcome,
    TestRunResult,
    ValidationIssue,
    ValidationReport,
} from "./types.ts";
