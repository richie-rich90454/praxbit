import type {
    AiHintRequest,
    AiHintResponse,
    AttemptStartRequest,
    AttemptStartResponse,
    AuthResponse,
    Capabilities,
    Club,
    ClubDetail,
    ClubInvite,
    ClubInvitesResponse,
    CreateClubInviteRequest,
    CreateClubRequest,
    EventSubmissionRequest,
    EventSubmissionResponse,
    EvidenceResult,
    ExportBundle,
    JoinClubRequest,
    LoginRequest,
    MeResponse,
    Preferences,
    ProjectDetail,
    ProjectRevisionRequest,
    RegisterRequest,
    ReportClubRequest,
    ReportClubResponse,
    SyncRequest,
    SyncResponse,
    WorldActionRequest,
    WorldActionResponse,
    WorldResponse,
} from "@praxbit/contracts";
import {
    AiHintResponseSchema,
    AttemptStartResponseSchema,
    AuthResponseSchema,
    CapabilitiesSchema,
    ClubDetailSchema,
    ClubInviteSchema,
    ClubInvitesResponseSchema,
    ClubSchema,
    EventSubmissionResponseSchema,
    EvidenceResultSchema,
    ExportBundleSchema,
    MeResponseSchema,
    ProjectDetailSchema,
    ReportClubResponseSchema,
    SyncResponseSchema,
    WorldActionResponseSchema,
    WorldResponseSchema,
} from "@praxbit/contracts";

export class ApiError extends Error {
    public readonly code: string;
    public readonly status: number;
    public readonly requestId: string | undefined;
    public readonly details: unknown;

    public constructor(
        code: string,
        message: string,
        status: number,
        requestId?: string,
        details?: unknown,
    ) {
        super(message);
        this.name = "ApiError";
        this.code = code;
        this.status = status;
        this.requestId = requestId;
        this.details = details;
    }
}

export interface ApiClientOptions {
    readonly baseUrl?: string;
    readonly nativeToken?: string;
    readonly native?: boolean;
    readonly onNativeToken?: (token: string | undefined) => void;
}

const NATIVE_CLIENT_HEADER = "x-praxbit-client";
const NATIVE_AUTH_PATHS = new Set(["/auth/login", "/auth/register"]);

export class ApiClient {
    private readonly baseUrl: string;
    private readonly native: boolean;
    private readonly onNativeToken: ((token: string | undefined) => void) | undefined;
    private nativeToken: string | undefined;
    private csrfToken: string | undefined;

    public constructor(options: ApiClientOptions = {}) {
        this.baseUrl = options.baseUrl ?? "/api/v1";
        this.native = options.native === true;
        this.onNativeToken = options.onNativeToken;
        this.nativeToken = options.nativeToken;
    }

    public setNativeToken(token: string | undefined): void {
        this.nativeToken = token;
    }

    public async ensureCsrf(): Promise<string> {
        if (this.csrfToken !== undefined) {
            return this.csrfToken;
        }
        const response = await fetch(`${this.baseUrl}/auth/csrf`, {
            credentials: "include",
            headers: { accept: "application/json" },
        });
        if (!response.ok) {
            throw new ApiError(
                "csrf_unavailable",
                "Could not establish a request token.",
                response.status,
            );
        }
        const body = (await response.json()) as { csrfToken?: string };
        if (typeof body.csrfToken !== "string") {
            throw new ApiError(
                "csrf_invalid",
                "The server returned an invalid request token.",
                response.status,
            );
        }
        this.csrfToken = body.csrfToken;
        return body.csrfToken;
    }

    public async me(): Promise<MeResponse> {
        return MeResponseSchema.parse(
            await this.request("GET", "/me", undefined, false, MeResponseSchema),
        );
    }

    public async requestCapabilities(): Promise<Capabilities> {
        return CapabilitiesSchema.parse(
            await this.request("GET", "/capabilities", undefined, false, CapabilitiesSchema),
        );
    }

    public async register(input: RegisterRequest): Promise<AuthResponse> {
        const response = AuthResponseSchema.parse(
            await this.request("POST", "/auth/register", input, true, AuthResponseSchema),
        );
        if (response.nativeToken !== undefined) {
            this.nativeToken = response.nativeToken;
            this.onNativeToken?.(response.nativeToken);
        }
        return response;
    }

