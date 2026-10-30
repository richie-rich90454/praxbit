export const DEFAULT_REMINDER_HOUR = 18;

export function isQuietHours(now: Date, quietStart: string, quietEnd: string): boolean {
    const start = minutesFromTime(quietStart);
    const end = minutesFromTime(quietEnd);
    if (start === undefined || end === undefined || start === end) {
        return false;
    }
    const current = now.getHours() * 60 + now.getMinutes();
    return start < end ? current >= start && current < end : current >= start || current < end;
}

export function nextReminderAt(
    now: Date,
    quietStart: string,
    quietEnd: string,
    hour = DEFAULT_REMINDER_HOUR,
): Date {
    const candidate = new Date(now.getTime());
    candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() <= now.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
    }
    for (let step = 0; step < 48 * 60; step += 1) {
        if (!isQuietHours(candidate, quietStart, quietEnd)) {
            break;
        }
        candidate.setMinutes(candidate.getMinutes() + 1);
    }
    return candidate;
}

function minutesFromTime(value: string): number | undefined {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (match === null) {
        return undefined;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        return undefined;
    }
    return hours * 60 + minutes;
}
