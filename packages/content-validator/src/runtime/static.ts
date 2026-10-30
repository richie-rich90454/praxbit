import type { CodeTest } from "@praxbit/contracts";
import type { TestOutcome } from "../types.ts";
import { normalizedJson } from "./javascript.ts";

export type StaticTest = Extract<CodeTest, { kind: "static" }>;
export type RegexTest = Extract<CodeTest, { kind: "regex" }>;
export type JsonTest = Extract<CodeTest, { kind: "json" }>;

export function pathValue(root: unknown, path: readonly (string | number)[]): unknown {
    let cursor = root;
    for (const segment of path) {
        if (cursor === null || typeof cursor !== "object") {
            return undefined;
        }
        if (Array.isArray(cursor)) {
            if (typeof segment !== "number") {
                return undefined;
            }
            cursor = cursor[segment];
        } else {
            if (typeof segment !== "string") {
                return undefined;
            }
            cursor = (cursor as Record<string, unknown>)[segment];
        }
    }
    return cursor;
}

export function runStaticTests(
    files: Readonly<Record<string, string>>,
    tests: readonly CodeTest[],
): TestOutcome[] {
    const outcomes: TestOutcome[] = [];

    for (const test of tests) {
        if (test.kind === "static") {
            const content = files[test.file];
            if (content === undefined) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: `File not found: ${test.file}`,
                });
                continue;
            }
            const missing = test.includes.filter(function absent(fragment: string): boolean {
                return !content.includes(fragment);
            });
            const present = (test.excludes ?? []).filter(function included(
                fragment: string,
            ): boolean {
                return content.includes(fragment);
            });
            const passed = missing.length === 0 && present.length === 0;
            outcomes.push({
                description: test.description,
                passed,
                deferred: false,
                ...(passed
                    ? {}
                    : {
                          error: `Missing required text: ${missing.join(", ") || "(none)"}. Forbidden text present: ${present.join(", ") || "(none)"}.`,
                      }),
            });
        }

        if (test.kind === "regex") {
            const content = files[test.file];
            if (content === undefined) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: `File not found: ${test.file}`,
                });
                continue;
            }
            try {
                const pattern = new RegExp(test.pattern, test.flags);
                const matched = pattern.test(content);
                const passed = test.invert === true ? !matched : matched;
                outcomes.push({
                    description: test.description,
                    passed,
                    deferred: false,
                    ...(passed
                        ? {}
                        : {
                              error:
                                  test.invert === true
                                      ? `The forbidden pattern was found in ${test.file}.`
                                      : `The pattern was not found in ${test.file}.`,
                          }),
                });
            } catch (error) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }

        if (test.kind === "json") {
            const content = files[test.file];
            if (content === undefined) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: `File not found: ${test.file}`,
                });
                continue;
            }
            try {
                const parsed: unknown = JSON.parse(content);
                const actualValue = pathValue(parsed, test.path);
                const actual = normalizedJson(actualValue);
                const expected = normalizedJson(test.expected);
                const passed = actual === expected;
                outcomes.push({
                    description: test.description,
                    passed,
                    deferred: false,
                    actual,
                    ...(passed ? {} : { error: `Expected ${expected}, received ${actual}.` }),
                });
            } catch (error) {
                outcomes.push({
                    description: test.description,
                    passed: false,
                    deferred: false,
                    error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
    }

    return outcomes;
}
