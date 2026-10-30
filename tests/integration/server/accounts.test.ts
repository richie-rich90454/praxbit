import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    ClubSchema,
    ExportBundleSchema,
    ProjectDetailSchema,
} from "../../../packages/contracts/src/index.ts";
import {
    closeTestContext,
    createTestContext,
    resetDatabase,
    type TestContext,
} from "./helpers/database.ts";
import { TestClient, readJson, register } from "./helpers/client.ts";

const PROJECT_ID = "projects.campus-status-board";

describe("account export completeness", function accountExportSuite(): void {
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

    it("includes projects, revisions, club memberships, and reports", async function testExport(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "export_user");

        const revisionResponse = await client.post(`/api/v1/projects/${PROJECT_ID}/revisions`, {
            baseRevision: 0,
            message: "Initial export revision",
            files: { "index.html": "<!doctype html><html><body>Export</body></html>" },
        });
        expect(revisionResponse.status).toBe(200);
        ProjectDetailSchema.parse(await readJson(revisionResponse));

        const clubResponse = await client.post("/api/v1/clubs", { name: "Export Club" });
        expect(clubResponse.status).toBe(201);
        const club = ClubSchema.parse(await readJson(clubResponse));

        const reportResponse = await client.post(`/api/v1/clubs/${club.id}/reports`, {
            reason: "Testing the export path.",
        });
        expect(reportResponse.status).toBe(201);

        const exported = await client.post("/api/v1/me/export", {});
        expect(exported.status).toBe(200);
        const bundle = ExportBundleSchema.parse(await readJson(exported));

        expect(bundle.projects.length).toBe(1);
        expect(bundle.projects[0]?.projectId).toBe(PROJECT_ID);
        expect(bundle.projects[0]?.currentRevision).toBe(1);
        expect(bundle.projects[0]?.revisions.length).toBe(1);
        expect(bundle.projects[0]?.revisions[0]?.message).toBe("Initial export revision");

        expect(bundle.clubMemberships.length).toBe(1);
        expect(bundle.clubMemberships[0]?.clubId).toBe(club.id);
        expect(bundle.clubMemberships[0]?.role).toBe("owner");
        expect(bundle.clubMemberships[0]?.clubName).toBe("Export Club");

        expect(bundle.reports.length).toBe(1);
        expect(bundle.reports[0]?.clubId).toBe(club.id);
        expect(bundle.reports[0]?.status).toBe("open");
    });

    it("returns empty project, membership, and report lists for a fresh account", async function testEmptyExport(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "fresh_export_user");
        const exported = await client.post("/api/v1/me/export", {});
        expect(exported.status).toBe(200);
        const bundle = ExportBundleSchema.parse(await readJson(exported));
        expect(bundle.projects).toEqual([]);
        expect(bundle.clubMemberships).toEqual([]);
        expect(bundle.reports).toEqual([]);
    });
});
