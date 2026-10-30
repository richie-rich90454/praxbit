import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    assertProductionWebBuild,
    isWebBuildPresent,
    loadConfiguration,
} from "../../apps/server/src/config.ts";
import { clientAddress } from "../../apps/server/src/http/middleware.ts";

const DATABASE_URL = "postgres://praxbit:praxbit@127.0.0.1:5432/praxbit";

type ClientContext = Parameters<typeof clientAddress>[0];

function baseEnvironment(): NodeJS.ProcessEnv {
    return { DATABASE_URL };
}

function socketContext(remoteAddress: string | undefined, forwardedFor?: string): ClientContext {
    return {
        env: {
            incoming: {
                socket: { remoteAddress, remotePort: 43120, remoteFamily: "IPv4" },
            },
        },
        req: {
            header: function header(name: string): string | undefined {
                return name === "x-forwarded-for" ? forwardedFor : undefined;
            },
        },
    } as unknown as ClientContext;
}

describe("server configuration", function configurationSuite(): void {
    const temporaryDirectories: string[] = [];

    afterEach(async function cleanup(): Promise<void> {
        for (const directory of temporaryDirectories.splice(0)) {
            await rm(directory, { recursive: true, force: true });
        }
    });

    async function temporaryDirectory(): Promise<string> {
        const directory = await mkdtemp(join(tmpdir(), "praxbit-config-"));
        temporaryDirectories.push(directory);
        return directory;
    }

    it("leaves AI unconfigured unless every provider setting is present", function testAiConfiguration(): void {
        expect(loadConfiguration(baseEnvironment()).ai).toBeUndefined();
        expect(
            loadConfiguration({ ...baseEnvironment(), AI_BASE_URL: "https://ai.example" }).ai,
        ).toBeUndefined();
        expect(
            loadConfiguration({
                ...baseEnvironment(),
                AI_BASE_URL: "https://ai.example",
                AI_API_KEY: "secret",
            }).ai,
        ).toBeUndefined();

        const configured = loadConfiguration({
            ...baseEnvironment(),
            AI_BASE_URL: "https://ai.example",
            AI_API_KEY: "secret",
            AI_MODEL: "tutor-model",
        });
        expect(configured.ai?.baseUrl).toBe("https://ai.example");
        expect(configured.ai?.apiKey).toBe("secret");
        expect(configured.ai?.model).toBe("tutor-model");
        expect(configured.ai?.timeoutMs).toBe(12000);
    });

    it("provides a dedicated event submission rate limit", function testRateLimits(): void {
        const config = loadConfiguration(baseEnvironment());
        expect(config.rateLimits.eventSubmissionsPerHour).toBeGreaterThan(0);
        expect(config.rateLimits.aiHintsPerHour).toBeGreaterThan(0);
    });

    it("accepts Capacitor origins for native API clients", function testNativeCors(): void {
        const config = loadConfiguration({
            ...baseEnvironment(),
            CORS_ORIGINS: "https://localhost,capacitor://localhost",
        });
        expect(config.corsOrigins).toEqual(["https://localhost", "capacitor://localhost"]);
        expect(function invalidScheme(): void {
            loadConfiguration({ ...baseEnvironment(), CORS_ORIGINS: "file://localhost" });
        }).toThrow(/capacitor:\/\//);
    });

    it("requires the web build only in production", async function testWebBuildRequirement(): Promise<void> {
        const directory = await temporaryDirectory();
        expect(isWebBuildPresent(directory)).toBe(false);
        expect(isWebBuildPresent(undefined)).toBe(false);
        expect(function developmentBuild(): void {
            assertProductionWebBuild(directory, "development");
        }).not.toThrow();
        expect(function productionBuild(): void {
            assertProductionWebBuild(directory, "production");
        }).toThrow(/web build is missing/);

        await writeFile(join(directory, "index.html"), "<!doctype html>", "utf8");
        expect(isWebBuildPresent(directory)).toBe(true);
        expect(function productionBuildPresent(): void {
            assertProductionWebBuild(directory, "production");
        }).not.toThrow();
    });
});

describe("client address derivation", function clientAddressSuite(): void {
    it("prefers the socket address when the proxy is not trusted", function testSocketAddress(): void {
        expect(clientAddress(socketContext("::ffff:203.0.113.9", "198.51.100.1"), false)).toBe(
            "203.0.113.9",
        );
        expect(clientAddress(socketContext("10.0.0.4", "198.51.100.1"), false)).toBe("10.0.0.4");
    });

    it("uses the first forwarded hop only when the proxy is trusted", function testForwardedAddress(): void {
        expect(clientAddress(socketContext("10.0.0.4", "198.51.100.7, 10.0.0.2"), true)).toBe(
            "198.51.100.7",
        );
        expect(clientAddress(socketContext("10.0.0.4", "198.51.100.7"), false)).toBe("10.0.0.4");
    });

    it("hashes forwarded headers into stable, distinct buckets without a socket", function testHashedFallback(): void {
        const first = clientAddress(socketContext(undefined, "203.0.113.9"), false);
        const repeated = clientAddress(socketContext(undefined, "203.0.113.9"), false);
        const other = clientAddress(socketContext(undefined, "203.0.113.10"), false);
        expect(first).toMatch(/^forwarded:[a-f0-9]{32}$/);
        expect(repeated).toBe(first);
        expect(other).not.toBe(first);
        expect(clientAddress(socketContext(undefined), false)).toBe("unknown");
    });
});
