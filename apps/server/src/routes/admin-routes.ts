import { Hono } from "hono";
import { z } from "zod";
import { PaginationSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { AppError } from "../http/app-error.ts";
import { parseQuery } from "../http/validation.ts";
import { requireAdministrator } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

const ReportIdSchema = z.uuid();

export function createAdminRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/overview", async function overview(context): Promise<Response> {
        requireAdministrator(context);
        const result = await services.admin.overview(services.pool, new Date());
        return context.json(result);
    });

    routes.get("/audit", async function audit(context): Promise<Response> {
        requireAdministrator(context);
        const query = parseQuery(context, PaginationSchema);
        if (query.cursor !== undefined && !/^\d+$/.test(query.cursor)) {
            throw new AppError(400, "validation_error", "The pagination cursor is invalid.");
        }
        const page = await services.audit.list(services.pool, query.limit, query.cursor);
        return context.json({
            items: [...page.items],
            nextCursor: page.nextCursor,
            limit: query.limit,
        });
    });

    routes.get("/reports", async function reports(context): Promise<Response> {
        requireAdministrator(context);
        const items = await services.admin.listOpenReports(services.pool);
        return context.json({ items: [...items] });
    });

    routes.post("/reports/:id/resolve", async function resolveReport(context): Promise<Response> {
        requireAdministrator(context);
        const parsed = ReportIdSchema.safeParse(context.req.param("id"));
        if (!parsed.success) {
            throw new AppError(400, "validation_error", "The report id is invalid.");
        }
        const resolved = await services.admin.resolveReport(services.pool, parsed.data, new Date());
        if (!resolved) {
            throw new AppError(404, "report_not_found", "Unknown open report.");
        }
        return context.body(null, 204);
    });

    return routes;
}
