import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    AuthResponseSchema,
    ExportBundleSchema,
    MeResponseSchema,
} from "../../../packages/contracts/src/index.ts";
import {
    closeTestContext,
    createTestContext,
    resetDatabase,
    type TestContext,
} from "./helpers/database.ts";
import {
    TestClient,
    expectApiError,
    field,
    login,
    postSync,
    readJson,
    register,
} from "./helpers/client.ts";

function isRegisteredAuditEntry(entry: unknown): boolean {
    if (typeof entry !== "object" || entry === null) {
        return false;
    }
    return field(entry, "action") === "account.registered";
}

describe("authentication, sessions, and account lifecycle", function authSuite(): void {
    let context: TestContext;

    beforeAll(async function setup(): Promise<void> {
        context = await createTestContext();
    });

    afterAll(async function teardown(): Promise<void> {
        await closeTestContext(context);
    });

    beforeEach(async function reset(): Promise<void> {
        await resetDatabase(context);
    });

    it("requires a double-submit CSRF token for cookie mutations", async function testCsrf(): Promise<void> {
        const client = new TestClient(context.app);
        await client.csrfToken();

        const blocked = await client.post(
            "/api/v1/auth/register",
            { handle: "csrf_user", password: "correct horse battery" },
            { csrf: false },
        );
        expect(blocked.status).toBe(403);
        expectApiError(await readJson(blocked), "csrf_invalid");

        const auth = await register(client, "csrf_user");
        expect(auth.user.handle).toBe("csrf_user");

        const me = await client.get("/api/v1/me");
        expect(me.status).toBe(200);
        MeResponseSchema.parse(await readJson(me));

        const mutationWithoutHeader = await client.post(
            "/api/v1/sync",
            { operations: [] },
            { csrf: false },
        );
        expect(mutationWithoutHeader.status).toBe(403);
        expectApiError(await readJson(mutationWithoutHeader), "csrf_invalid");
    });

    it("revokes the current session on logout and every session on request", async function testRevocation(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "session_user");

        const logout = await client.post("/api/v1/auth/logout", {});
        expect(logout.status).toBe(204);
        expect((await client.get("/api/v1/me")).status).toBe(401);

        await login(client, "session_user");
        expect((await client.get("/api/v1/me")).status).toBe(200);

        const revoke = await client.delete("/api/v1/auth/sessions");
        expect(revoke.status).toBe(204);
        expect((await client.get("/api/v1/me")).status).toBe(401);
    });

    it("supports native bearer sessions without CSRF and revokes them", async function testNative(): Promise<void> {
        const client = new TestClient(context.app);
        const auth = await register(client, "native_user", { native: true, csrf: false });
        expect(auth.nativeToken).toBeDefined();
        const token = auth.nativeToken ?? "";

        const nativeClient = new TestClient(context.app);
        nativeClient.useBearer(token, true);
        const me = await nativeClient.get("/api/v1/me");
        expect(me.status).toBe(200);

        const revoke = await nativeClient.delete("/api/v1/auth/sessions");
        expect(revoke.status).toBe(204);

        const rejected = await nativeClient.get("/api/v1/me");
        expect(rejected.status).toBe(401);
        expectApiError(await readJson(rejected), "invalid_token");
    });

    it("returns a stable error envelope and rejects duplicate handles", async function testErrors(): Promise<void> {
        const anonymous = new TestClient(context.app);

        const missing = await anonymous.get("/api/v1/does-not-exist");
        expect(missing.status).toBe(404);
        expectApiError(await readJson(missing), "not_found");

        const invalid = await anonymous.post("/api/v1/auth/login", { handle: "x" });
        expect(invalid.status).toBe(400);
        expectApiError(await readJson(invalid), "validation_error");

        expect((await anonymous.get("/api/v1/me")).status).toBe(401);

        const client = new TestClient(context.app);
        await register(client, "duplicate_user");
        const duplicate = await client.post("/api/v1/auth/register", {
            handle: "duplicate_user",
            password: "correct horse battery",
        });
        expect(duplicate.status).toBe(409);
        expectApiError(await readJson(duplicate), "handle_taken");
    });

    it("authorizes administrator routes from the database role", async function testAdmin(): Promise<void> {
        const member = new TestClient(context.app);
        await register(member, "plain_member");
        const denied = await member.get("/api/v1/admin/overview");
        expect(denied.status).toBe(403);
        expectApiError(await readJson(denied), "admin_required");

        const admin = new TestClient(context.app);
        const adminAuth = await register(admin, "admin_handle");
        expect(adminAuth.user.role).toBe("admin");

        const overview = await admin.get("/api/v1/admin/overview");
        expect(overview.status).toBe(200);
        const overviewBody = await readJson(overview);
        expect(field(overviewBody, "users")).toBe(2);

        const audit = await admin.get("/api/v1/admin/audit?limit=10");
        expect(audit.status).toBe(200);
        const auditBody = await readJson(audit);
        const items = field(auditBody, "items");
        expect(Array.isArray(items)).toBe(true);
        if (Array.isArray(items)) {
            expect(items.some(isRegisteredAuditEntry)).toBe(true);
        }

        const firstPage = await admin.get("/api/v1/admin/audit?limit=1");
        expect(firstPage.status).toBe(200);
        const nextCursor = field(await readJson(firstPage), "nextCursor");
        expect(typeof nextCursor).toBe("string");
        const secondPage = await admin.get(
            `/api/v1/admin/audit?limit=1&cursor=${encodeURIComponent(String(nextCursor))}`,
        );
        expect(secondPage.status).toBe(200);
        const secondItems = field(await readJson(secondPage), "items");
        expect(Array.isArray(secondItems)).toBe(true);
    });

    it("exports every personal record and hard-deletes the account", async function testExportAndDelete(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "delete_me");

        const evidenceResponse = await client.post("/api/v1/me/evidence", {
            evidence: {
                id: crypto.randomUUID(),
                missionId: "before-code.make-it-respond",
                missionVersion: 1,
                category: "prediction",
                outcome: "success",
                assistance: "independent",
                independence: 1,
                createdAt: new Date().toISOString(),
            },
        });
        expect(evidenceResponse.status).toBe(200);

        const preferencesResponse = await client.post("/api/v1/sync", {
            operations: [
                {
                    kind: "preferences",
                    operationId: "prefs-export-1",
                    preferences: {
                        interests: ["web"],
                        textScale: 1.2,
                        motion: "reduce",
                        sound: false,
                        challenge: "stretch",
                        reminders: { enabled: true, quietStart: "22:00", quietEnd: "07:30" },
                        aiTutor: true,
                    },
                },
            ],
        });
        expect(preferencesResponse.status).toBe(200);

        const exported = await client.post("/api/v1/me/export", {});
        expect(exported.status).toBe(200);
        const bundle = ExportBundleSchema.parse(await readJson(exported));
        expect(bundle.user.handle).toBe("delete_me");
        expect(bundle.evidence.length).toBe(1);
        expect(bundle.worlds.length).toBe(1);
        expect(bundle.preferences.textScale).toBe(1.2);

        const deleted = await client.delete("/api/v1/me");
        expect(deleted.status).toBe(204);
        expect((await client.get("/api/v1/me")).status).toBe(401);

        const remaining = await context.pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM users WHERE handle = $1",
            ["delete_me"],
        );
        expect(remaining.rows[0]?.count).toBe("0");

        const audit = await context.pool.query<{ actor_user_id: string | null; action: string }>(
            "SELECT actor_user_id, action FROM audit_events WHERE action = 'account.deleted'",
        );
        expect(audit.rows.length).toBe(1);
        expect(audit.rows[0]?.actor_user_id).toBeNull();

        const freshClient = new TestClient(context.app);
        await freshClient.csrfToken();
        const attempt = await freshClient.post("/api/v1/auth/login", {
            handle: "delete_me",
            password: "correct horse battery",
        });
        expect(attempt.status).toBe(401);
        expectApiError(await readJson(attempt), "invalid_credentials");
    });

    it("returns 503 when the AI provider is not configured", async function testAiUnavailable(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "ai_user");
        const response = await client.post("/api/v1/ai/hints", {
            missionId: "before-code.make-it-respond",
            stepId: "stamp",
            question: "What should I notice first?",
        });
        expect(response.status).toBe(503);
        expectApiError(await readJson(response), "ai_unavailable");
    });

    it("completes a sync round trip for authenticated native clients", async function testNativeSync(): Promise<void> {
        const client = new TestClient(context.app);
        const auth = await register(client, "native_sync", { native: true, csrf: false });
        client.useBearer(auth.nativeToken ?? "", true);
        const snapshot = await postSync(client, []);
        expect(snapshot.world.id).toBe("campus");
        expect(snapshot.progress.experience).toBe(0);
        expect(
            AuthResponseSchema.parse({ user: auth.user, preferences: auth.preferences }).user
                .handle,
        ).toBe("native_sync");
    });
});
