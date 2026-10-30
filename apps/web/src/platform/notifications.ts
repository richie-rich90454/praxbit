import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { nextReminderAt } from "./reminder-time.ts";

export type ReminderKind = "native" | "web" | "none";

export interface ReminderPreferences {
    readonly enabled: boolean;
    readonly quietStart: string;
    readonly quietEnd: string;
}

export interface ReminderScheduleResult {
    readonly scheduled: boolean;
    readonly kind: ReminderKind;
    readonly reason?: string;
}

export const REMINDER_NOTIFICATION_ID = 4242;

const REMINDER_TITLE = "Praxbit practice reminder";
const REMINDER_BODY = "A short practice session keeps the streak and the ideas moving.";

let webTimer: ReturnType<typeof setTimeout> | undefined;

export function detectReminderKind(): ReminderKind {
    if (
        Capacitor.isNativePlatform() === true &&
        Capacitor.isPluginAvailable("LocalNotifications") === true
    ) {
        return "native";
    }
    if (typeof Notification !== "undefined") {
        return "web";
    }
    return "none";
}

export function createReminderScheduler(): {
    readonly kind: ReminderKind;
    enable(preferences: ReminderPreferences): Promise<ReminderScheduleResult>;
    resume(preferences: ReminderPreferences): Promise<ReminderScheduleResult>;
    disable(): Promise<void>;
} {
    const kind = detectReminderKind();

    async function enable(preferences: ReminderPreferences): Promise<ReminderScheduleResult> {
        if (!preferences.enabled) {
            await disable();
            return { scheduled: false, kind, reason: "Reminders are turned off." };
        }
        if (kind === "none") {
            return {
                scheduled: false,
                kind,
                reason: "This device does not support local notifications, so reminders cannot be scheduled.",
            };
        }
        try {
            return kind === "native"
                ? await enableNative(preferences, true)
                : await enableWeb(preferences, true);
        } catch (error) {
            return {
                scheduled: false,
                kind,
                reason:
                    error instanceof Error
                        ? error.message
                        : "The practice reminder could not be scheduled.",
            };
        }
    }

    async function resume(preferences: ReminderPreferences): Promise<ReminderScheduleResult> {
        if (!preferences.enabled || kind === "none") {
            return { scheduled: false, kind, reason: "Reminders are not enabled." };
        }
        try {
            return kind === "native"
                ? await enableNative(preferences, false)
                : await enableWeb(preferences, false);
        } catch {
            return {
                scheduled: false,
                kind,
                reason: "The practice reminder could not be restored.",
            };
        }
    }

    async function enableNative(
        preferences: ReminderPreferences,
        requestPermission: boolean,
    ): Promise<ReminderScheduleResult> {
        let permission = await LocalNotifications.checkPermissions();
        if (permission.display === "prompt" && requestPermission) {
            permission = await LocalNotifications.requestPermissions();
        }
        if (permission.display !== "granted") {
            return {
                scheduled: false,
                kind,
                reason: "Notification permission was not granted, so no reminder was scheduled.",
            };
        }
        await disableNative();
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: REMINDER_NOTIFICATION_ID,
                    title: REMINDER_TITLE,
                    body: REMINDER_BODY,
                    schedule: {
                        at: nextReminderAt(
                            new Date(),
                            preferences.quietStart,
                            preferences.quietEnd,
                        ),
                        allowWhileIdle: true,
                    },
                },
            ],
        });
        return { scheduled: true, kind };
    }

    async function enableWeb(
        preferences: ReminderPreferences,
        requestPermission: boolean,
    ): Promise<ReminderScheduleResult> {
        let permission = Notification.permission;
        if (permission === "default" && requestPermission) {
            permission = await Notification.requestPermission();
        }
        if (permission !== "granted") {
            return {
                scheduled: false,
                kind,
                reason: "Notification permission was not granted, so no reminder was scheduled.",
            };
        }
        clearWebTimer();
        const delay = Math.max(
            0,
            nextReminderAt(new Date(), preferences.quietStart, preferences.quietEnd).getTime() -
                Date.now(),
        );
        webTimer = setTimeout(function fireReminder(): void {
            webTimer = undefined;
            try {
                const notification = new Notification(REMINDER_TITLE, { body: REMINDER_BODY });
                notification.onclick = function openApp(): void {
                    window.focus();
                    notification.close();
                };
            } catch {
                // Permission can be revoked after the reminder is scheduled.
            }
        }, delay);
        return { scheduled: true, kind };
    }

    async function disable(): Promise<void> {
        clearWebTimer();
        if (kind === "native") {
            await disableNative();
        }
    }

    async function disableNative(): Promise<void> {
        try {
            await LocalNotifications.cancel({
                notifications: [{ id: REMINDER_NOTIFICATION_ID }],
            });
        } catch {
            // Nothing was scheduled on this device.
        }
    }

    function clearWebTimer(): void {
        if (webTimer !== undefined) {
            clearTimeout(webTimer);
            webTimer = undefined;
        }
    }

    return { kind, enable, resume, disable };
}

export const reminderScheduler = createReminderScheduler();
