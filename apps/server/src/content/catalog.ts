import {
    AchievementsDocumentSchema,
    ClubEventsDocumentSchema,
    MissionSchema,
    PlacementDocumentSchema,
    ProjectsDocumentSchema,
    TracksDocumentSchema,
    type AchievementDefinition,
    type ClubEvent,
    type Mission,
    type PlacementDocument,
    type ProjectDefinition,
    type SkillDefinition,
    type Track,
} from "@praxbit/contracts";
import { SkillGraph, validateSkillGraph } from "@praxbit/domain";

export interface ContentCatalogSource {
    readonly missions: readonly Mission[];
    readonly skills: readonly SkillDefinition[];
    readonly tracks: readonly Track[];
    readonly projects: readonly ProjectDefinition[];
    readonly achievements: readonly AchievementDefinition[];
    readonly clubEvents: readonly ClubEvent[];
    readonly placement: PlacementDocument;
    readonly skillGraph: SkillGraph;
}

export class ContentCatalog {
    private readonly missionsById: ReadonlyMap<string, Mission>;
    private readonly skillsById: ReadonlyMap<string, SkillDefinition>;
    private readonly projectsById: ReadonlyMap<string, ProjectDefinition>;
    private readonly eventsById: ReadonlyMap<string, ClubEvent>;

    public readonly missions: readonly Mission[];
    public readonly skills: readonly SkillDefinition[];
    public readonly tracks: readonly Track[];
    public readonly projects: readonly ProjectDefinition[];
    public readonly achievements: readonly AchievementDefinition[];
    public readonly clubEvents: readonly ClubEvent[];
    public readonly placement: PlacementDocument;
    public readonly skillGraph: SkillGraph;

    public constructor(source: ContentCatalogSource) {
        this.missions = source.missions;
        this.skills = source.skills;
        this.tracks = source.tracks;
        this.projects = source.projects;
        this.achievements = source.achievements;
        this.clubEvents = source.clubEvents;
        this.placement = source.placement;
        this.skillGraph = source.skillGraph;
        this.missionsById = new Map(
            source.missions.map(function missionEntry(mission: Mission): [string, Mission] {
                return [mission.id, mission];
            }),
        );
        this.skillsById = new Map(
            source.skills.map(function skillEntry(
                skill: SkillDefinition,
            ): [string, SkillDefinition] {
                return [skill.id, skill];
            }),
        );
        this.projectsById = new Map(
            source.projects.map(function projectEntry(
                project: ProjectDefinition,
            ): [string, ProjectDefinition] {
                return [project.id, project];
            }),
        );
        this.eventsById = new Map(
            source.clubEvents.map(function eventEntry(event: ClubEvent): [string, ClubEvent] {
                return [event.id, event];
            }),
        );
    }

    public getMission(missionId: string): Mission | undefined {
        return this.missionsById.get(missionId);
    }

    public getSkill(skillId: string): SkillDefinition | undefined {
        return this.skillsById.get(skillId);
    }

    public getProject(projectId: string): ProjectDefinition | undefined {
        return this.projectsById.get(projectId);
    }

    public getClubEvent(eventId: string): ClubEvent | undefined {
        return this.eventsById.get(eventId);
    }
}

function detectDuplicates(values: readonly string[], label: string, issues: string[]): void {
    const seen = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) {
            issues.push(`Duplicate ${label}: ${value}`);
        }
        seen.add(value);
    }
}

