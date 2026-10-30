import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import type { ProjectDetail } from "../../packages/contracts/src/index.ts";
import {
    CapabilitiesSchema,
    ClubDetailSchema,
    ClubSchema,
    ExportBundleSchema,
    MeResponseSchema,
    ProjectDetailSchema,
} from "../../packages/contracts/src/index.ts";
import {
    E2E_BASE_URL,
    STATUS_PROJECT_ID,
    apiDelete,
    apiGet,
    apiPost,
    completeOpeningMission,
    loginThroughUi,
    readNumberField,
    readStringField,
    recordOpeningMission,
    registerThroughUi,
    signOutThroughUi,
    uniqueHandle,
} from "./helpers/fullstack.ts";

async function projectDetail(
    request: APIRequestContext,
    projectId: string,
): Promise<ProjectDetail> {
    return apiGet(
        request,
        `/api/v1/projects/${encodeURIComponent(projectId)}`,
        ProjectDetailSchema,
    );
}

test.describe("real full-stack behavior", function fullStackSuite(): void {
    test("capabilities report no AI tutor without AI configuration", async function capabilities({
        request,
    }: {
        request: APIRequestContext;
    }): Promise<void> {
        const capabilityPayload = await apiGet(request, "/api/v1/capabilities", CapabilitiesSchema);
        expect(capabilityPayload.aiTutor).toBe(false);
    });

    test("a guest completes the opening mission and progress survives reload", async function guestProgress({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        await completeOpeningMission(page);
        await page.reload();
        await page.goto("/learn");
        const firstNode = page.locator(".map-node").first();
        await expect(firstNode).toContainText("Completed");
    });

    test("an account keeps evidence and completion progress across sign-in and reload", async function accountProgress({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        const handle = uniqueHandle("e2e_learner");
        await registerThroughUi(page, handle);
        await signOutThroughUi(page);
        await loginThroughUi(page, handle);

        await recordOpeningMission(page.request);
        await page.reload();

        const me = await apiGet(page.request, "/api/v1/me", MeResponseSchema);
        expect(me.user.handle).toBe(handle);
        expect(
            me.completions.some(function isOpening(completion): boolean {
                return completion.missionId === "before-code.make-it-respond";
            }),
        ).toBe(true);
        expect(me.progress.experience).toBeGreaterThan(0);

        await page.goto("/learn");
        await expect(page.locator(".map-node").first()).toContainText("Completed");
    });

    test("project saves create sequential server revisions without overwriting", async function projectRevisions({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        const handle = uniqueHandle("e2e_project");
        await registerThroughUi(page, handle);
        await page.goto(`/projects/${STATUS_PROJECT_ID}`);

        const saveButton = page.getByRole("button", { name: "Save revision to account" });
        await expect(saveButton).toBeVisible({ timeout: 30_000 });

        const firstRequest = page.waitForRequest(function isRevisionRequest(request): boolean {
            return (
                request.method() === "POST" &&
                request.url().endsWith(`/api/v1/projects/${STATUS_PROJECT_ID}/revisions`)
            );
        });
        await saveButton.click();
        const firstPayload: unknown = (await firstRequest).postDataJSON();
        expect(readNumberField(firstPayload, "baseRevision")).toBe(0);
        await expect(page.getByText("Revision 1 saved.")).toBeVisible();

        const first = await projectDetail(page.request, STATUS_PROJECT_ID);
        expect(first.project.currentRevision).toBe(1);
        const firstHtml = first.revisions[0]?.files["index.html"];
        if (firstHtml === undefined) {
            throw new Error("The first revision did not include index.html.");
        }

        const marker = `e2e-${Date.now().toString(36)}`;
        const editor = page.locator(".cm-content").first();
        await expect(editor).toBeVisible();
        await editor.fill(`${firstHtml}\n<!-- ${marker} -->`);

        const secondRequest = page.waitForRequest(function isRevisionRequest(request): boolean {
            return (
                request.method() === "POST" &&
                request.url().endsWith(`/api/v1/projects/${STATUS_PROJECT_ID}/revisions`)
            );
        });
        await saveButton.click();
        const secondPayload: unknown = (await secondRequest).postDataJSON();
        expect(readNumberField(secondPayload, "baseRevision")).toBe(1);
        await expect(page.getByText("Revision 2 saved.")).toBeVisible();

        const second = await projectDetail(page.request, STATUS_PROJECT_ID);
        expect(second.project.currentRevision).toBe(2);
        expect(
            second.revisions.map(function number(revision): number {
                return revision.revision;
            }),
        ).toEqual([1, 2]);
        expect(second.revisions[0]?.files["index.html"]).toBe(firstHtml);
        expect(second.revisions[1]?.files["index.html"]).toContain(marker);
    });

    test("clubs support ownership, joining, a verified leaderboard, and reports", async function clubs({
        page,
        browser,
    }: {
        page: Page;
        browser: Browser;
    }): Promise<void> {
        const ownerHandle = uniqueHandle("e2e_owner");
        const memberHandle = uniqueHandle("e2e_member");
        const clubName = `E2E Club ${Date.now().toString(36)}`;

        await registerThroughUi(page, ownerHandle);
        await page.goto("/club");
        await page.getByLabel("Club name").fill(clubName);
        await page.getByRole("button", { name: "Create club" }).click();
        await expect(page.getByRole("heading", { name: clubName })).toBeVisible();

        const clubList = await apiGet(page.request, "/api/v1/clubs", ClubSchema.array());
        const created = clubList.find(function nameMatches(club): boolean {
            return club.name === clubName;
        });
        if (created === undefined) {
            throw new Error("The created club was not returned by the API.");
        }
        const detail = await apiGet(page.request, `/api/v1/clubs/${created.id}`, ClubDetailSchema);
        const inviteCode = detail.club.inviteCode;
        if (inviteCode === undefined) {
            throw new Error("The owner did not receive an invite code.");
        }

        const memberContext = await browser.newContext({ baseURL: E2E_BASE_URL });
        try {
            const memberPage = await memberContext.newPage();
            await registerThroughUi(memberPage, memberHandle);
            await memberPage.goto("/club");
            await memberPage.getByLabel("Invite code").fill(inviteCode);
            await memberPage.getByRole("button", { name: "Join club" }).click();
            await expect(memberPage.getByText("2 members · Your role: Member")).toBeVisible();

            await page.getByRole("radio", { name: /stable idempotency key/i }).check();
            await page.getByRole("button", { name: "Submit verified answer" }).click();
            await expect(page.getByText(/Verified answer recorded/)).toBeVisible();

            await memberPage.reload();
            await expect(memberPage.getByRole("heading", { name: clubName })).toBeVisible();
            const leaderboardRow = memberPage
                .getByRole("table")
                .getByRole("row", { name: new RegExp(ownerHandle) });
            await expect(leaderboardRow).toContainText("100");

            const reason = "Repeated off-topic messages in the club.";
            const report = await apiPost<unknown>(
                memberPage.request,
                `/api/v1/clubs/${created.id}/reports`,
                { reason },
                {
                    parse(value: unknown): unknown {
                        return value;
                    },
                },
            );
            expect(readStringField(report, "reportId")).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            );

            const bundle = await apiPost(
                memberPage.request,
                "/api/v1/me/export",
                {},
                ExportBundleSchema,
            );
            expect(bundle.user.handle).toBe(memberHandle);
            expect(
                bundle.clubMemberships.some(function membership(club): boolean {
                    return club.clubId === created.id && club.role === "member";
                }),
            ).toBe(true);
            expect(
                bundle.reports.some(function reportMatches(item): boolean {
                    return item.reason === reason;
                }),
            ).toBe(true);
        } finally {
            await memberContext.close();
        }
    });

    test("account export includes the account and progress, and deletion removes the session", async function accountLifecycle({
        page,
    }: {
        page: Page;
    }): Promise<void> {
        const handle = uniqueHandle("e2e_export");
        await registerThroughUi(page, handle);
        await recordOpeningMission(page.request);

        const bundle = await apiPost(page.request, "/api/v1/me/export", {}, ExportBundleSchema);
        expect(bundle.user.handle).toBe(handle);
        expect(bundle.progress.experience).toBeGreaterThan(0);
        expect(bundle.evidence.length).toBeGreaterThan(0);

        await apiDelete(page.request, "/api/v1/me");
        const remaining = await page.request.get("/api/v1/me");
        expect(remaining.status()).toBe(401);
        const sessionCookie = (await page.context().cookies()).find(
            function isSession(cookie): boolean {
                return cookie.name === "praxbit_session";
            },
        );
        expect(sessionCookie).toBeUndefined();

        await page.goto("/settings");
        await expect(page.getByRole("tab", { name: "Create account" })).toBeVisible();
    });
});
