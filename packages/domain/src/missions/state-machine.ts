export const MISSION_PHASES = [
    "not-started",
    "introducing",
    "exploring",
    "attempting",
    "assistance",
    "evaluating",
    "feedback",
    "completed",
    "review-scheduled",
] as const;

export type MissionPhase = (typeof MISSION_PHASES)[number];

export type MissionEvent =
    | "start"
    | "explore"
    | "attempt"
    | "request-help"
    | "evaluate"
    | "respond"
    | "complete"
    | "schedule-review"
    | "replay"
    | "reset";

export interface MissionSession {
    readonly missionId: string;
    readonly phase: MissionPhase;
    readonly attempts: number;
    readonly hintsUsed: number;
    readonly completionRecorded: boolean;
    readonly startedAt?: string;
    readonly completedAt?: string;
}

export class MissionTransitionError extends Error {
    public readonly from: MissionPhase;
    public readonly event: MissionEvent;

    public constructor(from: MissionPhase, event: MissionEvent) {
        super(`Mission cannot handle "${event}" while in phase "${from}".`);
        this.name = "MissionTransitionError";
        this.from = from;
        this.event = event;
    }
}

export class MissionStateMachine {
    private current: MissionSession;

    public constructor(session: MissionSession) {
        this.current = session;
    }

    public static create(missionId: string): MissionStateMachine {
        return new MissionStateMachine({
            missionId,
            phase: "not-started",
            attempts: 0,
            hintsUsed: 0,
            completionRecorded: false,
        });
    }

    public get session(): MissionSession {
        return this.current;
    }

    public transition(event: MissionEvent, now: Date = new Date()): MissionSession {
        const from = this.current.phase;
        let phase: MissionPhase;

        switch (event) {
            case "start":
                this.requirePhase(from, event, ["not-started"]);
                phase = "introducing";
                break;
            case "explore":
                this.requirePhase(from, event, ["introducing", "exploring"]);
                phase = "exploring";
                break;
            case "attempt":
                this.requirePhase(from, event, ["exploring", "attempting", "assistance", "feedback", "review-scheduled"]);
                phase = "attempting";
                break;
            case "request-help":
                this.requirePhase(from, event, ["attempting", "assistance"]);
                phase = "assistance";
                break;
            case "evaluate":
                this.requirePhase(from, event, ["attempting", "assistance"]);
                phase = "evaluating";
                break;
            case "respond":
                this.requirePhase(from, event, ["evaluating"]);
                phase = "feedback";
                break;
            case "complete":
                this.requirePhase(from, event, ["feedback"]);
                if (this.current.completionRecorded) {
                    throw new Error("Completion reward already recorded for this attempt.");
                }
                phase = "completed";
                break;
            case "schedule-review":
                this.requirePhase(from, event, ["completed", "review-scheduled"]);
                phase = "review-scheduled";
                break;
            case "replay":
                this.requirePhase(from, event, ["review-scheduled", "completed"]);
                phase = "attempting";
                break;
            case "reset":
                this.requirePhase(from, event, ["feedback", "attempting", "assistance"]);
                phase = "not-started";
                break;
            default:
                throw new MissionTransitionError(from, event);
        }

        const updated: MissionSession = {
            ...this.current,
            phase,
            attempts: event === "attempt" ? this.current.attempts + 1 : this.current.attempts,
            hintsUsed: event === "request-help" ? Math.min(4, this.current.hintsUsed + 1) : this.current.hintsUsed,
            completionRecorded: event === "complete" ? true : this.current.completionRecorded,
        };

        const startedAt =
            event === "start" && this.current.startedAt === undefined ? now.toISOString() : this.current.startedAt;
        const completedAt = event === "complete" ? now.toISOString() : this.current.completedAt;
        this.current = {
            ...updated,
            ...(startedAt === undefined ? {} : { startedAt }),
            ...(completedAt === undefined ? {} : { completedAt }),
        };

        return this.current;
    }

    private requirePhase(from: MissionPhase, event: MissionEvent, allowed: readonly MissionPhase[]): void {
        if (!allowed.includes(from)) {
            throw new MissionTransitionError(from, event);
        }
    }
}
