import type { ReviewItem } from "@praxbit/contracts";

export interface ReviewPolicy {
    readonly intervalsInDays: readonly number[];
    readonly maxIntervalIndex: number;
}

export const DEFAULT_REVIEW_POLICY: ReviewPolicy = {
    intervalsInDays: [1, 3, 7, 14],
    maxIntervalIndex: 3,
};

function addDays(date: Date, days: number): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

export class ReviewScheduler {
    private readonly policy: ReviewPolicy;

    public constructor(policy: ReviewPolicy = DEFAULT_REVIEW_POLICY) {
        this.policy = policy;
    }

    public create(skillId: string, now: Date, outcome: "success" | "failure"): ReviewItem {
        const intervalIndex = outcome === "success" ? 0 : 0;
        const interval = this.policy.intervalsInDays[intervalIndex] ?? 1;
        return {
            skillId,
            intervalIndex,
            dueAt: addDays(now, interval).toISOString(),
            lastReviewedAt: now.toISOString(),
            lastOutcome: outcome,
        };
    }

    public update(previous: ReviewItem, outcome: "success" | "failure", now: Date): ReviewItem {
        let intervalIndex: number;
        if (outcome === "success") {
            intervalIndex = Math.min(previous.intervalIndex + 1, this.policy.maxIntervalIndex);
        } else {
            intervalIndex = Math.max(0, previous.intervalIndex - 1);
        }
        const interval = this.policy.intervalsInDays[intervalIndex] ?? 1;
        return {
            skillId: previous.skillId,
            intervalIndex,
            dueAt: addDays(now, interval).toISOString(),
            lastReviewedAt: now.toISOString(),
            lastOutcome: outcome,
        };
    }

    public due(schedules: readonly ReviewItem[], now: Date): readonly ReviewItem[] {
        const time = now.getTime();
        return schedules
            .filter(function isDue(item: ReviewItem): boolean {
                return new Date(item.dueAt).getTime() <= time;
            })
            .sort(function byDueDate(left: ReviewItem, right: ReviewItem): number {
                return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
            });
    }

    public intervalDays(intervalIndex: number): number {
        return this.policy.intervalsInDays[intervalIndex] ?? 1;
    }
}
