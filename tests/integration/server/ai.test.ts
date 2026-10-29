import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiHintResponseSchema } from "../../../packages/contracts/src/index.ts";
import { createApplication } from "../../../apps/server/src/app.ts";
import type { ServerConfig } from "../../../apps/server/src/config.ts";
import type { ContentCatalog } from "../../../apps/server/src/content/catalog.ts";
import { loadContent } from "../../../apps/server/src/content/loader.ts";
import { createDatabasePool } from "../../../apps/server/src/db/pool.ts";
import {
    buildTestConfig,
    resetDatabase,
    type TestApplication,
    type TestPool,
} from "./helpers/database.ts";
import { TestClient, expectApiError, field, readJson, register } from "./helpers/client.ts";

const HINT_TEXT = "Trace the loop once.";
const PRIVACY_NOTICE =
    "Privacy: your question and any code were sent to the configured AI provider only to generate this hint.";

interface ProviderRequest {
    readonly method: string;
    readonly path: string;
    readonly authorization: string | undefined;
    readonly body: unknown;
}

interface ProviderMessage {
    readonly role: string;
    readonly content: string;
}

type ProviderResponseMode = "valid" | "malformed";

const providerRequests: ProviderRequest[] = [];
let providerResponseMode: ProviderResponseMode = "valid";

function requireDatabaseUrl(): string {
    const value = process.env["DATABASE_URL"];
    if (value === undefined || value.length === 0) {
        throw new Error(
            "DATABASE_URL is required. Run pnpm --filter @praxbit/server test:integration.",
        );
    }
    return value;
}

function readMessages(body: unknown): readonly ProviderMessage[] {
    const messages = field(body, "messages");
    if (!Array.isArray(messages)) {
        throw new Error("The provider request is missing a messages array.");
    }
    return messages.map(function toMessage(value: unknown): ProviderMessage {
        const role = field(value, "role");
        const content = field(value, "content");
        if (typeof role !== "string" || typeof content !== "string") {
            throw new Error("The provider request contains an invalid message.");
        }
        return { role, content };
    });
}

function findUserMessage(body: unknown): ProviderMessage {
    const messages = readMessages(body);
    const message = messages.find(function isUser(candidate): boolean {
        return candidate.role === "user";
    });
    if (message === undefined) {
        throw new Error("The provider request has no user message.");
    }
    return message;
}

function handleProviderRequest(request: IncomingMessage, response: ServerResponse): void {
    const chunks: Buffer[] = [];
    request.on("data", function collect(chunk: Buffer): void {
        chunks.push(chunk);
    });
    request.on("end", function reply(): void {
        providerRequests.push({
            method: request.method ?? "",
            path: request.url ?? "",
            authorization: request.headers.authorization,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
        });
        response.writeHead(200, { "content-type": "application/json" });
        if (providerResponseMode === "malformed") {
            response.end("{not json");
            return;
        }
        response.end(
            JSON.stringify({
                model: "test-model",
                choices: [{ message: { content: HINT_TEXT } }],
            }),
        );
    });
}

async function listen(server: Server): Promise<void> {
    await new Promise<void>(function start(resolve, reject): void {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", function listening(): void {
            resolve();
        });
    });
}

async function close(server: Server): Promise<void> {
    await new Promise<void>(function stop(resolve, reject): void {
        server.close(function closed(error?: Error): void {
            if (error === undefined) {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

function providerOrigin(server: Server): string {
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("The mock AI provider did not bind to a TCP port.");
    }
    return `http://127.0.0.1:${String(address.port)}`;
}

describe("AI hint gateway", function aiSuite(): void {
    let app: TestApplication;
    let pool: TestPool;
    let content: ContentCatalog;
    let provider: Server;

    async function setAiTutor(userId: string, enabled: boolean): Promise<void> {
        await pool.query("UPDATE user_preferences SET ai_tutor = $2 WHERE user_id = $1", [
            userId,
            enabled,
        ]);
    }

    beforeAll(async function setup(): Promise<void> {
        const databaseUrl = requireDatabaseUrl();
        content = await loadContent();
        provider = createServer(handleProviderRequest);
        await listen(provider);
        const config: ServerConfig = {
            ...buildTestConfig(databaseUrl),
            ai: {
                baseUrl: providerOrigin(provider),
                apiKey: "test-key",
                model: "test-model",
                timeoutMs: 2000,
            },
        };
        pool = createDatabasePool(config);
        await pool.query("SELECT 1");
        app = createApplication({ config, pool, content });
        await resetDatabase({ pool, app, content, config });
    });

    afterAll(async function teardown(): Promise<void> {
        await close(provider);
        await pool.end();
    });

    it("returns a provider hint and sends the learner context upstream", async function testHint(): Promise<void> {
        providerResponseMode = "valid";
        providerRequests.length = 0;
        const client = new TestClient(app);
        const auth = await register(client, "ai_hint_user");
        await setAiTutor(auth.user.id, true);

        const response = await client.post("/api/v1/ai/hints", {
            missionId: "before-code.make-it-respond",
            stepId: "stamp",
            question: "Why do more marks appear when I raise the dial?",
        });
        expect(response.status).toBe(200);
        const body = AiHintResponseSchema.parse(await readJson(response));
        expect(body.text).toContain(HINT_TEXT);
        expect(body.text).toContain(PRIVACY_NOTICE);
        expect(body.model).toBe("test-model");
        expect(body.remaining).toBe(9);

        expect(providerRequests.length).toBe(1);
        const received = providerRequests[0];
        if (received === undefined) {
            throw new Error("The mock provider did not receive a request.");
        }
        expect(received.method).toBe("POST");
        expect(received.path).toBe("/v1/chat/completions");
        expect(received.authorization).toBe("Bearer test-key");
        expect(field(received.body, "model")).toBe("test-model");
        expect(findUserMessage(received.body).content).toContain("Make it respond");
    });

    it("maps an unreadable provider payload to ai_upstream_error", async function testFailure(): Promise<void> {
        providerResponseMode = "malformed";
        const client = new TestClient(app);
        const auth = await register(client, "ai_failure_user");
        await setAiTutor(auth.user.id, true);
        const requestsBefore = providerRequests.length;

        const response = await client.post("/api/v1/ai/hints", {
            missionId: "before-code.make-it-respond",
            stepId: "stamp",
            question: "What should I try next?",
        });
        expect(response.status).toBe(502);
        expectApiError(await readJson(response), "ai_upstream_error");
        expect(providerRequests.length).toBe(requestsBefore + 1);
    });

    it("rejects hints without contacting the provider when AI is disabled", async function testDisabled(): Promise<void> {
        providerResponseMode = "valid";
        const client = new TestClient(app);
        const auth = await register(client, "ai_disabled_user");
        await setAiTutor(auth.user.id, false);
        const requestsBefore = providerRequests.length;

        const response = await client.post("/api/v1/ai/hints", {
            missionId: "before-code.make-it-respond",
            stepId: "stamp",
            question: "Can I still get a hint?",
        });
        expect(response.status).toBe(403);
        expectApiError(await readJson(response), "ai_disabled");
        expect(providerRequests.length).toBe(requestsBefore);
    });
});