export function buildContentCatalog(source: ContentCatalogSource): ContentCatalog {
    const issues: string[] = [];
    detectDuplicates(
        source.missions.map(function missionId(mission: Mission): string {
            return mission.id;
        }),
        "mission id",
        issues,
    );
    detectDuplicates(
        source.skills.map(function skillId(skill: SkillDefinition): string {
            return skill.id;
        }),
        "skill id",
        issues,
    );
    detectDuplicates(
        source.tracks.map(function trackId(track: Track): string {
            return track.id;
        }),
        "track id",
        issues,
    );
    detectDuplicates(
        source.projects.map(function projectId(project: ProjectDefinition): string {
            return project.id;
        }),
        "project id",
        issues,
    );
    detectDuplicates(
        source.clubEvents.map(function eventId(event: ClubEvent): string {
            return event.id;
        }),
        "club event id",
        issues,
    );
    detectDuplicates(
        source.achievements.map(function achievementId(achievement: AchievementDefinition): string {
            return achievement.id;
        }),
        "achievement id",
        issues,
    );

    for (const issue of validateSkillGraph({
        version: 1,
        skills: [...source.skills],
    })) {
        issues.push(`Skill graph: ${issue.skillId}: ${issue.message}`);
    }

    const skillIds = new Set(
        source.skills.map(function idOf(skill: SkillDefinition): string {
            return skill.id;
        }),
    );
    const missionIds = new Set(
        source.missions.map(function idOf(mission: Mission): string {
            return mission.id;
        }),
    );

    const courseSequences = new Set<string>();
    for (const mission of source.missions) {
        for (const skillId of mission.skills) {
            if (!skillIds.has(skillId)) {
                issues.push(`Mission ${mission.id} references unknown skill ${skillId}.`);
            }
        }
        for (const prerequisite of mission.prerequisites) {
            if (!skillIds.has(prerequisite)) {
                issues.push(
                    `Mission ${mission.id} references unknown prerequisite skill ${prerequisite}.`,
                );
            }
        }
        for (const unlocked of mission.rewards.unlocks) {
            if (!missionIds.has(unlocked)) {
                issues.push(`Mission ${mission.id} unlocks unknown mission ${unlocked}.`);
            }
        }
        const sequenceKey = `${mission.courseId}:${String(mission.sequence)}`;
        if (courseSequences.has(sequenceKey)) {
            issues.push(`Duplicate mission sequence ${sequenceKey}.`);
        }
        courseSequences.add(sequenceKey);
    }

    for (const track of source.tracks) {
        for (const missionId of track.missionIds) {
            if (!missionIds.has(missionId)) {
                issues.push(`Track ${track.id} references unknown mission ${missionId}.`);
            }
        }
    }

    for (const project of source.projects) {
        for (const skillId of project.skills) {
            if (!skillIds.has(skillId)) {
                issues.push(`Project ${project.id} references unknown skill ${skillId}.`);
            }
        }
    }

    for (const event of source.clubEvents) {
        for (const skillId of event.skillIds) {
            if (!skillIds.has(skillId)) {
                issues.push(`Club event ${event.id} references unknown skill ${skillId}.`);
            }
        }
    }

    for (const question of source.placement.questions) {
        if (!skillIds.has(question.skillId)) {
            issues.push(
                `Placement question ${question.id} references unknown skill ${question.skillId}.`,
            );
        }
    }
    for (const recommendation of source.placement.recommendations) {
        if (!missionIds.has(recommendation.missionId)) {
            issues.push(
                `Placement recommendation references unknown mission ${recommendation.missionId}.`,
            );
        }
    }

    if (issues.length > 0) {
        throw new Error(`Invalid content:\n${issues.join("\n")}`);
    }

    return new ContentCatalog(source);
}

export function parseMissionDocument(value: unknown, source: string): Mission {
    const parsed = MissionSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Invalid mission ${source}: ${parsed.error.message}`);
    }
    return parsed.data;
}

export function parseTracksDocument(value: unknown, source: string): readonly Track[] {
    const parsed = TracksDocumentSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Invalid tracks document ${source}: ${parsed.error.message}`);
    }
    return parsed.data.tracks;
}

export function parseProjectsDocument(
    value: unknown,
    source: string,
): readonly ProjectDefinition[] {
    const parsed = ProjectsDocumentSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Invalid projects document ${source}: ${parsed.error.message}`);
    }
    return parsed.data.projects;
}

export function parseAchievementsDocument(
    value: unknown,
    source: string,
): readonly AchievementDefinition[] {
    const parsed = AchievementsDocumentSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Invalid achievements document ${source}: ${parsed.error.message}`);
    }
    return parsed.data.achievements;
}

export function parseClubEventsDocument(value: unknown, source: string): readonly ClubEvent[] {
    const parsed = ClubEventsDocumentSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Invalid club events document ${source}: ${parsed.error.message}`);
    }
    return parsed.data.events;
}

export function parsePlacementDocument(value: unknown, source: string): PlacementDocument {
    const parsed = PlacementDocumentSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Invalid placement document ${source}: ${parsed.error.message}`);
    }
    return parsed.data;
}
