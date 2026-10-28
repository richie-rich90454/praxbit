import { describe, expect, it } from "vitest";
import { parseBooleanFlag, parseConsent, requireConsent } from "../src/security/consent.ts";

describe("consent parsing", function consentSuite(): void {
    it("accepts an explicit yes", function yes(): void {
        expect(parseConsent("yes")).toBe(true);
        expect(parseConsent(" Y ")).toBe(true);
    });

    it("rejects anything that is not yes", function no(): void {
        expect(parseConsent("no")).toBe(false);
        expect(parseConsent("")).toBe(false);
        expect(parseConsent("yep")).toBe(false);
        expect(parseConsent("sure")).toBe(false);
    });

    it("parses boolean flags conservatively", function flags(): void {
        expect(parseBooleanFlag("true")).toBe(true);
        expect(parseBooleanFlag("1")).toBe(true);
        expect(parseBooleanFlag("yes")).toBe(true);
        expect(parseBooleanFlag(undefined)).toBe(false);
        expect(parseBooleanFlag("maybe")).toBe(false);
    });

    it("bypasses the prompt only when pre-approved", async function preApproved(): Promise<void> {
        await expect(requireConsent("Proceed?", true)).resolves.toBeUndefined();
    });
});
