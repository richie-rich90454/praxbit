import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MasteryEstimator } from "../../packages/domain/src/mastery/index.ts";
import { ReviewScheduler, DEFAULT_REVIEW_POLICY } from "../../packages/domain/src/review/index.ts";
import {
    applyWorldAction,
    createInitialWorld,
} from "../../packages/domain/src/simulation/world.ts";
import type {
    EvidenceCategory,
    EvidenceSubmission,
    WorldActionId,
} from "../../packages/contracts/src/index.ts";
import { categoryEvidence } from "./support/fixtures.ts";

const CATEGORIES: readonly EvidenceCategory[] = [
    "prediction",
    "construction",
    "debugging",
    "testing",
    "explanation",
    "transfer",
    "review",
];
const ASSISTANCE: readonly EvidenceSubmission["assistance"][] = [
    "independent",
    "hint-1",
    "hint-2",
    "hint-3",
    "hint-4",
];
const OUTCOMES: readonly EvidenceSubmission["outcome"][] = ["success", "failure"];

const NOW = new Date("2026-10-28T00:00:00.000Z");

describe("property-based invariants", function propertyInvariants(): void {
    it("keeps mastery scores within zero and one", function masteryRange(): void {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        category: fc.constantFrom(...CATEGORIES),
                        assistance: fc.constantFrom(...ASSISTANCE),
                        outcome: fc.constantFrom(...OUTCOMES),
                        index: fc.integer({ min: 0, max: 27 }),
                    }),
                    { maxLength: 24 },
                ),
                function check(entries): void {
                    const weighted = entries.map(function toWeighted(entry, index): {
                        evidence: EvidenceSubmission;
                        skillWeight: number;
                    } {
                        return {
                            evidence: categoryEvidence(
                                entry.category,
                                entry.assistance,
                                entry.outcome,
                                index,
                            ),
                            skillWeight: 1,
                        };
                    });
                    const snapshot = new MasteryEstimator().estimate(
                        "concept.testing",
                        weighted,
                        NOW,
                    );
                    expect(snapshot.score).toBeGreaterThanOrEqual(0);
                    expect(snapshot.score).toBeLessThanOrEqual(1);
                    expect(snapshot.evidenceCount).toBe(weighted.length);
                },
            ),
            { numRuns: 60 },
        );
    });

    it("moves review intervals by at most one step and never out of bounds", function reviewMonotonicity(): void {
        fc.assert(
            fc.property(fc.array(fc.boolean(), { maxLength: 30 }), function check(successes): void {
                const scheduler = new ReviewScheduler();
                let item = scheduler.create("concept.testing", NOW, "success");
                for (const success of successes) {
                    const previousIndex = item.intervalIndex;
                    item = scheduler.update(item, success ? "success" : "failure", NOW);
                    const change = item.intervalIndex - previousIndex;
                    expect(change).toBeLessThanOrEqual(1);
                    expect(change).toBeGreaterThanOrEqual(-1);
                    expect(item.intervalIndex).toBeGreaterThanOrEqual(0);
                    expect(item.intervalIndex).toBeLessThanOrEqual(
                        DEFAULT_REVIEW_POLICY.maxIntervalIndex,
                    );
                    if (success) {
                        expect(item.intervalIndex).toBeGreaterThanOrEqual(previousIndex);
                    } else {
                        expect(item.intervalIndex).toBeLessThanOrEqual(previousIndex);
                    }
                }
            }),
            { numRuns: 60 },
        );
    });

    it("keeps review due dates ordered as intervals grow on success", function dueDates(): void {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 10 }), function check(successes): void {
                const scheduler = new ReviewScheduler();
                let item = scheduler.create("concept.testing", NOW, "success");
                let previousDue = new Date(item.dueAt).getTime();
                for (let index = 0; index < successes; index += 1) {
                    item = scheduler.update(item, "success", NOW);
                    const due = new Date(item.dueAt).getTime();
                    expect(due).toBeGreaterThanOrEqual(previousDue);
                    previousDue = due;
                }
            }),
            { numRuns: 20 },
        );
    });

    it("increments the world version exactly once per action", function worldVersion(): void {
        const actionIds: readonly WorldActionId[] = [
            "repair-inventory",
            "publish-storefront",
            "restore-deploy",
            "fix-permissions",
            "restart-service",
            "resolve-merge",
            "integrate-systems",
            "resolve-incident",
            "enable-robotics",
            "secure-service",
        ];
        fc.assert(
            fc.property(
                fc.array(fc.constantFrom(...actionIds), { maxLength: 40 }),
                function check(actions): void {
                    let state = createInitialWorld();
                    for (const actionId of actions) {
                        const version = state.version;
                        const result = applyWorldAction(state, { id: actionId });
                        expect(result.state.version).toBe(version + 1);
                        state = result.state;
                    }
                    expect(state.log.length).toBeLessThanOrEqual(100);
                },
            ),
            { numRuns: 40 },
        );
    });

    it("clamps calibrated mastery regardless of hook output", function calibratedRange(): void {
        fc.assert(
            fc.property(
                fc.double({ min: -100, max: 100, noNaN: true }),
                function check(value): void {
                    const estimator = new MasteryEstimator({
                        categoryWeights: {
                            prediction: 0.08,
                            construction: 0.12,
                            debugging: 0.16,
                            testing: 0.13,
                            explanation: 0.1,
                            transfer: 0.2,
                            review: 0.08,
                        },
                        assistanceFactors: {
                            independent: 1,
                            "hint-1": 0.8,
                            "hint-2": 0.6,
                            "hint-3": 0.4,
                            "hint-4": 0.2,
                        },
                        scale: 1.1,
                        failurePenalty: 0.02,
                        recentFailureDays: 30,
                        calibration: {
                            calibrate: function calibrate(): number {
                                return value;
                            },
                        },
                    });
                    const snapshot = estimator.estimate("concept.testing", [], NOW);
                    expect(snapshot.score).toBeGreaterThanOrEqual(0);
                    expect(snapshot.score).toBeLessThanOrEqual(1);
                },
            ),
            { numRuns: 30 },
        );
    });
});
