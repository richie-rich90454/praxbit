import Dexie, { type Table } from "dexie";
import type {
    AchievementRecord,
    EvidenceRecord,
    Preferences,
    Progress,
    ReviewItem,
    SkillMastery,
    SyncOperation,
    WorldState,
} from "@praxbit/contracts";

export interface LocalProgress extends Progress {
    readonly id: "local";
}

export interface PreferencesRow {
    readonly id: "local";
    readonly value: Preferences;
}

export interface WorldRow {
    readonly id: "campus";
    readonly state: WorldState;
    readonly updatedAt: string;
}

export interface DraftRow {
    readonly key: string;
    readonly files: Readonly<Record<string, string>>;
    readonly updatedAt: string;
}

export interface OutboxRow {
    readonly seq?: number;
    readonly operationId: string;
    readonly operation: SyncOperation;
    readonly queuedAt: string;
    readonly attempts: number;
    readonly lastError?: string;
}

export interface ProjectRow {
    readonly id: string;
    readonly files: Readonly<Record<string, string>>;
    readonly revision: number;
    readonly updatedAt: string;
}

export interface AttemptRow {
    readonly id: string;
    readonly missionId: string;
    readonly startedAt: string;
    readonly completedAt?: string;
}

export interface MetaRow {
    readonly key: string;
    readonly value: string;
}

export interface CompletionRow {
    readonly id: string;
    readonly missionId: string;
    readonly version: number;
    readonly attemptId: string;
    readonly completedAt: string;
    readonly independent: boolean;
}

export class PraxbitDatabase extends Dexie {
    public readonly progress!: Table<LocalProgress, string>;
    public readonly evidence!: Table<EvidenceRecord, string>;
    public readonly mastery!: Table<SkillMastery, string>;
    public readonly reviews!: Table<ReviewItem, string>;
    public readonly world!: Table<WorldRow, string>;
    public readonly drafts!: Table<DraftRow, string>;
    public readonly preferences!: Table<PreferencesRow, string>;
    public readonly outbox!: Table<OutboxRow, number>;
    public readonly projects!: Table<ProjectRow, string>;
    public readonly attempts!: Table<AttemptRow, string>;
    public readonly completions!: Table<CompletionRow, string>;
    public readonly meta!: Table<MetaRow, string>;

    public constructor(name = "praxbit-local") {
        super(name);
        this.version(1).stores({
            progress: "id",
            evidence: "id, missionId, createdAt",
            mastery: "skillId",
            reviews: "skillId, dueAt",
            world: "id",
            drafts: "key, updatedAt",
            preferences: "id",
            outbox: "++seq, operationId, queuedAt",
            projects: "id",
            attempts: "id, missionId",
            completions: "id, missionId",
            meta: "key",
        });
    }
}

export const DEFAULT_PREFERENCES: Preferences = {
    interests: ["everything"],
    textScale: 1,
    motion: "system",
    sound: false,
    challenge: "standard",
    reminders: {
        enabled: false,
        quietStart: "22:00",
        quietEnd: "08:00",
    },
    aiTutor: false,
};

export function defaultProgress(): LocalProgress {
    return {
        id: "local",
        experience: 0,
        level: 1,
        streakDays: 0,
        longestStreak: 0,
        placementSkippedSkills: [],
        achievements: [],
    };
}

export async function loadProgress(db: PraxbitDatabase): Promise<LocalProgress> {
    const existing = await db.progress.get("local");
    return existing ?? defaultProgress();
}

export async function loadPreferences(db: PraxbitDatabase): Promise<Preferences> {
    const existing = await db.preferences.get("local");
    return existing?.value ?? DEFAULT_PREFERENCES;
}

export async function savePreferences(db: PraxbitDatabase, preferences: Preferences): Promise<void> {
    await db.preferences.put({ id: "local", value: preferences });
}

export async function saveProgress(db: PraxbitDatabase, progress: Progress): Promise<void> {
    await db.progress.put({ ...progress, id: "local" });
}

export async function saveWorld(db: PraxbitDatabase, state: WorldState): Promise<void> {
    await db.world.put({ id: "campus", state, updatedAt: new Date().toISOString() });
}

export async function loadWorld(db: PraxbitDatabase): Promise<WorldState | undefined> {
    const row = await db.world.get("campus");
    return row?.state;
}

export async function addAchievements(
    db: PraxbitDatabase,
    achievements: readonly AchievementRecord[],
): Promise<LocalProgress> {
    const progress = await loadProgress(db);
    const existing = new Set(progress.achievements.map(function idOf(item): string {
        return item.achievementId;
    }));
    const additions = achievements.filter(function isNew(item): boolean {
        return !existing.has(item.achievementId);
    });
    if (additions.length === 0) {
        return progress;
    }
    const next: LocalProgress = { ...progress, achievements: [...progress.achievements, ...additions] };
    await saveProgress(db, next);
    return next;
}

export async function queueOperation(db: PraxbitDatabase, operation: SyncOperation): Promise<void> {
    await db.outbox.add({
        operationId: operation.operationId,
        operation,
        queuedAt: new Date().toISOString(),
        attempts: 0,
    });
}

export async function markOutboxFailure(db: PraxbitDatabase, seq: number, message: string): Promise<void> {
    const row = await db.outbox.get(seq);
    if (row === undefined) {
        return;
    }
    await db.outbox.update(seq, { attempts: row.attempts + 1, lastError: message });
}

export function createOperationId(): string {
    return crypto.randomUUID();
}
