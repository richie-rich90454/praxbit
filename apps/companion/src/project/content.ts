import fs from "node:fs";
import path from "node:path";
import type { Mission, MissionStep, ProjectDefinition } from "@praxbit/contracts";
import { MissionSchema, ProjectsDocumentSchema } from "@praxbit/contracts";

export class ContentError extends Error {
    public override name = "ContentError";
}

export interface StarterFile {
    readonly path: string;
    readonly content: string;
}

export interface ContentTarget {
    readonly kind: "mission" | "project";
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly files: readonly StarterFile[];
    readonly notes: readonly string[];
}

export function findRepositoryRoot(start: string): string {
    let current = path.resolve(start);
    for (;;) {
        if (fs.existsSync(path.join(current, "content", "tracks.json"))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            throw new ContentError(
                "Could not find the Praxbit repository. Run the companion from inside a checkout, or pass a directory with --dir.",
            );
        }
        current = parent;
    }
}

function readJson(filePath: string): unknown {
    const text = fs.readFileSync(filePath, "utf8");
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        if (error instanceof Error) {
            throw new ContentError(`Invalid JSON in ${filePath}: ${error.message}`);
        }
        throw new ContentError(`Invalid JSON in ${filePath}.`);
    }
}

function collectJsonFiles(directory: string, output: string[]): void {
    if (!fs.existsSync(directory)) {
        return;
    }
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectJsonFiles(entryPath, output);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            output.push(entryPath);
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestId(value: unknown): string | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const id = value["id"];
    return typeof id === "string" ? id : undefined;
}

export function loadProjects(repositoryRoot: string): readonly ProjectDefinition[] {
    const document = ProjectsDocumentSchema.safeParse(
        readJson(path.join(repositoryRoot, "content", "projects.json")),
    );
    if (!document.success) {
        throw new ContentError(`projects.json is invalid.\n${document.error.message}`);
    }
    return document.data.projects;
}

function filesFromStep(step: MissionStep): readonly StarterFile[] {
    if (step.kind === "code") {
        return step.files.map(function toFile(file): StarterFile {
            return { path: file.path, content: file.content };
        });
    }
    if (step.kind === "terminal") {
        return step.initial.files.map(function toFile(file): StarterFile {
            return { path: file.path, content: file.content };
        });
    }
    return [];
}

function mergeFiles(files: readonly StarterFile[]): readonly StarterFile[] {
    const byPath = new Map<string, StarterFile>();
    for (const file of files) {
        const existing = byPath.get(file.path);
        if (existing !== undefined && existing.content !== file.content) {
            throw new ContentError(
                `Two steps provide different starter content for ${file.path}. Open the mission in the web editor instead.`,
            );
        }
        byPath.set(file.path, file);
    }
    return [...byPath.values()];
}

export function resolveContentTarget(repositoryRoot: string, identifier: string): ContentTarget {
    const files: string[] = [];
    collectJsonFiles(path.join(repositoryRoot, "content", "campaigns"), files);
    collectJsonFiles(path.join(repositoryRoot, "content", "tracks"), files);
    const invalidManifests: string[] = [];

    for (const file of files) {
        const document = readJson(file);
        if (manifestId(document) !== identifier) {
            continue;
        }
        const parsed = MissionSchema.safeParse(document);
        if (!parsed.success) {
            throw new ContentError(`Mission manifest is invalid: ${file}\n${parsed.error.message}`);
        }
        return missionTarget(parsed.data);
    }

    for (const file of files) {
        const document = readJson(file);
        const parsed = MissionSchema.safeParse(document);
        if (!parsed.success) {
            invalidManifests.push(file);
        }
    }

    for (const project of loadProjects(repositoryRoot)) {
        if (project.id === identifier) {
            const projectFiles = Object.entries(project.files).map(
                function toFile(entry): StarterFile {
                    return { path: entry[0], content: entry[1] };
                },
            );
            return {
                kind: "project",
                id: project.id,
                title: project.title,
                summary: project.summary,
                files: projectFiles,
                notes: [`Entry point: ${project.entry}`, `Runtime: ${project.runtime}`],
            };
        }
    }

    const suffix =
        invalidManifests.length === 0
            ? ""
            : `\nUnrelated mission manifests are invalid and were skipped:\n${invalidManifests.join("\n")}`;
    throw new ContentError(`Unknown mission or project id: ${identifier}${suffix}`);
}

function missionTarget(mission: Mission): ContentTarget {
    const files = mergeFiles(mission.steps.flatMap(filesFromStep));
    const notes: string[] = [];
    if (files.length === 0) {
        notes.push("This mission has no code or terminal starter files. Open it in the web app.");
    }
    if (
        mission.steps.some(function needsRuntime(step): boolean {
            return step.kind === "git";
        })
    ) {
        notes.push("Git history is built in the web editor and is not exported by this command.");
    }
    return {
        kind: "mission",
        id: mission.id,
        title: mission.title,
        summary: mission.summary,
        files,
        notes,
    };
}
