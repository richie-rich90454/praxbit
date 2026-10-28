import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    SkillGraphDocumentSchema,
    type AchievementDefinition,
    type ClubEvent,
    type Mission,
    type ProjectDefinition,
    type SkillDefinition,
    type Track,
} from "@praxbit/contracts";
import { SkillGraph } from "@praxbit/domain";
import {
    buildContentCatalog,
    ContentCatalog,
    parseAchievementsDocument,
    parseClubEventsDocument,
    parseMissionDocument,
    parsePlacementDocument,
    parseProjectsDocument,
    parseTracksDocument,
} from "./catalog.ts";

const MAXIMUM_PARENT_SEARCH_DEPTH = 8;

async function pathExists(path: string): Promise<boolean> {
    try {
        const info = await stat(path);
        return info.isFile() || info.isDirectory();
    } catch {
        return false;
    }
}

async function readJson(path: string): Promise<unknown> {
    const text = await readFile(path, "utf8");
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON in ${path}: ${message}`, { cause: error });
    }
}

async function walkJsonFiles(directory: string): Promise<readonly string[]> {
    if (!(await pathExists(directory))) {
        return [];
    }
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort(function byName(left, right): number {
        return left.name.localeCompare(right.name);
    });
    const files: string[] = [];
    for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await walkJsonFiles(fullPath)));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            files.push(fullPath);
        }
    }
    return files;
}

export async function resolveContentDirectory(explicit: string | undefined): Promise<string> {
    if (explicit !== undefined) {
        const candidate = resolve(process.cwd(), explicit);
        if (await pathExists(join(candidate, "skills.json"))) {
            return candidate;
        }
        throw new Error(`CONTENT_DIR does not contain skills.json: ${candidate}`);
    }

    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    const starts = [process.cwd(), moduleDirectory];
    const candidates: string[] = [];

    for (const start of starts) {
        let current = resolve(start);
        for (let depth = 0; depth < MAXIMUM_PARENT_SEARCH_DEPTH; depth += 1) {
            const candidate = join(current, "content");
            if (!candidates.includes(candidate)) {
                candidates.push(candidate);
            }
            current = dirname(current);
        }
    }

    for (const candidate of candidates) {
        if (await pathExists(join(candidate, "skills.json"))) {
            return candidate;
        }
    }

    throw new Error(
        `Could not locate the Praxbit content directory. Set CONTENT_DIR explicitly. Searched:\n${candidates.join("\n")}`,
    );
}

export async function loadContentDirectory(contentDirectory: string): Promise<ContentCatalog> {
    const skillsValue = await readJson(join(contentDirectory, "skills.json"));
    const skillsParsed = SkillGraphDocumentSchema.safeParse(skillsValue);
    if (!skillsParsed.success) {
        throw new Error(`Invalid skills document: ${skillsParsed.error.message}`);
    }
    const skills: readonly SkillDefinition[] = skillsParsed.data.skills;

    const missionFiles = [
        ...(await walkJsonFiles(join(contentDirectory, "campaigns"))),
        ...(await walkJsonFiles(join(contentDirectory, "tracks"))),
    ];
    if (missionFiles.length === 0) {
        throw new Error(`No mission files found under ${join(contentDirectory, "campaigns")}.`);
    }
    const missions: Mission[] = [];
    for (const file of missionFiles) {
        missions.push(parseMissionDocument(await readJson(file), file));
    }

    const tracks = parseTracksDocument(
        await readJson(join(contentDirectory, "tracks.json")),
        "tracks.json",
    );
    const projects = parseProjectsDocument(
        await readJson(join(contentDirectory, "projects.json")),
        "projects.json",
    );
    const achievements = parseAchievementsDocument(
        await readJson(join(contentDirectory, "achievements.json")),
        "achievements.json",
    );
    const placement = parsePlacementDocument(
        await readJson(join(contentDirectory, "placement.json")),
        "placement.json",
    );

    const clubEvents: ClubEvent[] = [];
    for (const file of await walkJsonFiles(join(contentDirectory, "club-events"))) {
        clubEvents.push(...parseClubEventsDocument(await readJson(file), file));
    }

    missions.sort(function bySequence(left: Mission, right: Mission): number {
        if (left.courseId !== right.courseId) {
            return left.courseId.localeCompare(right.courseId);
        }
        return left.sequence - right.sequence;
    });

    const tracksList: readonly Track[] = tracks;
    const projectsList: readonly ProjectDefinition[] = projects;
    const achievementsList: readonly AchievementDefinition[] = achievements;

    return buildContentCatalog({
        missions,
        skills,
        tracks: tracksList,
        projects: projectsList,
        achievements: achievementsList,
        clubEvents,
        placement,
        skillGraph: new SkillGraph(skillsParsed.data),
    });
}

let cachedCatalog: ContentCatalog | undefined;
let cachedDirectory: string | undefined;

export async function loadContent(explicitDirectory?: string): Promise<ContentCatalog> {
    const directory = await resolveContentDirectory(explicitDirectory);
    if (cachedCatalog !== undefined && cachedDirectory === directory) {
        return cachedCatalog;
    }
    const catalog = await loadContentDirectory(directory);
    cachedCatalog = catalog;
    cachedDirectory = directory;
    return catalog;
}
