import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "../../apps/web/src/platform/api-base.ts";

describe("API base resolution", function apiBaseSuite(): void {
    it("keeps the web client same-origin", function webBase(): void {
        expect(resolveApiBaseUrl(false)).toBe("/api/v1");
        expect(resolveApiBaseUrl(false, "  ")).toBe("/api/v1");
    });

    it("uses an explicit override and trims trailing slashes", function override(): void {
        expect(resolveApiBaseUrl(false, "https://example.test/api/v1/")).toBe(
            "https://example.test/api/v1",
        );
        expect(resolveApiBaseUrl(true, "https://staging.test/api/v1")).toBe(
            "https://staging.test/api/v1",
        );
    });

    it("points a native shell at the production API when unconfigured", function nativeFallback(): void {
        expect(resolveApiBaseUrl(true)).toBe("https://praxbit.bisz.dev/api/v1");
    });
});
