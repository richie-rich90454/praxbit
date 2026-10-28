import type {
    AchievementDefinition,
    ClubEvent,
    Mission,
    PlacementDocument,
    ProjectDefinition,
    SkillGraphDocument,
    Track,
} from "@praxbit/contracts";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
    readonly severity: IssueSeverity;
    readonly code: string;
    readonly path: string;
    readonly message: string;
}

export interface RawContentFile {
    readonly path: string;
    readonly text: string;
}

export interface LoadedContent {
    readonly skills: SkillGraphDocument;
    readonly tracks: readonly Track[];
    readonly missions: readonly Mission[];
    readonly placement: PlacementDocument;
    readonly projects: readonly ProjectDefinition[];
    readonly achievements: readonly AchievementDefinition[];
    readonly events: readonly ClubEvent[];
    readonly missionPaths: ReadonlyMap<string, string>;
    readonly rawFiles: readonly RawContentFile[];
    readonly issues: readonly ValidationIssue[];
}

export interface TestOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly deferred: boolean;
    readonly actual?: string;
    readonly error?: string;
}

export interface TestRunResult {
    readonly outcomes: readonly TestOutcome[];
}

export interface MissionStepSolution {
    readonly files: Readonly<Record<string, string>>;
}

export interface MissionSolution {
    readonly missionId: string;
    readonly steps: Readonly<Record<string, MissionStepSolution>>;
}

export interface ProjectSolution {
    readonly files?: Readonly<Record<string, string>>;
    readonly stages?: Readonly<Record<string, MissionStepSolution>>;
}

export interface ReferenceSolutionBundle {
    readonly missionSolutions: ReadonlyMap<string, MissionSolution>;
    readonly projectSolutions: ReadonlyMap<string, ProjectSolution>;
    readonly issues: readonly ValidationIssue[];
}

export interface ReferenceRunReport {
    readonly issues: readonly ValidationIssue[];
    readonly executedChecks: number;
    readonly deferredChecks: number;
}

export interface ValidationReport {
    readonly issues: readonly ValidationIssue[];
    readonly executedChecks: number;
    readonly deferredChecks: number;
}

export function errorIssue(code: string, path: string, message: string): ValidationIssue {
    return { severity: "error", code, path, message };
}

export function warningIssue(code: string, path: string, message: string): ValidationIssue {
    return { severity: "warning", code, path, message };
}
