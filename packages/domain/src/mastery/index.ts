import type { EvidenceCategory, EvidenceSubmission, SkillMastery } from "@praxbit/contracts";

export interface WeightedEvidence {
    readonly evidence: EvidenceSubmission;
    readonly skillWeight: number;
}

export interface MasteryConfig {
    readonly categoryWeights: Readonly<Record<EvidenceCategory, number>>;
    readonly assistanceFactors: Readonly<Record<EvidenceSubmission["assistance"], number>>;
    readonly scale: number;
    readonly failurePenalty: number;
    readonly recentFailureDays: number;
    readonly calibration?: CalibrationHook;
}

export interface CalibrationHook {
    calibrate(skillId: string, rawScore: number, evidenceCount: number): number;
}

export interface MasteryExplanation {
    readonly skillId: string;
    readonly score: number;
    readonly evidenceCount: number;
    readonly independentSuccesses: number;
    readonly assistedSuccesses: number;
    readonly recentFailures: number;
    readonly summary: string;
}

export const DEFAULT_CATEGORY_WEIGHTS: Readonly<Record<EvidenceCategory, number>> = {
    prediction: 0.08,
    construction: 0.12,
    debugging: 0.16,
    testing: 0.13,
    explanation: 0.1,
    transfer: 0.2,
    review: 0.08,
};

export const DEFAULT_ASSISTANCE_FACTORS: Readonly<
    Record<EvidenceSubmission["assistance"], number>
> = {
    independent: 1,
    "hint-1": 0.8,
    "hint-2": 0.6,
    "hint-3": 0.4,
    "hint-4": 0.2,
};

export const DEFAULT_MASTERY_CONFIG: MasteryConfig = {
    categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
    assistanceFactors: DEFAULT_ASSISTANCE_FACTORS,
    scale: 1.1,
    failurePenalty: 0.02,
    recentFailureDays: 30,
};

export class MasteryEstimator {
    private readonly config: MasteryConfig;

    public constructor(config: MasteryConfig = DEFAULT_MASTERY_CONFIG) {
        this.config = config;
    }

    public estimate(
        skillId: string,
        evidence: readonly WeightedEvidence[],
        now: Date,
    ): SkillMastery {
        let points = 0;
        let independentSuccesses = 0;
        let assistedSuccesses = 0;
        let recentFailures = 0;
        let updatedAt = now.toISOString();

        for (const entry of evidence) {
            const item = entry.evidence;
            const categoryWeight = this.config.categoryWeights[item.category];
            const assistanceFactor = this.config.assistanceFactors[item.assistance];
            const factor = Math.min(assistanceFactor, item.independence);
            const weight = categoryWeight * factor * entry.skillWeight;

            if (item.outcome === "success") {
                points += weight;
                if (item.assistance === "independent") {
                    independentSuccesses += 1;
                } else {
                    assistedSuccesses += 1;
                }
            } else {
                points -= this.config.failurePenalty * entry.skillWeight;
            }

            const ageInDays = (now.getTime() - new Date(item.createdAt).getTime()) / 86_400_000;
            if (item.outcome === "failure" && ageInDays <= this.config.recentFailureDays) {
                recentFailures += 1;
            }

            if (new Date(item.createdAt).getTime() > new Date(updatedAt).getTime()) {
                updatedAt = item.createdAt;
            }
        }

        const rawScore = 1 - Math.exp(-this.config.scale * Math.max(0, points));
        const calibrated =
            this.config.calibration === undefined
                ? rawScore
                : this.config.calibration.calibrate(skillId, rawScore, evidence.length);

        return {
            skillId,
            score: Math.min(1, Math.max(0, Number(calibrated.toFixed(4)))),
            evidenceCount: evidence.length,
            independentSuccesses,
            assistedSuccesses,
            recentFailures,
            updatedAt,
        };
    }

    public explain(
        skillId: string,
        evidence: readonly WeightedEvidence[],
        now: Date,
    ): MasteryExplanation {
        const snapshot = this.estimate(skillId, evidence, now);
        const summary =
            snapshot.evidenceCount === 0
                ? "No evidence yet. Mastery is an estimate built from your own work."
                : `Estimated from ${snapshot.evidenceCount} pieces of evidence, including ${snapshot.independentSuccesses} independent successes and ${snapshot.assistedSuccesses} assisted successes.`;
        return { ...snapshot, summary };
    }
}

export function masteryLabel(score: number): string {
    if (score >= 0.85) {
        return "secure";
    }
    if (score >= 0.7) {
        return "confident";
    }
    if (score >= 0.4) {
        return "developing";
    }
    return "learning";
}

export function averageMastery(
    skillIds: readonly string[],
    mastery: Readonly<Record<string, number>>,
): number {
    if (skillIds.length === 0) {
        return 0;
    }
    let total = 0;
    for (const skillId of skillIds) {
        total += mastery[skillId] ?? 0;
    }
    return total / skillIds.length;
}
