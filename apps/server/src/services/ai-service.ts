import type { AiHintRequest, AiHintResponse } from "@praxbit/contracts";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError } from "../http/app-error.ts";
import type { RateLimiter } from "../http/rate-limit.ts";
import type { AiConfiguration } from "../config.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import type { UserRepository } from "../repositories/user-repository.ts";

const ChatCompletionSchema = z.object({
    model: z.string().optional(),
    choices: z
        .array(
            z.object({
                message: z.object({
                    content: z.string(),
                }),
            }),
        )
        .min(1),
});

const SYSTEM_PROMPT =
    "You are a patient computer science tutor inside a learning game. " +
    "Give a short, specific hint that helps the learner reason about the next step. " +
    "Do not provide a complete final answer or a full solution. " +
    "Do not claim certainty. Keep the answer under 1200 characters.";

const PRIVACY_NOTICE =
    "\n\nPrivacy: your question and any code were sent to the configured AI provider only to generate this hint.";

function providerUrl(baseUrl: string): string {
    const base = baseUrl.replace(/\/+$/, "");
    if (base.endsWith("/chat/completions")) {
        return base;
    }
    if (base.endsWith("/v1")) {
        return `${base}/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
}

export class AiService {
    private readonly pool: Pool;
    private readonly ai: AiConfiguration | undefined;
    private readonly content: ContentCatalog;
    private readonly users: UserRepository;
    private readonly limiter: RateLimiter;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly ai: AiConfiguration | undefined;
        readonly content: ContentCatalog;
        readonly users: UserRepository;
        readonly limiter: RateLimiter;
    }) {
        this.pool = dependencies.pool;
        this.ai = dependencies.ai;
        this.content = dependencies.content;
        this.users = dependencies.users;
        this.limiter = dependencies.limiter;
    }

    public async requestHint(input: {
        readonly userId: string;
        readonly request: AiHintRequest;
    }): Promise<AiHintResponse> {
        if (this.ai === undefined) {
            throw new AppError(503, "ai_unavailable", "AI hints are not enabled on this server.");
        }
        const mission = this.content.getMission(input.request.missionId);
        if (mission === undefined) {
            throw new AppError(404, "mission_not_found", "Unknown mission.");
        }
        const step = mission.steps.find(function matches(candidate): boolean {
            return candidate.id === input.request.stepId;
        });
        if (step === undefined) {
            throw new AppError(404, "step_not_found", "Unknown mission step.");
        }
        const preferences = await this.users.getPreferences(this.pool, input.userId);
        if (!preferences.aiTutor) {
            throw new AppError(
                403,
                "ai_disabled",
                "AI tutoring is turned off in your preferences.",
            );
        }

        const decision = this.limiter.consume(input.userId);
        if (!decision.allowed) {
            throw new AppError(
                429,
                "ai_quota_exceeded",
                "The hourly AI hint limit has been reached.",
                {
                    retryAfterSeconds: decision.retryAfterSeconds,
                },
            );
        }

        const learnerContent = [
            `Mission: ${mission.title}`,
            `Step: ${step.title}`,
            `Step prompt: ${step.prompt}`,
            input.request.code === undefined ? "" : `Learner code:\n${input.request.code}`,
            `Learner question: ${input.request.question}`,
        ]
            .filter(function present(value: string): boolean {
                return value.length > 0;
            })
            .join("\n\n");

        let response: Response;
        try {
            response = await fetch(providerUrl(this.ai.baseUrl), {
                method: "POST",
                headers: {
                    authorization: `Bearer ${this.ai.apiKey}`,
                    "content-type": "application/json",
                    accept: "application/json",
                },
                body: JSON.stringify({
                    model: this.ai.model,
                    temperature: 0.2,
                    max_tokens: 500,
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: learnerContent },
                    ],
                }),
                signal: AbortSignal.timeout(this.ai.timeoutMs),
            });
        } catch (error) {
            const name = error instanceof Error ? error.name : "";
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError(504, "ai_timeout", "The AI provider did not answer in time.");
            }
            throw new AppError(502, "ai_upstream_error", "The AI provider is unavailable.");
        }

        if (!response.ok) {
            throw new AppError(502, "ai_upstream_error", "The AI provider rejected the request.");
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new AppError(
                502,
                "ai_upstream_error",
                "The AI provider returned an unreadable response.",
            );
        }
        const parsed = ChatCompletionSchema.safeParse(payload);
        if (!parsed.success) {
            throw new AppError(
                502,
                "ai_upstream_error",
                "The AI provider returned an unreadable response.",
            );
        }
        const content = parsed.data.choices[0]?.message.content.trim() ?? "";
        if (content.length === 0) {
            throw new AppError(502, "ai_empty_response", "The AI provider returned an empty hint.");
        }

        const limit = 4000 - PRIVACY_NOTICE.length;
        const text = `${content.slice(0, limit)}${PRIVACY_NOTICE}`;
        return {
            text,
            model: parsed.data.model ?? this.ai.model,
            remaining: decision.remaining,
        };
    }
}