    public async login(input: LoginRequest): Promise<AuthResponse> {
        const response = AuthResponseSchema.parse(
            await this.request("POST", "/auth/login", input, true, AuthResponseSchema),
        );
        if (response.nativeToken !== undefined) {
            this.nativeToken = response.nativeToken;
            this.onNativeToken?.(response.nativeToken);
        }
        return response;
    }

    public async logout(): Promise<void> {
        await this.request("POST", "/auth/logout", {}, true);
        this.nativeToken = undefined;
        this.onNativeToken?.(undefined);
    }

    public async revokeSessions(): Promise<void> {
        await this.request("DELETE", "/auth/sessions", undefined, true);
    }

    public async exportData(): Promise<ExportBundle> {
        return ExportBundleSchema.parse(
            await this.request("POST", "/me/export", {}, true, ExportBundleSchema),
        );
    }

    public async deleteAccount(): Promise<void> {
        await this.request("DELETE", "/me", undefined, true);
        this.nativeToken = undefined;
        this.onNativeToken?.(undefined);
    }

    public async startAttempt(input: AttemptStartRequest): Promise<AttemptStartResponse> {
        return AttemptStartResponseSchema.parse(
            await this.request("POST", "/attempts", input, true, AttemptStartResponseSchema),
        );
    }

    public async submitEvidence(evidence: unknown): Promise<EvidenceResult> {
        return EvidenceResultSchema.parse(
            await this.request("POST", "/me/evidence", { evidence }, true, EvidenceResultSchema),
        );
    }

    public async sync(input: SyncRequest): Promise<SyncResponse> {
        return SyncResponseSchema.parse(
            await this.request("POST", "/sync", input, true, SyncResponseSchema),
        );
    }

    public async savePreferences(preferences: Preferences): Promise<SyncResponse> {
        return SyncResponseSchema.parse(
            await this.request(
                "POST",
                "/sync",
                {
                    operations: [
                        {
                            kind: "preferences",
                            operationId: crypto.randomUUID(),
                            preferences,
                        },
                    ],
                },
                true,
                SyncResponseSchema,
            ),
        );
    }

    public async getWorld(): Promise<WorldResponse> {
        return WorldResponseSchema.parse(
            await this.request("GET", "/worlds/campus", undefined, false, WorldResponseSchema),
        );
    }

    public async actOnWorld(input: WorldActionRequest): Promise<WorldActionResponse> {
        return WorldActionResponseSchema.parse(
            await this.request(
                "POST",
                "/worlds/campus/actions",
                input,
                true,
                WorldActionResponseSchema,
            ),
        );
    }

    public async listProjects(): Promise<readonly ProjectDetail[]> {
        const body = await this.request("GET", "/projects", undefined, false);
        const parsed = ProjectDetailSchema.array().safeParse(body);
        if (!parsed.success) {
            throw new ApiError(
                "invalid_response",
                "The project list response did not match the contract.",
                200,
            );
        }
        return parsed.data;
    }

    public async getProject(projectId: string): Promise<ProjectDetail> {
        return ProjectDetailSchema.parse(
            await this.request(
                "GET",
                `/projects/${encodeURIComponent(projectId)}`,
                undefined,
                false,
                ProjectDetailSchema,
            ),
        );
    }

    public async saveRevision(
        projectId: string,
        input: ProjectRevisionRequest,
    ): Promise<ProjectDetail> {
        return ProjectDetailSchema.parse(
            await this.request(
                "POST",
                `/projects/${encodeURIComponent(projectId)}/revisions`,
                input,
                true,
                ProjectDetailSchema,
            ),
        );
    }

    public async listClubs(): Promise<readonly Club[]> {
        const body = await this.request("GET", "/clubs", undefined, false);
        const parsed = ClubSchema.array().safeParse(body);
        if (!parsed.success) {
            throw new ApiError(
                "invalid_response",
                "The club list response did not match the contract.",
                200,
            );
        }
        return parsed.data;
    }

    public async getClub(clubId: string): Promise<ClubDetail> {
        return ClubDetailSchema.parse(
            await this.request(
                "GET",
                `/clubs/${encodeURIComponent(clubId)}`,
                undefined,
                false,
                ClubDetailSchema,
            ),
        );
    }

    public async createClub(input: CreateClubRequest): Promise<Club> {
        return ClubSchema.parse(await this.request("POST", "/clubs", input, true, ClubSchema));
    }

    public async joinClub(clubId: string, input: JoinClubRequest): Promise<Club> {
        return ClubSchema.parse(
            await this.request(
                "POST",
                `/clubs/${encodeURIComponent(clubId)}/join`,
                input,
                true,
                ClubSchema,
            ),
        );
    }

