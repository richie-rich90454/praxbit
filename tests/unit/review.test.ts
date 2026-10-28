import { describe, expect, it } from "vitest";
import { DEFAULT_REVIEW_POLICY, ReviewScheduler } from "../../packages/domain/src/review/index.ts";

const NOW = new Date("2026-10-28T00:00:00.000Z");

describe("ReviewScheduler", function reviewScheduler(): void {
    it("schedules the first review after one day", function create(): void {
        const scheduler = new ReviewScheduler();
        const item = scheduler.create("concept.testing", NOW, "success");
        expect(item.intervalIndex).toBe(0);
        expect(item.dueAt).toBe("2026-10-29T00:00:00.000Z");
        expect(item.lastOutcome).toBe("success");
    });

    it("increments the interval after a success", function success(): void {
        const scheduler = new ReviewScheduler();
        const first = scheduler.create("concept.testing", NOW, "success");
        const next = scheduler.update(first, "success", NOW);
        expect(next.intervalIndex).toBe(1);
        expect(next.dueAt).toBe("2026-10-31T00:00:00.000Z");
        const third = scheduler.update(next, "success", NOW);
        expect(third.intervalIndex).toBe(2);
        expect(third.dueAt).toBe("2026-11-04T00:00:00.000Z");
    });

    it("caps the interval at the policy maximum", function cap(): void {
        const scheduler = new ReviewScheduler();
        let item = scheduler.create("concept.testing", NOW, "success");
        for (let index = 0; index < 8; index += 1) {
            item = scheduler.update(item, "success", NOW);
        }
        expect(item.intervalIndex).toBe(DEFAULT_REVIEW_POLICY.maxIntervalIndex);
    });

    it("steps back exactly one interval after a failure", function failure(): void {
        const scheduler = new ReviewScheduler();
        let item = scheduler.create("concept.testing", NOW, "success");
        item = scheduler.update(item, "success", NOW);
        item = scheduler.update(item, "success", NOW);
        expect(item.intervalIndex).toBe(2);
        const failed = scheduler.update(item, "failure", NOW);
        expect(failed.intervalIndex).toBe(1);
        expect(failed.lastOutcome).toBe("failure");
    });

    it("does not step below zero after repeated failures", function floor(): void {
        const scheduler = new ReviewScheduler();
        let item = scheduler.create("concept.testing", NOW, "success");
        item = scheduler.update(item, "failure", NOW);
        item = scheduler.update(item, "failure", NOW);
        expect(item.intervalIndex).toBe(0);
    });

    it("returns only due items ordered by due date", function due(): void {
        const scheduler = new ReviewScheduler();
        const later = scheduler.create(
            "concept.later",
            new Date("2026-10-27T00:00:00.000Z"),
            "success",
        );
        const earlier = scheduler.create(
            "concept.earlier",
            new Date("2026-10-26T00:00:00.000Z"),
            "success",
        );
        const future = scheduler.create(
            "concept.future",
            new Date("2026-10-28T12:00:00.000Z"),
            "success",
        );
        const dueItems = scheduler.due([later, earlier, future], NOW);
        expect(
            dueItems.map(function skillOf(item): string {
                return item.skillId;
            }),
        ).toEqual(["concept.earlier", "concept.later"]);
    });

    it("exposes the configured interval length", function intervalDays(): void {
        const scheduler = new ReviewScheduler();
        expect(scheduler.intervalDays(0)).toBe(1);
        expect(scheduler.intervalDays(2)).toBe(7);
        expect(scheduler.intervalDays(99)).toBe(1);
    });
});
