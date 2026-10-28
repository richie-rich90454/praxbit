import {
    AchievementsDocumentSchema,
    MissionSchema,
    PlacementDocumentSchema,
    ProjectsDocumentSchema,
    SkillGraphDocumentSchema,
    TracksDocumentSchema,
    type AchievementDefinition,
    type Mission,
    type PlacementDocument,
    type ProjectDefinition,
    type SkillDefinition,
    type Track,
} from "@praxbit/contracts";
import { SkillGraph } from "@praxbit/domain";

const missionModules = import.meta.glob(["../../../../content/campaigns/**/*.json", "../../../../content/tracks/**/*.json"], {
    eager: true,
    import: "default",
});
const skillsModule = import.meta.glob("../../../../content/skills.json", { eager: true, import: "default" });
const tracksModule = import.meta.glob("../../../../content/tracks.json", { eager: true, import: "default" });
const placementModule = import.meta.glob("../../../../content/placement.json", { eager: true, import: "default" });
const projectsModule = import.meta.glob("../../../../content/projects.json", { eager: true, import: "default" });
const achievementsModule = import.meta.glob("../../../../content/achievements.json", { eager: true, import: "default" });

function singleModule(modules: Record<string, unknown>, name: string): unknown {
    const values = Object.values(modules);
    if (values.length !== 1) {
        throw new Error(`Expected exactly one ${name} document, found ${values.length}.`);
    }
    return values[0];
}

const skillsDocument = SkillGraphDocumentSchema.parse(singleModule(skillsModule, "skills"));
const tracksDocument = TracksDocumentSchema.parse(singleModule(tracksModule, "tracks"));
const placementDocument: PlacementDocument = PlacementDocumentSchema.parse(singleModule(placementModule, "placement"));
const projectsDocument = ProjectsDocumentSchema.parse(singleModule(projectsModule, "projects"));
const achievementsDocument = AchievementsDocumentSchema.parse(singleModule(achievementsModule, "achievements"));

const parsedMissions: Mission[] = [];
for (const [path, value] of Object.entries(missionModules)) {
    const parsed = MissionSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Invalid mission ${path}: ${parsed.error.message}`);
    }
    parsedMissions.push(parsed.data);
}

const uniqueMissionIds = new Set<string>();
for (const mission of parsedMissions) {
    if (uniqueMissionIds.has(mission.id)) {
        throw new Error(`Duplicate mission id: ${mission.id}`);
    }
    uniqueMissionIds.add(mission.id);
}

export const missions: readonly Mission[] = parsedMissions.sort(function bySequence(left, right): number {
    return left.sequence - right.sequence;
});

export const missionsById: ReadonlyMap<string, Mission> = new Map(
    missions.map(function toEntry(mission: Mission): [string, Mission] {
        return [mission.id, mission];
    }),
);

export const skillGraph = new SkillGraph(skillsDocument);
export const skills: readonly SkillDefinition[] = skillsDocument.skills;
export const tracks: readonly Track[] = tracksDocument.tracks;
export const placement: PlacementDocument = placementDocument;
export const projects: readonly ProjectDefinition[] = projectsDocument.projects;
export const achievements: readonly AchievementDefinition[] = achievementsDocument.achievements;

export function getMission(missionId: string): Mission | undefined {
    return missionsById.get(missionId);
}

export function requireMission(missionId: string): Mission {
    const mission = missionsById.get(missionId);
    if (mission === undefined) {
        throw new Error(`Unknown mission: ${missionId}`);
    }
    return mission;
}

export function missionsForTrack(trackId: string): readonly Mission[] {
    const track = tracks.find(function matches(item: Track): boolean {
        return item.id === trackId;
    });
    if (track === undefined) {
        return [];
    }
    return track.missionIds
        .map(function toMission(missionId: string): Mission | undefined {
            return missionsById.get(missionId);
        })
        .filter(function present(mission: Mission | undefined): mission is Mission {
            return mission !== undefined;
        });
}

export function trackForMission(missionId: string): Track | undefined {
    return tracks.find(function contains(track: Track): boolean {
        return track.missionIds.includes(missionId);
    });
}

export function skillName(skillId: string): string {
    return skillGraph.getSkill(skillId)?.name ?? skillId;
}

export function nextMission(missionId: string): Mission | undefined {
    const mission = missionsById.get(missionId);
    if (mission === undefined) {
        return undefined;
    }
    return missions.find(function follows(candidate: Mission): boolean {
        return candidate.courseId === mission.courseId && candidate.sequence === mission.sequence + 1;
    });
}

export function projectById(projectId: string): ProjectDefinition | undefined {
    return projects.find(function matches(project: ProjectDefinition): boolean {
        return project.id === projectId;
    });
}

export function skillNameList(skillIds: readonly string[]): string {
    return skillIds
        .map(function nameOf(skillId: string): string {
            return skillName(skillId);
        })
        .join(", ");
}
