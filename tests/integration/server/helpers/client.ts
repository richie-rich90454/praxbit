import {
    ApiErrorSchema,
    AuthResponseSchema,
    SyncResponseSchema,
    type EvidenceSubmission,
    type SyncOperation,
    type SyncResponse,
} from "../../../../packages/contracts/src/index.ts";
import type { TestApplication } from "./database.ts";
import { TEST_PASSWORD } from "./database.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface RequestOptions {
    readonly body?: unknown;
    readonly bearer?: string;
    readonly native?: boolean;
    readonly csrf?: boolean;
}

export async function readJson(response: Response): Promise<unknown> {
    const value: unknown = await response.json();
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(value: unknown, key: string): string {
    if (!isRecord(value)) {
        throw new Error(`Missing string field ${key}.`);
    }
    const candidate = value[key];
    if (typeof candidate !== "string") {
        throw new Error(`Field ${key} is not a string.`);
    }
    return candidate;
}

export function field(value: unknown, key: string): unknown {
    if (!isRecord(value) || !(key in value)) {
        throw new Error(`Missing field ${key}.`);
    }
    return value[key];
}

export function expectApiError(body: unknown, code: string): void {
    const parsed = ApiErrorSchema.parse(body);
    if (parsed.error.code !== code) {
        throw new Error(`Expected error code ${code}, received ${parsed.error.code}.`);
    }
    if (parsed.error.requestId.length === 0) {
        throw new Error("Error envelope is missing a request id.");
    }
}

export class TestClient {
    private readonly app: TestApplication;
    private readonly cookies: Map<string, string>;
    private csrfTokenValue: string | undefined;
    private bearerTokenValue: string | undefined;
    private nativeValue = false;

    public constructor(app: TestApplication) {
        this.app = app;
        this.cookies = new Map<string, string>();
    }

    public useBearer(token: string, native = false): void {
        this.bearerTokenValue = token;
        this.nativeValue = native;
    }

    public async csrfToken(): Promise<string> {
        if (this.csrfTokenValue !== undefined) {
            return this.csrfTokenValue;
        }
        const response = await this.raw("GET", "/api/v1/auth/csrf", {});
        if (!response.ok) {
            throw new Error(`CSRF request failed with ${String(response.status)}.`);
        }
        const body = await readJson(response);
        const token = readStringField(body, "csrfToken");
        this.csrfTokenValue = token;
        return token;
    }

    public async get(path: string, options: RequestOptions = {}): Promise<Response> {
        return this.request("GET", path, options);
    }

    public async post(
        path: string,
        body: unknown,
        options: RequestOptions = {},
    ): Promise<Response> {
        return this.request("POST", path, { ...options, body });
    }

    public async delete(path: string, options: RequestOptions = {}): Promise<Response> {
        return this.request("DELETE", path, options);
    }

    public async request(
        method: string,
        path: string,
        options: RequestOptions = {},
    ): Promise<Response> {
        const bearer = options.bearer ?? this.bearerTokenValue;
        const native = options.native ?? this.nativeValue;
        const headers: Record<string, string> = { accept: "application/json" };
        if (options.body !== undefined) {
            headers["content-type"] = "application/json";
        }
        if (bearer !== undefined) {
            headers["authorization"] = `Bearer ${bearer}`;
        }
        if (native) {
            headers["x-praxbit-client"] = "native";
        }
        const mutation = !SAFE_METHODS.has(method);
        const requireCsrf = mutation && bearer === undefined && !native && options.csrf !== false;
        if (requireCsrf) {
            headers["x-csrf-token"] = await this.csrfToken();
        }
        const forwarded: RequestOptions = {
            ...options,
            ...(bearer === undefined ? {} : { bearer }),
            native,
        };
        return this.raw(method, path, forwarded, headers);
    }

    private async raw(
        method: string,
        path: string,
        options: RequestOptions,
        preparedHeaders?: Record<string, string>,
    ): Promise<Response> {
        const headers: Record<string, string> = preparedHeaders ?? { accept: "application/json" };
        if (options.body !== undefined && headers["content-type"] === undefined) {
            headers["content-type"] = "application/json";
        }
        const cookie = [...this.cookies.entries()]
            .filter(function present(entry): boolean {
                return entry[1].length > 0;
            })
            .map(function pair(entry): string {
                return `${entry[0]}=${entry[1]}`;
            })
            .join("; ");
        if (cookie.length > 0) {
            headers["cookie"] = cookie;
        }
        const response = await this.app.request(`http://localhost${path}`, {
            method,
            headers,
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        for (const header of response.headers.getSetCookie()) {
            const pair = header.split(";")[0];
            if (pair === undefined) {
                continue;
            }
            const separator = pair.indexOf("=");
            if (separator <= 0) {
                continue;
            }
            const name = pair.slice(0, separator);
            const value = pair.slice(separator + 1);
            if (/max-age=0/i.test(header)) {
                this.cookies.delete(name);
            } else {
                this.cookies.set(name, value);
            }
        }
        return response;
    }
}

export async function register(
    client: TestClient,
    handle: string,
    options: RequestOptions = {},
): Promise<ReturnType<typeof AuthResponseSchema.parse>> {
    const response = await client.post(
        "/api/v1/auth/register",
        { handle, password: TEST_PASSWORD },
        options,
    );
    if (response.status !== 201) {
        const body = await readJson(response);
        throw new Error(`Registration failed: ${JSON.stringify(body)}`);
    }
    return AuthResponseSchema.parse(await readJson(response));
}

export async function login(
    client: TestClient,
    handle: string,
): Promise<ReturnType<typeof AuthResponseSchema.parse>> {
    const response = await client.post("/api/v1/auth/login", { handle, password: TEST_PASSWORD });
    if (response.status !== 200) {
        const body = await readJson(response);
        throw new Error(`Login failed: ${JSON.stringify(body)}`);
    }
    return AuthResponseSchema.parse(await readJson(response));
}

export function buildEvidence(
    missionId: string,
    version: number,
    overrides: Partial<EvidenceSubmission> = {},
): EvidenceSubmission {
    return {
        id: crypto.randomUUID(),
        missionId,
        missionVersion: version,
        category: "prediction",
        outcome: "success",
        assistance: "independent",
        independence: 1,
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

export function buildCompletionOperation(
    operationId: string,
    missionId: string,
    version: number,
    attemptId: string,
): SyncOperation {
    return {
        kind: "mission-completion",
        operationId,
        missionId,
        missionVersion: version,
        attemptId,
        independent: true,
        completedAt: new Date().toISOString(),
    };
}

export async function postSync(
    client: TestClient,
    operations: readonly SyncOperation[],
): Promise<SyncResponse> {
    const response = await client.post("/api/v1/sync", { operations });
    if (response.status !== 200) {
        const body = await readJson(response);
        throw new Error(`Sync failed: ${JSON.stringify(body)}`);
    }
    return SyncResponseSchema.parse(await readJson(response));
}
