import { Hono } from "hono";
import type { Mission, ProjectDefinition } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { AppError } from "../http/app-error.ts";
import { RUNTIME_LABELS, runtimeLabel } from "../content/runtime-labels.ts";
import type { AppEnvironment } from "../types.ts";

function missionSummary(mission: Mission): {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly courseId: string;
    readonly sequence: number;
    readonly skills: readonly string[];
    readonly prerequisites: readonly string[];
    readonly difficulty: string;
    readonly estimatedMinutes: number;
    readonly interaction: string;
    readonly runtime: {
        readonly kind: string;
        readonly label: string;
        readonly capabilities: readonly string[];
    };
    readonly tags: readonly string[];
} {
    return {
        id: mission.id,
        title: mission.title,
        summary: mission.summary,
        courseId: mission.courseId,
        sequence: mission.sequence,
        skills: [...mission.skills],
        prerequisites: [...mission.prerequisites],
        difficulty: mission.difficulty,
        estimatedMinutes: mission.estimatedMinutes,
        interaction: mission.interaction,
        runtime: {
            kind: mission.runtime.kind,
            label: runtimeLabel(mission.runtime.kind),
            capabilities: [...mission.runtime.capabilities],
        },
        tags: [...mission.tags],
    };
}

function projectSummary(project: ProjectDefinition): {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly difficulty: string;
    readonly skills: readonly string[];
    readonly estimatedMinutes: number;
    readonly runtime: string;
    readonly language: string;
} {
    return {
        id: project.id,
        title: project.title,
        summary: project.summary,
        difficulty: project.difficulty,
        skills: [...project.skills],
        estimatedMinutes: project.estimatedMinutes,
        runtime: project.runtime,
        language: project.language,
    };
}

export function createCatalogRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/catalog", function catalog(context): Response {
        return context.json({
            version: 1,
            skills: services.content.skills,
            tracks: services.content.tracks,
            missions: services.content.missions.map(missionSummary),
            projects: services.content.projects.map(projectSummary),
            placement: services.content.placement,
            achievements: services.content.achievements,
            runtimes: RUNTIME_LABELS,
        });
    });

    routes.get("/skills/:id", function skill(context): Response {
        const skillId = context.req.param("id");
        const definition = services.content.getSkill(skillId);
        if (definition === undefined) {
            throw new AppError(404, "skill_not_found", "Unknown skill.");
        }
        return context.json(definition);
    });

    routes.get("/missions/:id", function mission(context): Response {
        const missionId = context.req.param("id");
        const definition = services.content.getMission(missionId);
        if (definition === undefined) {
            throw new AppError(404, "mission_not_found", "Unknown mission.");
        }
        return context.json({
            mission: definition,
            runtimeLabel: runtimeLabel(definition.runtime.kind),
        });
    });

    return routes;
}
