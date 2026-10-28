export interface MotionPreference {
    readonly reduce: boolean;
}

export function transitionDuration(baseMs: number, preference: MotionPreference): number {
    return preference.reduce ? 0 : baseMs;
}
