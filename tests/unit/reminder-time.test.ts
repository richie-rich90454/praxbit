import { describe, expect, it } from "vitest";
import { isQuietHours, nextReminderAt } from "../../apps/web/src/platform/reminder-time.ts";

function localDate(hours: number, minutes: number): Date {
    return new Date(2026, 9, 30, hours, minutes, 0, 0);
}

describe("reminder quiet hours", function quietHoursSuite(): void {
    it("handles quiet hours that cross midnight", function overnight(): void {
        expect(isQuietHours(localDate(23, 30), "22:00", "08:00")).toBe(true);
        expect(isQuietHours(localDate(7, 59), "22:00", "08:00")).toBe(true);
        expect(isQuietHours(localDate(8, 0), "22:00", "08:00")).toBe(false);
        expect(isQuietHours(localDate(12, 0), "22:00", "08:00")).toBe(false);
    });

    it("handles quiet hours within one day", function sameDay(): void {
        expect(isQuietHours(localDate(12, 0), "09:00", "17:00")).toBe(true);
        expect(isQuietHours(localDate(8, 59), "09:00", "17:00")).toBe(false);
        expect(isQuietHours(localDate(17, 0), "09:00", "17:00")).toBe(false);
    });

    it("treats unset or malformed quiet hours as wide open", function invalid(): void {
        expect(isQuietHours(localDate(12, 0), "12:00", "12:00")).toBe(false);
        expect(isQuietHours(localDate(12, 0), "", "08:00")).toBe(false);
        expect(isQuietHours(localDate(12, 0), "25:00", "08:00")).toBe(false);
    });

    it("moves the scheduled reminder past a quiet window", function nextSlot(): void {
        const reminder = nextReminderAt(localDate(17, 0), "18:00", "20:00");
        expect(reminder.getHours()).toBe(20);
        expect(reminder.getMinutes()).toBe(0);
    });

    it("uses the next day when the default hour already passed", function nextDay(): void {
        const reminder = nextReminderAt(localDate(21, 0), "22:00", "08:00");
        expect(reminder.getDate()).toBe(31);
        expect(reminder.getHours()).toBe(18);
    });
});
