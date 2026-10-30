import { describe, expect, it } from "vitest";
import { parseDeepLink } from "../../apps/web/src/platform/deep-links.ts";

describe("deep link parsing", function deepLinkSuite(): void {
    it("routes simple destinations", function simpleRoutes(): void {
        expect(parseDeepLink("praxbit://learn")).toBe("/learn");
        expect(parseDeepLink("praxbit://club")).toBe("/club");
        expect(parseDeepLink("praxbit://settings")).toBe("/settings");
        expect(parseDeepLink("praxbit://practice")).toBe("/practice");
        expect(parseDeepLink("https://praxbit.example/learn")).toBe("/learn");
    });

    it("routes mission and project identifiers", function resourceRoutes(): void {
        expect(parseDeepLink("praxbit://missions/before-code.make-it-respond")).toBe(
            "/missions/before-code.make-it-respond",
        );
        expect(parseDeepLink("praxbit://projects/projects.campus-status-board")).toBe(
            "/projects/projects.campus-status-board",
        );
        expect(parseDeepLink("https://praxbit.example/missions/alpha%20beta")).toBe(
            "/missions/alpha%20beta",
        );
    });

    it("ignores query strings, fragments, and trailing slashes", function noisyUrls(): void {
        expect(parseDeepLink("praxbit://missions/alpha/?from=push#top")).toBe("/missions/alpha");
        expect(parseDeepLink("https://praxbit.example/settings/?tab=notifications")).toBe(
            "/settings",
        );
    });

    it("rejects unknown, malformed, and over-nested destinations", function rejected(): void {
        expect(parseDeepLink("praxbit://world")).toBeUndefined();
        expect(parseDeepLink("praxbit://missions")).toBeUndefined();
        expect(parseDeepLink("praxbit://missions/alpha/step")).toBeUndefined();
        expect(parseDeepLink("praxbit://missions/alpha%2Fbeta")).toBeUndefined();
        expect(parseDeepLink("praxbit://missions/%E0%A4%A")).toBeUndefined();
        expect(parseDeepLink("mailto:learner@example.com")).toBeUndefined();
        expect(parseDeepLink("not a url")).toBeUndefined();
    });
});
