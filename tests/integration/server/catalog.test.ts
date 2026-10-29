import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../../../apps/server/src/app.ts";
import { ClubSchema, ProjectDetailSchema } from "../../../packages/contracts/src/index.ts";
import { closeTestContext, createTestContext, type TestContext } from "./helpers/database.ts";
import { TestClient, expectApiError, field, readJson, register } from "./helpers/client.ts";

function asArray(value: unknown): readonly unknown[] {
    if (!Array.isArray(value)) {
        throw new Error("Expected an array.");
    }
    return value;
}

describe("catalog, health, and transport protections", function catalogSuite(): void {
    let context: TestContext;

    beforeAll(async function setup(): Promise<void> {
        context = await createTestContext();
    });

    afterAll(async function teardown(): Promise<void> {
        await closeTestContext(context);
    });

    it("serves validated catalog and mission metadata with runtime labels", async function testCatalog(): Promise<void> {
        const client = new TestClient(context.app);
        const catalog = await client.get("/api/v1/catalog");
        expect(catalog.status).toBe(200);
        const catalogBody = await readJson(catalog);
        expect(asArray(field(catalogBody, "missions")).length).toBe(
            context.content.missions.length,
        );
        expect(asArray(field(catalogBody, "skills")).length).toBe(context.content.skills.length);
        const runtimes = field(catalogBody, "runtimes");
        expect(field(runtimes, "browser-python")).toContain("Real Python");

        const skill = await client.get("/api/v1/skills/concept.computation");
        expect(skill.status).toBe(200);
        expect(field(await readJson(skill), "id")).toBe("concept.computation");

        const missingSkill = await client.get("/api/v1/skills/concept.does-not-exist");
        expect(missingSkill.status).toBe(404);
        expectApiError(await readJson(missingSkill), "skill_not_found");

        const mission = await client.get("/api/v1/missions/before-code.make-it-respond");
        expect(mission.status).toBe(200);
        const missionBody = await readJson(mission);
        expect(field(field(missionBody, "mission"), "id")).toBe("before-code.make-it-respond");
        expect(field(missionBody, "runtimeLabel")).toContain("Guided interaction");

        const missingMission = await client.get("/api/v1/missions/unknown.mission");
        expect(missingMission.status).toBe(404);
        expectApiError(await readJson(missingMission), "mission_not_found");
    });

    it("documents every route in the OpenAPI document", async function testOpenApi(): Promise<void> {
        const client = new TestClient(context.app);
        const response = await client.get("/api/v1/openapi.json");
        expect(response.status).toBe(200);
        const body = await readJson(response);
        const paths = field(body, "paths");
        for (const path of [
            "/auth/csrf",
            "/auth/register",
            "/auth/login",
            "/auth/logout",
            "/auth/sessions",
            "/me",
            "/me/export",
            "/me/evidence",
            "/attempts",
            "/attempts/{id}/evidence",
            "/sync",
            "/worlds/{id}",
            "/worlds/campus/actions",
            "/projects",
            "/projects/{id}",
            "/projects/{id}/revisions",
            "/clubs",
            "/clubs/join",
            "/clubs/{id}",
            "/clubs/{id}/join",
            "/events",
            "/events/{id}/submissions",
            "/ai/hints",
            "/catalog",
            "/skills/{id}",
            "/missions/{id}",
            "/admin/overview",
            "/admin/audit",
            "/admin/reports",
            "/admin/reports/{id}/resolve",
        ]) {
            expect(Object.prototype.hasOwnProperty.call(paths, path)).toBe(true);
        }
    });

    it("reports health and readiness without leaking configuration", async function testHealth(): Promise<void> {
        const client = new TestClient(context.app);
        const health = await client.get("/healthz");
        expect(health.status).toBe(200);
        const healthBody = await readJson(health);
        expect(field(healthBody, "status")).toBe("ok");
        expect(JSON.stringify(healthBody)).not.toContain("postgres");

        const ready = await client.get("/readyz");
        expect(ready.status).toBe(200);
        expect(field(await readJson(ready), "status")).toBe("ready");
    });

    it("serves projects publicly and with per-user revisions", async function testProjects(): Promise<void> {
        const anonymous = new TestClient(context.app);
        const list = await anonymous.get("/api/v1/projects");
        expect(list.status).toBe(200);
        const items = asArray(await readJson(list));
        expect(items.length).toBe(context.content.projects.length);

        const detail = await anonymous.get("/api/v1/projects/projects.campus-status-board");
        expect(detail.status).toBe(200);
        const parsed = ProjectDetailSchema.parse(await readJson(detail));
        expect(parsed.project.id).toBe("projects.campus-status-board");
        expect(parsed.revisions.length).toBe(0);

        const member = new TestClient(context.app);
        await register(member, "catalog_project_user");
        const saved = await member.post("/api/v1/projects/projects.campus-status-board/revisions", {
            baseRevision: 0,
            message: "Start",
            files: { "index.html": "<!doctype html><html><body>Board</body></html>" },
        });
        expect(saved.status).toBe(200);
        const withRevision = await member.get("/api/v1/projects/projects.campus-status-board");
        const parsedWithRevision = ProjectDetailSchema.parse(await readJson(withRevision));
        expect(parsedWithRevision.revisions.length).toBe(1);
        expect(parsedWithRevision.project.currentRevision).toBe(1);
    });

    it("sets security headers and bounds request bodies", async function testHeadersAndLimits(): Promise<void> {
        const client = new TestClient(context.app);
        const response = await client.get("/api/v1/catalog");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-frame-options")).toBe("DENY");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
        expect(response.headers.get("x-request-id")).not.toBeNull();

        const oversized = "x".repeat(300000);
        const tooLarge = await client.post("/api/v1/auth/login", {
            handle: "someone",
            password: oversized,
        });
        expect(tooLarge.status).toBe(413);
        expectApiError(await readJson(tooLarge), "payload_too_large");
    });

    it("returns an empty club list to anonymous callers", async function testClubListAuth(): Promise<void> {
        const anonymous = new TestClient(context.app);
        const response = await anonymous.get("/api/v1/clubs");
        expect(response.status).toBe(200);
        expect(ClubSchema.array().parse(await readJson(response)).length).toBe(0);
    });

    it("serves the built web shell, assets, and SPA fallback without capturing API 404s", async function testStaticSite(): Promise<void> {
        const webDirectory = await mkdtemp(join(tmpdir(), "praxbit-web-"));
        try {
            await writeFile(
                join(webDirectory, "index.html"),
                '<!doctype html><html><head><title>Praxbit shell</title></head><body><div id="app"></div></body></html>',
                "utf8",
            );
            await writeFile(join(webDirectory, "app.js"), "console.log('praxbit');", "utf8");
            await writeFile(join(webDirectory, "pyodide.mjs"), "export {};", "utf8");
            const app = createApplication({
                config: context.config,
                pool: context.pool,
                content: context.content,
                webDirectory,
            });
            const client = new TestClient(app);

            const home = await client.get("/");
            const homeText = await home.text();
            expect(home.status, homeText).toBe(200);
            expect(homeText).toContain("Praxbit shell");
            expect(home.headers.get("content-security-policy")).toContain("script-src 'self'");

            const asset = await client.get("/app.js");
            expect(asset.status).toBe(200);
            expect(await asset.text()).toContain("praxbit");

            const clientRoute = await client.get("/learn");
            expect(clientRoute.status).toBe(200);
            expect(await clientRoute.text()).toContain("Praxbit shell");

            const missionRoute = await client.get("/missions/python.collections");
            expect(missionRoute.status).toBe(200);
            expect(await missionRoute.text()).toContain("Praxbit shell");

            const projectRoute = await client.get("/projects/projects.campus-status-board");
            expect(projectRoute.status).toBe(200);
            expect(await projectRoute.text()).toContain("Praxbit shell");

            const module = await client.get("/pyodide.mjs");
            expect(module.status).toBe(200);
            expect(module.headers.get("content-type")).toBe("text/javascript; charset=utf-8");

            const missingAsset = await client.get("/missing.png");
            expect(missingAsset.status).toBe(404);

            const missingApi = await client.get("/api/v1/does-not-exist");
            expect(missingApi.status).toBe(404);
            expectApiError(await readJson(missingApi), "not_found");
        } finally {
            await rm(webDirectory, { recursive: true, force: true });
        }
    });
});
