import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
    AchievementsDocumentSchema,
    ClubEventsDocumentSchema,
    ClubEventSchema,
    MissionSchema,
    PlacementDocumentSchema,
    ProjectsDocumentSchema,
    SkillGraphDocumentSchema,
    TracksDocumentSchema,
    type ClubEvent,
    type Mission,
    type AchievementsDocument,
    type PlacementDocument,
    type ProjectsDocument,
    type SkillGraphDocument,
    type TracksDocument,
} from "@praxbit/contracts";
import { errorIssue } from "./types.ts";
import type { LoadedContent, RawContentFile, ValidationIssue } from "./types.ts";

interface ParseOutcome<T> {
    readonly value?: T;
    readonly issues: readonly ValidationIssue[];
}

interface ReadFileResult {
    readonly text?: string;
    readonly value?: unknown;
    readonly issue?: ValidationIssue;
}

function displayPath(contentRoot: string, filePath: string): string {
    const relative = path.relative(path.dirname(contentRoot), filePath);
    return relative.split(path.sep).join("/");
}

async function listJsonFiles(directory: string): Promise<readonly string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            result.push(...(await listJsonFiles(fullPath)));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            result.push(fullPath);
        }
    }
    return result.sort();
}

async function readJsonFile(contentRoot: string, filePath: string): Promise<ReadFileResult> {
    const shownPath = displayPath(contentRoot, filePath);
    try {
        const text = await readFile(filePath, "utf8");
        try {
            return { text, value: JSON.parse(text) as unknown };
        } catch (error) {
            return {
                issue: errorIssue(
                    "invalid-json",
                    shownPath,
                    `The file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
                ),
            };
        }
    } catch (error) {
        return {
            issue: errorIssue(
                "missing-file",
                shownPath,
                `The file could not be read: ${error instanceof Error ? error.message : String(error)}`,
            ),
        };
    }
}

function parseWithSchema<T>(
    schema: z.ZodType<T>,
    value: unknown,
    shownPath: string,
    label: string,
): ParseOutcome<T> {
    const result = schema.safeParse(value);
    if (result.success) {
        return { value: result.data, issues: [] };
    }
    const issues = result.error.issues.map(function toIssue(issue): ValidationIssue {
        const location = issue.path.length === 0 ? "(root)" : issue.path.join(".");
        return errorIssue("schema-invalid", shownPath, `${label} at ${location}: ${issue.message}`);
    });
    return { issues };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadContent(contentRoot: string): Promise<LoadedContent> {
    const issues: ValidationIssue[] = [];
    const rawFiles: RawContentFile[] = [];

    async function readRequired(name: string): Promise<unknown> {
        const result = await readJsonFile(contentRoot, path.join(contentRoot, name));
        if (result.issue !== undefined) {
            issues.push(result.issue);
            return undefined;
        }
        if (result.text !== undefined) {
            rawFiles.push({
                path: displayPath(contentRoot, path.join(contentRoot, name)),
                text: result.text,
            });
        }
        return result.value;
    }

    const skillsValue = await readRequired("skills.json");
    const skillsParsed: ParseOutcome<SkillGraphDocument> =
        skillsValue === undefined
            ? { issues: [] }
            : parseWithSchema(
                  SkillGraphDocumentSchema,
                  skillsValue,
                  "content/skills.json",
                  "Skill graph",
              );
    issues.push(...skillsParsed.issues);

    const tracksValue = await readRequired("tracks.json");
    const tracksParsed: ParseOutcome<TracksDocument> =
        tracksValue === undefined
            ? { issues: [] }
            : parseWithSchema(
                  TracksDocumentSchema,
                  tracksValue,
                  "content/tracks.json",
                  "Tracks document",
              );
    issues.push(...tracksParsed.issues);

    const placementValue = await readRequired("placement.json");
    const placementParsed: ParseOutcome<PlacementDocument> =
        placementValue === undefined
            ? { issues: [] }
            : parseWithSchema(
                  PlacementDocumentSchema,
                  placementValue,
                  "content/placement.json",
                  "Placement document",
              );
    issues.push(...placementParsed.issues);

    const projectsValue = await readRequired("projects.json");
    const projectsParsed: ParseOutcome<ProjectsDocument> =
        projectsValue === undefined
            ? { issues: [] }
            : parseWithSchema(
                  ProjectsDocumentSchema,
                  projectsValue,
                  "content/projects.json",
                  "Projects document",
              );
    issues.push(...projectsParsed.issues);

    const achievementsValue = await readRequired("achievements.json");
    const achievementsParsed: ParseOutcome<AchievementsDocument> =
        achievementsValue === undefined
            ? { issues: [] }
            : parseWithSchema(
                  AchievementsDocumentSchema,
                  achievementsValue,
                  "content/achievements.json",
                  "Achievements document",
              );
    issues.push(...achievementsParsed.issues);

    const missions: Mission[] = [];
    const missionPaths = new Map<string, string>();
    for (const directoryName of ["campaigns", "tracks"]) {
        const directory = path.join(contentRoot, directoryName);
        let files: readonly string[] = [];
        try {
            files = await listJsonFiles(directory);
        } catch (error) {
            issues.push(
                errorIssue(
                    "missing-directory",
                    `content/${directoryName}`,
                    `The ${directoryName} directory could not be read: ${error instanceof Error ? error.message : String(error)}`,
                ),
            );
            continue;
        }
        for (const filePath of files) {
            const shownPath = displayPath(contentRoot, filePath);
            const result = await readJsonFile(contentRoot, filePath);
            if (result.issue !== undefined) {
                issues.push(result.issue);
                continue;
            }
            if (result.text !== undefined) {
                rawFiles.push({ path: shownPath, text: result.text });
            }
            const parsed = parseWithSchema(MissionSchema, result.value, shownPath, "Mission");
            issues.push(...parsed.issues);
            if (parsed.value !== undefined) {
                missions.push(parsed.value);
                missionPaths.set(parsed.value.id, shownPath);
            }
        }
    }

    const events: ClubEvent[] = [];
    const eventDirectory = path.join(contentRoot, "club-events");
    let eventFiles: readonly string[] = [];
    try {
        eventFiles = await listJsonFiles(eventDirectory);
    } catch (error) {
        issues.push(
            errorIssue(
                "missing-directory",
                "content/club-events",
                `The club-events directory could not be read: ${error instanceof Error ? error.message : String(error)}`,
            ),
        );
    }
    for (const filePath of eventFiles) {
        const shownPath = displayPath(contentRoot, filePath);
        const result = await readJsonFile(contentRoot, filePath);
        if (result.issue !== undefined) {
            issues.push(result.issue);
            continue;
        }
        if (result.text !== undefined) {
            rawFiles.push({ path: shownPath, text: result.text });
        }
        if (isRecord(result.value) && Array.isArray(result.value["events"])) {
            const parsed = parseWithSchema(
                ClubEventsDocumentSchema,
                result.value,
                shownPath,
                "Club events document",
            );
            issues.push(...parsed.issues);
            if (parsed.value !== undefined) {
                events.push(...parsed.value.events);
            }
        } else {
            const parsed = parseWithSchema(ClubEventSchema, result.value, shownPath, "Club event");
            issues.push(...parsed.issues);
            if (parsed.value !== undefined) {
                events.push(parsed.value);
            }
        }
    }

    return {
        skills: skillsParsed.value ?? { version: 1, skills: [] },
        tracks: tracksParsed.value?.tracks ?? [],
        missions,
        placement: placementParsed.value ?? { version: 1, questions: [], recommendations: [] },
        projects: projectsParsed.value?.projects ?? [],
        achievements: achievementsParsed.value?.achievements ?? [],
        events,
        missionPaths,
        rawFiles,
        issues,
    };
}
