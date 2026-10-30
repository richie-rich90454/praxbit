import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../../../apps/server/src/app.ts";
import type { ServerConfig } from "../../../apps/server/src/config.ts";
import { createDatabasePool } from "../../../apps/server/src/db/pool.ts";
import {
    CapabilitiesSchema,
    ClubSchema,
    ProjectDetailSchema,
} from "../../../packages/contracts/src/index.ts";
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
            "/capabilities",
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
        expect(field(healthBody, "version")).toBe("0.1.0");
        expect(field(healthBody, "environment")).toBe("test");
        expect(field(field(healthBody, "capabilities"), "aiTutor")).toBe(false);
        expect(field(healthBody, "webBuild")).toBe(false);
        expect(JSON.stringify(healthBody)).not.toContain("postgres");

        const ready = await client.get("/readyz");
        expect(ready.status).toBe(200);
        const readyBody = await readJson(ready);
        expect(field(readyBody, "status")).toBe("ready");
        expect(field(field(readyBody, "checks"), "database")).toBe("ok");
        expect(field(field(readyBody, "checks"), "webBuild")).toBe("disabled");
        expect(JSON.stringify(readyBody)).not.toContain("postgres");
    });

    it("reports public capabilities without exposing provider configuration", async function testCapabilities(): Promise<void> {
        const client = new TestClient(context.app);
        const response = await client.get("/api/v1/capabilities");
        expect(response.status).toBe(200);
        const parsed = CapabilitiesSchema.parse(await readJson(response));
        expect(parsed.aiTutor).toBe(false);
        expect(JSON.stringify(parsed)).not.toContain("http");
    });

    it("rejects the native header for cookie sessions but accepts bearer sessions", async function testCsrfNative(): Promise<void> {
        const browser = new TestClient(context.app);
        await register(browser, "csrf_native_user");

        const blocked = await browser.post(
            "/api/v1/sync",
            { operations: [] },
            { native: true, csrf: false },
        );
        expect(blocked.status).toBe(403);
        expectApiError(await readJson(blocked), "csrf_invalid");

        const native = new TestClient(context.app);
        await native.csrfToken();
        const auth = await register(native, "native_bearer_user", { native: true, csrf: true });
        expect(auth.nativeToken).toBeDefined();

        const bearer = new TestClient(context.app);
        bearer.useBearer(auth.nativeToken ?? "", true);
        const allowed = await bearer.post("/api/v1/sync", { operations: [] }, { csrf: false });
        expect(allowed.status).toBe(200);
    });

    it("allows native CORS preflights only from configured origins", async function testNativeCors(): Promise<void> {
        const config: ServerConfig = {
            ...context.config,
            corsOrigins: ["https://localhost", "capacitor://localhost"],
        };
        const app = createApplication({
            config,
            pool: context.pool,
            content: context.content,
        });
        const allowed = await app.request("http://localhost/api/v1/auth/login", {
            method: "OPTIONS",
            headers: {
                origin: "https://localhost",
                "access-control-request-method": "POST",
                "access-control-request-headers": "content-type,x-praxbit-client",
            },
        });
        expect(allowed.status).toBe(204);
        expect(allowed.headers.get("access-control-allow-origin")).toBe("https://localhost");
        expect(allowed.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
            "x-praxbit-client",
        );

        const denied = await app.request("http://localhost/api/v1/auth/login", {
            method: "OPTIONS",
            headers: {
                origin: "https://evil.example",
                "access-control-request-method": "POST",
            },
        });
        expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("separates rate limit buckets when the socket address is unavailable", async function testClientKeys(): Promise<void> {
        function buildApp(
            globalPerMinute: number,
            trustProxy: boolean,
        ): ReturnType<typeof createApplication> {
            const config: ServerConfig = {
                ...context.config,
                trustProxy,
                rateLimits: { ...context.config.rateLimits, globalPerMinute },
            };
            return createApplication({ config, pool: context.pool, content: context.content });
        }

        const untrusted = buildApp(1, false);
        const first = await untrusted.request("http://localhost/api/v1/catalog", {
            headers: { "x-forwarded-for": "203.0.113.10" },
        });
        expect(first.status).toBe(200);
        const repeated = await untrusted.request("http://localhost/api/v1/catalog", {
            headers: { "x-forwarded-for": "203.0.113.10" },
        });
        expect(repeated.status).toBe(429);
        const other = await untrusted.request("http://localhost/api/v1/catalog", {
            headers: { "x-forwarded-for": "203.0.113.11" },
        });
        expect(other.status).toBe(200);

        const trusted = buildApp(1, true);
        const proxied = await trusted.request("http://localhost/api/v1/catalog", {
            headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
        });
        expect(proxied.status).toBe(200);
        const sameClient = await trusted.request("http://localhost/api/v1/catalog", {
            headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.2" },
        });
        expect(sameClient.status).toBe(429);
        const anotherClient = await trusted.request("http://localhost/api/v1/catalog", {
            headers: { "x-forwarded-for": "198.51.100.8, 10.0.0.1" },
        });
        expect(anotherClient.status).toBe(200);
    });

    it("applies a dedicated rate limit to club event submissions", async function testEventSubmissionLimit(): Promise<void> {
        const event = context.content.clubEvents[0];
        if (event === undefined) {
            throw new Error("The content catalog has no club event.");
        }
        const config: ServerConfig = {
            ...context.config,
            rateLimits: { ...context.config.rateLimits, eventSubmissionsPerHour: 0 },
        };
        const app = createApplication({ config, pool: context.pool, content: context.content });
        const client = new TestClient(app);
        await register(client, "event_limit_user");
        const created = await client.post("/api/v1/clubs", { name: "Rate Limited Club" });
        expect(created.status).toBe(201);

        const response = await client.post(`/api/v1/events/${event.id}/submissions`, {
            eventId: event.id,
            answer: "idempotency-key",
        });
        expect(response.status).toBe(429);
        expectApiError(await readJson(response), "rate_limited");
        expect(response.headers.get("retry-after")).not.toBeNull();
    });

    it("reports not ready when the database or a required web build is missing", async function testNotReady(): Promise<void> {
        const brokenPool = createDatabasePool(context.config);
        await brokenPool.end();
        const brokenApp = createApplication({
            config: context.config,
            pool: brokenPool,
            content: context.content,
        });
        const broken = await new TestClient(brokenApp).get("/readyz");
        expect(broken.status).toBe(503);
        const brokenBody = await readJson(broken);
        expect(field(brokenBody, "status")).toBe("not_ready");
        expect(field(field(brokenBody, "checks"), "database")).toBe("failed");

        const emptyWeb = await mkdtemp(join(tmpdir(), "praxbit-empty-web-"));
        try {
            const productionApp = createApplication({
                config: { ...context.config, nodeEnvironment: "production" },
                pool: context.pool,
                content: context.content,
                webDirectory: emptyWeb,
            });
            const client = new TestClient(productionApp);
            const health = await readJson(await client.get("/healthz"));
            expect(field(health, "webBuild")).toBe(false);
            const ready = await client.get("/readyz");
            expect(ready.status).toBe(503);
            const readyBody = await readJson(ready);
            expect(field(readyBody, "status")).toBe("not_ready");
            expect(field(field(readyBody, "checks"), "webBuild")).toBe("missing");
        } finally {
            await rm(emptyWeb, { recursive: true, force: true });
        }
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

            const ready = await client.get("/readyz");
            expect(ready.status).toBe(200);
            const readyBody = await readJson(ready);
            expect(field(field(readyBody, "checks"), "webBuild")).toBe("ok");
            expect(field(readyBody, "webBuild")).toBe(true);

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