    public async joinClubByCode(input: JoinClubRequest): Promise<Club> {
        return ClubSchema.parse(await this.request("POST", "/clubs/join", input, true, ClubSchema));
    }

    public async updateMemberRole(
        clubId: string,
        handle: string,
        role: "owner" | "member",
    ): Promise<void> {
        await this.request(
            "POST",
            `/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(handle)}/role`,
            { role },
            true,
        );
    }

    public async removeMember(clubId: string, handle: string): Promise<void> {
        await this.request(
            "DELETE",
            `/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(handle)}`,
            undefined,
            true,
        );
    }

    public async listInvites(clubId: string): Promise<ClubInvitesResponse> {
        return ClubInvitesResponseSchema.parse(
            await this.request(
                "GET",
                `/clubs/${encodeURIComponent(clubId)}/invites`,
                undefined,
                false,
                ClubInvitesResponseSchema,
            ),
        );
    }

    public async createInvite(clubId: string, input: CreateClubInviteRequest): Promise<ClubInvite> {
        return ClubInviteSchema.parse(
            await this.request(
                "POST",
                `/clubs/${encodeURIComponent(clubId)}/invites`,
                input,
                true,
                ClubInviteSchema,
            ),
        );
    }

    public async revokeInvite(clubId: string, inviteId: string): Promise<void> {
        await this.request(
            "POST",
            `/clubs/${encodeURIComponent(clubId)}/invites/${encodeURIComponent(inviteId)}/revoke`,
            {},
            true,
        );
    }

    public async reportClub(clubId: string, input: ReportClubRequest): Promise<ReportClubResponse> {
        return ReportClubResponseSchema.parse(
            await this.request(
                "POST",
                `/clubs/${encodeURIComponent(clubId)}/reports`,
                input,
                true,
                ReportClubResponseSchema,
            ),
        );
    }

    public async submitEvent(
        eventId: string,
        input: EventSubmissionRequest,
    ): Promise<EventSubmissionResponse> {
        return EventSubmissionResponseSchema.parse(
            await this.request(
                "POST",
                `/events/${encodeURIComponent(eventId)}/submissions`,
                input,
                true,
                EventSubmissionResponseSchema,
            ),
        );
    }

    public async requestAiHint(input: AiHintRequest): Promise<AiHintResponse> {
        return AiHintResponseSchema.parse(
            await this.request("POST", "/ai/hints", input, true, AiHintResponseSchema),
        );
    }

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        mutation = false,
        _schema?: { parse(value: unknown): T },
    ): Promise<T> {
        const headers: Record<string, string> = { accept: "application/json" };
        if (body !== undefined) {
            headers["content-type"] = "application/json";
        }
        const nativeToken = this.nativeToken;
        const bearer = nativeToken !== undefined;
        if (nativeToken !== undefined) {
            headers["authorization"] = `Bearer ${nativeToken}`;
        }
        // Native identity is only asserted for the bearer flow: token establishment
        // and token-authenticated calls. Cookie sessions keep the web defaults.
        const nativeAuth = this.native && NATIVE_AUTH_PATHS.has(path);
        if (this.native && (bearer || nativeAuth)) {
            headers[NATIVE_CLIENT_HEADER] = "native";
        }
        // Native token establishment is header-authenticated, so it neither
        // needs a CSRF cookie nor sends one from the WebView.
        if (!bearer && mutation && !nativeAuth) {
            headers["x-csrf-token"] = await this.ensureCsrf();
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            credentials: bearer || nativeAuth ? "omit" : "include",
            headers,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });

        if (response.status === 204) {
            return undefined as T;
        }

        const contentType = response.headers.get("content-type") ?? "";
        const payload: unknown = contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            if (typeof payload === "object" && payload !== null && "error" in payload) {
                const error = (
                    payload as {
                        error: {
                            code?: unknown;
                            message?: unknown;
                            requestId?: unknown;
                            details?: unknown;
                        };
                    }
                ).error;
                throw new ApiError(
                    typeof error.code === "string" ? error.code : "http_error",
                    typeof error.message === "string" ? error.message : "Request failed.",
                    response.status,
                    typeof error.requestId === "string" ? error.requestId : undefined,
                    error.details,
                );
            }
            throw new ApiError("http_error", "Request failed.", response.status);
        }

        return payload as T;
    }
}
