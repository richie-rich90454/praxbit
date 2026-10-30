import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApplication } from "../../../apps/server/src/app.ts";
import { closeTestContext, createTestContext, type TestContext } from "./helpers/database.ts";
import { TestClient, field, readJson, register } from "./helpers/client.ts";

describe("metrics endpoint", function metricsSuite(): void {
    let context: TestContext;

    beforeAll(async function setup(): Promise<void> {
        context = await createTestContext();
    });

    afterAll(async function teardown(): Promise<void> {
        await closeTestContext(context);
    });

    it("serves Prometheus metrics with process, database, and request series", async function testMetrics(): Promise<void> {
        const client = new TestClient(context.app);
        expect((await client.get("/api/v1/catalog")).status).toBe(200);
        expect((await client.get("/api/v1/missions/unknown.mission")).status).toBe(404);

        const response = await client.get("/metrics");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe(
            "text/plain; version=0.0.4; charset=utf-8",
        );
        const body = await response.text();
        expect(body).toContain("# TYPE praxbit_http_requests_total counter");
        expect(body).toContain('praxbit_http_requests_total{method="GET",status="200"}');
        expect(body).toContain('praxbit_http_requests_total{method="GET",status="404"}');
        expect(body).toContain("# TYPE praxbit_http_request_duration_seconds histogram");
        expect(body).toContain('route="/api/v1/catalog"');
        expect(body).toContain('le="+Inf"');
        expect(body).toContain("# TYPE process_uptime_seconds gauge");
        expect(body).toContain("# TYPE process_resident_memory_bytes gauge");
        expect(body).toContain("# TYPE nodejs_heap_used_bytes gauge");
        expect(body).toContain('nodejs_event_loop_lag_seconds{quantile="0.99"}');
        expect(body).toContain("# TYPE praxbit_db_pool_total gauge");
        expect(body).toContain("# TYPE praxbit_db_pool_idle gauge");
        expect(body).toContain("# TYPE praxbit_db_pool_waiting gauge");
        expect(body).toContain("praxbit_db_ready 1");
        expect(body).toContain("praxbit_ready 1");
        expect(body).not.toContain("postgres://");
        expect(body).not.toContain("DATABASE_URL");
    });

    it("keeps metrics public outside production and hides them behind loopback or admin auth in production", async function testMetricsAuth(): Promise<void> {
        const member = new TestClient(context.app);
        const memberAuth = await register(member, "metrics_probe_member", {
            native: true,
            csrf: true,
        });
        const memberToken = memberAuth.nativeToken;
        if (memberToken === undefined) {
            throw new Error("The member registration did not return a native token.");
        }

        const administrator = new TestClient(context.app);
        const adminAuth = await register(administrator, "metrics_probe_admin", {
            native: true,
            csrf: true,
        });
        const adminToken = adminAuth.nativeToken;
        if (adminToken === undefined) {
            throw new Error("The admin registration did not return a native token.");
        }
        await context.pool.query("UPDATE users SET role = 'admin' WHERE handle = $1", [
            "metrics_probe_admin",
        ]);

        const productionApp = createApplication({
            config: { ...context.config, nodeEnvironment: "production" },
            pool: context.pool,
            content: context.content,
        });

        const anonymous = await new TestClient(productionApp).get("/metrics");
        expect(anonymous.status).toBe(404);

        const memberClient = new TestClient(productionApp);
        memberClient.useBearer(memberToken, true);
        const denied = await memberClient.get("/metrics");
        expect(denied.status).toBe(404);
        const deniedBody = await readJson(denied);
        expect(field(field(deniedBody, "error"), "code")).toBe("not_found");

        const adminClient = new TestClient(productionApp);
        adminClient.useBearer(adminToken, true);
        const allowed = await adminClient.get("/metrics");
        expect(allowed.status).toBe(200);
        const allowedBody = await allowed.text();
        expect(allowedBody).toContain("praxbit_db_ready 1");
        expect(allowedBody).not.toContain("metrics_probe_admin");

        const previousToken = process.env["PRAXBIT_METRICS_TOKEN"];
        process.env["PRAXBIT_METRICS_TOKEN"] = "drill-metrics-token";
        try {
            const tokenClient = new TestClient(productionApp);
            tokenClient.useBearer("drill-metrics-token", true);
            expect((await tokenClient.get("/metrics")).status).toBe(200);

            const wrongClient = new TestClient(productionApp);
            wrongClient.useBearer("wrong-metrics-token", true);
            expect((await wrongClient.get("/metrics")).status).toBe(404);
        } finally {
            if (previousToken === undefined) {
                delete process.env["PRAXBIT_METRICS_TOKEN"];
            } else {
                process.env["PRAXBIT_METRICS_TOKEN"] = previousToken;
            }
        }

        const developmentMetrics = await new TestClient(context.app).get("/metrics");
        expect(developmentMetrics.status).toBe(200);
    });
});
