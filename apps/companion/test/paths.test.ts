import path from "node:path";
import { describe, expect, it } from "vitest";
import { PathConfinementError, resolveConfinedPath } from "../src/security/paths.ts";

describe("resolveConfinedPath", function pathSuite(): void {
    const base = path.resolve("sandbox", "exercise");

    it("keeps ordinary relative paths inside the base", function ordinary(): void {
        expect(resolveConfinedPath(base, "src/index.ts")).toBe(path.join(base, "src", "index.ts"));
    });

    it("rejects a parent-directory escape", function parentEscape(): void {
        expect(function attempt(): void {
            resolveConfinedPath(base, "../secret.txt");
        }).toThrow(PathConfinementError);
    });

    it("rejects a nested parent-directory escape", function nestedEscape(): void {
        expect(function attempt(): void {
            resolveConfinedPath(base, "src/../../secret.txt");
        }).toThrow(PathConfinementError);
    });

    it("rejects absolute paths", function absolute(): void {
        expect(function attempt(): void {
            resolveConfinedPath(base, path.resolve(base, "inside.txt"));
        }).toThrow(PathConfinementError);
        expect(function attemptDrive(): void {
            resolveConfinedPath(base, "C:\\Windows\\system.ini");
        }).toThrow(PathConfinementError);
    });

    it("rejects empty paths and null bytes", function invalid(): void {
        expect(function empty(): void {
            resolveConfinedPath(base, "");
        }).toThrow(PathConfinementError);
        expect(function nullByte(): void {
            resolveConfinedPath(base, "a\0b");
        }).toThrow(PathConfinementError);
    });
});
