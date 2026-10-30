import { afterEach, describe, expect, it } from "vitest";
import { ApiClient } from "../../packages/client/src/api/index.ts";

interface RecordedCall {
    readonly url: string;
    readonly init: RequestInit;
}

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function installFetch(responseBody: unknown, calls: RecordedCall[]): void {
    globalThis.fetch = function fakeFetch(input, init): Promise<Response> {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, init: init ?? {} });
        if (url.endsWith("/auth/csrf")) {
            return Promise.resolve(jsonResponse({ csrfToken: "csrf-token" }));
        }
        if (url.endsWith("/auth/login")) {
            return Promise.resolve(jsonResponse(responseBody));
        }
        return Promise.resolve(new Response(null, { status: 204 }));
    };
}

function authBody(nativeToken?: string): unknown {
    return {
        user: {
            id: crypto.randomUUID(),
            handle: "learner",
            displayName: "Learner",
            role: "member",
            createdAt: "2026-10-30T12:00:00.000Z",
        },
        preferences: {
            interests: ["everything"],
            textScale: 1,
            motion: "system",
            sound: false,
            challenge: "standard",
            reminders: { enabled: false, quietStart: "22:00", quietEnd: "08:00" },
            aiTutor: false,
        },
        ...(nativeToken === undefined ? {} : { nativeToken }),
    };
}

function headersOf(call: RecordedCall | undefined): Headers {
    return new Headers(call?.init.headers);
}

afterEach(function restoreFetch(): void {
    globalThis.fetch = originalFetch;
});

describe("native bearer token headers", function nativeTokenSuite(): void {
    it("requests native login, persists the token, and uses bearer headers without cookies", async function nativeLogin(): Promise<void> {
        const calls: RecordedCall[] = [];
        installFetch(authBody("token-123"), calls);
        const tokens: (string | undefined)[] = [];
        const api = new ApiClient({
            baseUrl: "/api/v1",
            native: true,
            onNativeToken: function capture(token): void {
                tokens.push(token);
            },
        });

        await api.login({ handle: "learner", password: "correct horse battery" });
        expect(headersOf(calls[1]).get("x-praxbit-client")).toBe("native");
        expect(headersOf(calls[1]).get("authorization")).toBeNull();
        expect(tokens).toEqual(["token-123"]);

        await api.logout();
        const logout = calls[2];
        expect(headersOf(logout).get("authorization")).toBe("Bearer token-123");
        expect(headersOf(logout).get("x-praxbit-client")).toBe("native");
        expect(headersOf(logout).get("x-csrf-token")).toBeNull();
        expect(logout?.init.credentials).toBe("omit");
        expect(tokens).toEqual(["token-123", undefined]);
    });

    it("never identifies a cookie-session web client as native", async function webLogin(): Promise<void> {
        const calls: RecordedCall[] = [];
        installFetch(authBody(), calls);
        const api = new ApiClient({ baseUrl: "/api/v1", native: false });

        await api.login({ handle: "learner", password: "correct horse battery" });
        expect(headersOf(calls[1]).get("x-praxbit-client")).toBeNull();
        expect(headersOf(calls[1]).get("x-csrf-token")).toBe("csrf-token");
        expect(calls[1]?.init.credentials).toBe("include");
    });
});
