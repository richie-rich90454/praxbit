import { describe, expect, it } from "vitest";
import {
    DEFAULT_ASSISTANCE_FACTORS,
    DEFAULT_CATEGORY_WEIGHTS,
    MasteryEstimator,
    averageMastery,
    masteryLabel,
} from "../../packages/domain/src/mastery/index.ts";
import type { WeightedEvidence, CalibrationHook } from "../../packages/domain/src/mastery/index.ts";
import { categoryEvidence, makeEvidence } from "./support/fixtures.ts";

const NOW = new Date("2026-10-28T00:00:00.000Z");

function weighted(evidence: ReturnType<typeof makeEvidence>, weight = 1): WeightedEvidence {
    return { evidence, skillWeight: weight };
}

describe("MasteryEstimator", function masteryEstimator(): void {
    it("returns zero for no evidence", function empty(): void {
        const estimator = new MasteryEstimator();
        const snapshot = estimator.estimate("concept.testing", [], NOW);
        expect(snapshot.score).toBe(0);
        expect(snapshot.evidenceCount).toBe(0);
    });

    it("rewards transfer evidence more than prediction evidence", function categoryWeights(): void {
        const estimator = new MasteryEstimator();
        const transfer = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ category: "transfer" }))],
            NOW,
        );
        const prediction = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ category: "prediction" }))],
            NOW,
        );
        expect(transfer.score).toBeGreaterThan(prediction.score);
    });

    it("reduces the contribution of assisted success", function assistance(): void {
        const estimator = new MasteryEstimator();
        const independent = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ assistance: "independent" }))],
            NOW,
        );
        const assisted = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ assistance: "hint-4" }))],
            NOW,
        );
        expect(independent.score).toBeGreaterThan(assisted.score);
        expect(DEFAULT_ASSISTANCE_FACTORS["hint-4"]).toBeLessThan(
            DEFAULT_ASSISTANCE_FACTORS.independent,
        );
    });

    it("uses the smaller of assistance factor and reported independence", function independence(): void {
        const estimator = new MasteryEstimator();
        const honest = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ independence: 0.5 }))],
            NOW,
        );
        const full = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ independence: 1 }))],
            NOW,
        );
        expect(full.score).toBeGreaterThan(honest.score);
    });

    it("counts recent failures separately from older failures", function failures(): void {
        const estimator = new MasteryEstimator();
        const recent = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ outcome: "failure", createdAt: "2026-10-20T00:00:00.000Z" }))],
            NOW,
        );
        const old = estimator.estimate(
            "concept.testing",
            [weighted(makeEvidence({ outcome: "failure", createdAt: "2025-01-01T00:00:00.000Z" }))],
            NOW,
        );
        expect(recent.recentFailures).toBe(1);
        expect(old.recentFailures).toBe(0);
    });

    it("applies a calibration hook and clamps the result", function calibration(): void {
        const hook: CalibrationHook = {
            calibrate: function calibrate(): number {
                return 1.7;
            },
        };
        const estimator = new MasteryEstimator({
            categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
            assistanceFactors: DEFAULT_ASSISTANCE_FACTORS,
            scale: 1.1,
            failurePenalty: 0.02,
            recentFailureDays: 30,
            calibration: hook,
        });
        const snapshot = estimator.estimate("concept.testing", [], NOW);
        expect(snapshot.score).toBe(1);
    });

    it("keeps weighted skill contributions proportional", function skillWeight(): void {
        const estimator = new MasteryEstimator();
        const full = estimator.estimate("concept.testing", [weighted(makeEvidence(), 1)], NOW);
        const partial = estimator.estimate("concept.testing", [weighted(makeEvidence(), 0.5)], NOW);
        expect(full.score).toBeGreaterThan(partial.score);
    });

    it("explains the evidence count and outcomes", function explain(): void {
        const estimator = new MasteryEstimator();
        const evidence: WeightedEvidence[] = [
            weighted(categoryEvidence("construction", "independent", "success", 1)),
            weighted(categoryEvidence("debugging", "hint-1", "success", 2)),
        ];
        const explanation = estimator.explain("concept.testing", evidence, NOW);
        expect(explanation.evidenceCount).toBe(2);
        expect(explanation.independentSuccesses).toBe(1);
        expect(explanation.assistedSuccesses).toBe(1);
        expect(explanation.summary).toContain("2 pieces of evidence");
    });
});

describe("Mastery helpers", function masteryHelpers(): void {
    it("labels score bands", function labels(): void {
        expect(masteryLabel(0.9)).toBe("secure");
        expect(masteryLabel(0.75)).toBe("confident");
        expect(masteryLabel(0.5)).toBe("developing");
        expect(masteryLabel(0.1)).toBe("learning");
    });

    it("averages available scores and treats missing skills as zero", function average(): void {
        expect(averageMastery(["a", "b"], { a: 1, b: 0.5 })).toBe(0.75);
        expect(averageMastery(["a", "missing"], { a: 1 })).toBe(0.5);
        expect(averageMastery([], {})).toBe(0);
    });
});
