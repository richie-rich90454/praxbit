import type { CodeTest } from "@praxbit/contracts";
import { runAstTests } from "@praxbit/execution/ast";
import type { TestOutcome } from "../types.ts";

export type AstTest = Extract<CodeTest, { kind: "ast" }>;

export async function runAstTestGroup(
    files: Readonly<Record<string, string>>,
    tests: readonly AstTest[],
): Promise<TestOutcome[]> {
    const outcomes = await runAstTests(files, tests);
    return outcomes.map(function toOutcome(outcome): TestOutcome {
        return Object.assign(
            { description: outcome.description, passed: outcome.passed, deferred: false },
            outcome.actual === undefined ? {} : { actual: outcome.actual },
            outcome.error === undefined ? {} : { error: outcome.error },
        );
    });
}
