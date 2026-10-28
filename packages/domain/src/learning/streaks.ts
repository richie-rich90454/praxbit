export interface StreakResult {
    readonly current: number;
    readonly longest: number;
    readonly activeToday: boolean;
}

function toUtcDate(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dayDifference(later: string, earlier: string): number {
    return Math.round((toUtcDate(later).getTime() - toUtcDate(earlier).getTime()) / 86_400_000);
}

export function computeStreak(activityDates: readonly string[], today: string): StreakResult {
    const unique = [...new Set(activityDates.map(function toDay(value: string): string {
        return value.slice(0, 10);
    }))].sort();

    let longest = 0;
    let run = 0;
    let previous: string | undefined;

    for (const date of unique) {
        if (previous !== undefined && dayDifference(date, previous) === 1) {
            run += 1;
        } else {
            run = 1;
        }
        longest = Math.max(longest, run);
        previous = date;
    }

    const activeToday = unique.includes(today);
    let current = 0;
    if (unique.length > 0) {
        const last = unique[unique.length - 1];
        if (last !== undefined) {
            const difference = dayDifference(today, last);
            if (difference === 0 || difference === 1) {
                current = 1;
                let cursor = last;
                for (let index = unique.length - 2; index >= 0; index -= 1) {
                    const candidate = unique[index];
                    if (candidate === undefined) {
                        break;
                    }
                    if (dayDifference(cursor, candidate) === 1) {
                        current += 1;
                        cursor = candidate;
                    } else {
                        break;
                    }
                }
            }
        }
    }

    return { current, longest, activeToday };
}

export interface StreakRecord {
    readonly streakDays: number;
    readonly longestStreak: number;
    readonly lastPracticeOn?: string | undefined;
}

export function recordPractice(record: StreakRecord, today: string): StreakRecord {
    const previous = record.lastPracticeOn;
    let streakDays = 1;
    if (previous !== undefined) {
        const difference = dayDifference(today, previous);
        if (difference === 0) {
            streakDays = Math.max(1, record.streakDays);
        } else if (difference === 1) {
            streakDays = record.streakDays + 1;
        }
    }
    return {
        streakDays,
        longestStreak: Math.max(record.longestStreak, streakDays),
        lastPracticeOn: today,
    };
}
