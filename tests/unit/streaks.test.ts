import { describe, expect, it } from "vitest";
import { computeStreak, recordPractice } from "../../packages/domain/src/learning/streaks.ts";

describe("computeStreak", function computeStreakTest(): void {
    it("returns zero for no activity", function empty(): void {
        expect(computeStreak([], "2026-10-28")).toEqual({
            current: 0,
            longest: 0,
            activeToday: false,
        });
    });

    it("keeps a streak alive on the day after the last practice", function grace(): void {
        const result = computeStreak(["2026-10-25", "2026-10-26", "2026-10-27"], "2026-10-28");
        expect(result.current).toBe(3);
        expect(result.activeToday).toBe(false);
        expect(result.longest).toBe(3);
    });

    it("breaks a streak after a full missed day", function broken(): void {
        const result = computeStreak(["2026-10-25", "2026-10-26"], "2026-10-28");
        expect(result.current).toBe(0);
        expect(result.longest).toBe(2);
    });

    it("deduplicates multiple activities on one day", function dedupe(): void {
        const result = computeStreak(
            ["2026-10-26T08:00:00.000Z", "2026-10-26T20:00:00.000Z", "2026-10-27"],
            "2026-10-27",
        );
        expect(result.current).toBe(2);
        expect(result.longest).toBe(2);
        expect(result.activeToday).toBe(true);
    });
});

describe("recordPractice", function recordPracticeTest(): void {
    it("starts a streak at one", function first(): void {
        expect(recordPractice({ streakDays: 0, longestStreak: 0 }, "2026-10-28")).toEqual({
            streakDays: 1,
            longestStreak: 1,
            lastPracticeOn: "2026-10-28",
        });
    });

    it("does not double count the same day", function sameDay(): void {
        const record = recordPractice(
            { streakDays: 4, longestStreak: 6, lastPracticeOn: "2026-10-28" },
            "2026-10-28",
        );
        expect(record.streakDays).toBe(4);
        expect(record.longestStreak).toBe(6);
    });

    it("increments after consecutive days and updates the longest streak", function consecutive(): void {
        const record = recordPractice(
            { streakDays: 4, longestStreak: 4, lastPracticeOn: "2026-10-27" },
            "2026-10-28",
        );
        expect(record.streakDays).toBe(5);
        expect(record.longestStreak).toBe(5);
    });

    it("resets after a gap", function gap(): void {
        const record = recordPractice(
            { streakDays: 9, longestStreak: 9, lastPracticeOn: "2026-10-20" },
            "2026-10-28",
        );
        expect(record.streakDays).toBe(1);
        expect(record.longestStreak).toBe(9);
    });
});
