import { Hono } from "hono";
import { ProjectRevisionRequestSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { parseRequestBody } from "../http/validation.ts";
import { requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

export function createProjectRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/", async function listProjects(context): Promise<Response> {
        const session = context.get("session");
        const detail = await services.project.listProjects(
            session === null ? undefined : session.user.id,
        );
        return context.json(detail);
    });

    routes.get("/:id", async function getProject(context): Promise<Response> {
        const session = context.get("session");
        const detail = await services.project.getProject(
            session === null ? undefined : session.user.id,
            context.req.param("id"),
        );
        return context.json(detail);
    });

    routes.post("/:id/revisions", async function saveRevision(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, ProjectRevisionRequestSchema);
        const detail = await services.project.saveRevision({
            userId: session.user.id,
            projectId: context.req.param("id"),
            baseRevision: body.baseRevision,
            message: body.message,
            files: body.files,
            now: new Date(),
        });
        return context.json(detail);
    });

    return routes;
}
