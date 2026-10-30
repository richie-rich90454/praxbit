import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { EvidenceResultSchema, SyncResponseSchema } from "../../../packages/contracts/src/index.ts";

export const E2E_PASSWORD = "praxbit-e2e-password";
export const E2E_BASE_URL = "http://127.0.0.1:4173";
export const OPENING_MISSION_ID = "before-code.make-it-respond";
export const OPENING_MISSION_VERSION = 1;
export const STATUS_PROJECT_ID = "projects.campus-status-board";

export interface Parser<T> {
    parse(value: unknown): T;
}

export function uniqueHandle(prefix: string): string {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return `${prefix}_${suffix}`.slice(0, 24);
}

function parseJson(payload: string, path: string): unknown {
    if (payload.length === 0) {
        throw new Error(`The server returned an empty body for ${path}.`);
    }
    try {
        return JSON.parse(payload);
    } catch {
        throw new Error(`The server did not return JSON for ${path}: ${payload.slice(0, 200)}`);
    }
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${context} is not a JSON object.`);
    }
    return value as Record<string, unknown>;
}

async function csrfToken(request: APIRequestContext): Promise<string> {
    const response = await request.get("/api/v1/auth/csrf");
    const payload = asRecord(await response.json(), "The CSRF response");
    if (!response.ok()) {
        throw new Error(`The CSRF request failed with ${String(response.status())}.`);
    }
    const token = payload["csrfToken"];
    if (typeof token !== "string" || token.length === 0) {
        throw new Error("The CSRF response contains an invalid csrfToken.");
    }
    return token;
}

export async function apiGet<T>(
    request: APIRequestContext,
    path: string,
    parser: Parser<T>,
): Promise<T> {
    const response = await request.get(path);
    const payload = await response.text();
    expect(response.ok(), `${path} returned ${String(response.status())}: ${payload}`).toBe(true);
    return parser.parse(parseJson(payload, path));
}

export async function apiPost<T>(
    request: APIRequestContext,
    path: string,
    body: unknown,
    parser: Parser<T>,
): Promise<T> {
    const token = await csrfToken(request);
    const response = await request.post(path, {
        data: body,
        headers: { "x-csrf-token": token },
    });
    const payload = await response.text();
    expect(response.ok(), `${path} returned ${String(response.status())}: ${payload}`).toBe(true);
    return parser.parse(parseJson(payload, path));
}

export async function apiDelete(request: APIRequestContext, path: string): Promise<void> {
    const token = await csrfToken(request);
    const response = await request.delete(path, {
        headers: { "x-csrf-token": token },
    });
    const payload = await response.text();
    expect(response.ok(), `${path} returned ${String(response.status())}: ${payload}`).toBe(true);
}

export function readStringField(value: unknown, key: string): string {
    const field = asRecord(value, "The response")[key];
    if (typeof field !== "string") {
        throw new Error(`The response field ${key} is not a string.`);
    }
    return field;
}

export function readNumberField(value: unknown, key: string): number {
    const field = asRecord(value, "The response")[key];
    if (typeof field !== "number") {
        throw new Error(`The response field ${key} is not a number.`);
    }
    return field;
}

export async function registerThroughUi(page: Page, handle: string): Promise<void> {
    await page.goto("/settings");
    await expect(page.getByRole("tab", { name: "Create account" })).toBeVisible();
    await page.getByLabel("Handle").fill(handle);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Create account and upload progress" }).click();
    await expect(page.getByText("Account created.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`@${handle}`)).toBeVisible();
}

export async function signOutThroughUi(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("tab", { name: "Create account" })).toBeVisible();
}

export async function loginThroughUi(page: Page, handle: string): Promise<void> {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Sign in" }).click();
    await page.getByLabel("Handle").fill(handle);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Signed in. The account state is now authoritative")).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.getByText(`@${handle}`)).toBeVisible();
}

export async function completeOpeningMission(page: Page): Promise<void> {
    await page.goto("/");
    await page.getByRole("button", { name: /start mission/i }).click();
    await page.locator("#machine-stamp-count").fill("3");
    await page.getByRole("button", { name: /run machine/i }).click();
    await page.locator("#machine-stamp-count").fill("4");
    await page.getByRole("button", { name: /run machine/i }).click();
    await page.getByRole("radio", { name: "4 marks" }).check();
    await page.getByRole("radio", { name: "CAMPUS", exact: true }).check();
    await page.getByRole("button", { name: /check prediction/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: /controller/i }).check();
    await page.getByRole("button", { name: /check answer/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible();
}

export async function recordOpeningMission(request: APIRequestContext): Promise<void> {
    const now = new Date().toISOString();
    const evidenceId = crypto.randomUUID();
    await apiPost(
        request,
        "/api/v1/me/evidence",
        {
            evidence: {
                id: evidenceId,
                missionId: OPENING_MISSION_ID,
                missionVersion: OPENING_MISSION_VERSION,
                category: "prediction",
                outcome: "success",
                assistance: "independent",
                independence: 1,
                createdAt: now,
            },
        },
        EvidenceResultSchema,
    );
    await apiPost(
        request,
        "/api/v1/sync",
        {
            operations: [
                {
                    kind: "mission-completion",
                    operationId: `completion:${evidenceId}`,
                    missionId: OPENING_MISSION_ID,
                    missionVersion: OPENING_MISSION_VERSION,
                    attemptId: crypto.randomUUID(),
                    independent: true,
                    completedAt: now,
                },
            ],
        },
        SyncResponseSchema,
    );
}
