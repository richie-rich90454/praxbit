import {
    createContext,
    createMemo,
    createSignal,
    onCleanup,
    onMount,
    useContext,
    type Accessor,
    type JSX,
} from "solid-js";
import type {
    AchievementDefinition,
    AchievementRecord,
    EvidenceRecord,
    Mission,
    MissionStep,
    Preferences,
    ProjectDefinition,
    ReviewItem,
    SkillMastery,
    User,
    WorldAction,
    WorldState,
} from "@praxbit/contracts";
import {
    MasteryEstimator,
    ReviewScheduler,
    applyWorldAction,
    buildEvidenceDraft,
    buildPracticePlan,
    completionReward,
    createInitialWorld,
    earnedAchievements,
    expandEvidenceSkills,
    isWorldRecovered,
    levelForExperience,
    recordPractice,
    recommendMission,
    type ChallengeLevel,
    type PracticePlan,
    type SessionLength,
    type StepEvaluation,
    type StreakRecord,
} from "@praxbit/domain";
import {
    DEFAULT_PREFERENCES,
    applySyncSnapshot,
    defaultProgress,
    loadPreferences,
    loadProgress,
    queueOperation,
    savePreferences as savePreferencesRow,
    saveProgress,
    saveWorld,
    type CompletionRow,
    type LocalProgress,
} from "@praxbit/client";
import { ApiError } from "@praxbit/client";
import { api, db, syncManager } from "../../platform/services.ts";
import {
    achievements as achievementDefinitions,
    getMission,
    missions,
    projects,
    skillGraph,
} from "../../content/index.ts";
import { playCompletionTone } from "../../platform/sound.ts";

export type SyncStatus = "idle" | "offline" | "pending" | "synced" | "conflict" | "failed";

export interface CompletionOutcome {
    readonly alreadyCompleted: boolean;
    readonly experience: number;
    readonly independent: boolean;
    readonly newAchievements: readonly AchievementDefinition[];
    readonly worldChanged: boolean;
}

export interface PlacementState {
    readonly recommendedMissionId: string;
    readonly skippedSkills: readonly string[];
    readonly correct: number;
    readonly total: number;
}

export interface LearningContextValue {
    readonly ready: Accessor<boolean>;
    readonly user: Accessor<User | undefined>;
    readonly preferences: Accessor<Preferences>;
    readonly progress: Accessor<LocalProgress>;
    readonly mastery: Accessor<Readonly<Record<string, SkillMastery>>>;
    readonly reviews: Accessor<readonly ReviewItem[]>;
    readonly dueReviews: Accessor<readonly ReviewItem[]>;
    readonly world: Accessor<WorldState>;
    readonly completions: Accessor<readonly CompletionRow[]>;
    readonly completedMissionIds: Accessor<ReadonlySet<string>>;
    readonly completedProjectIds: Accessor<readonly string[]>;
    readonly recommendationId: Accessor<string | undefined>;
    readonly recommendationReasons: Accessor<readonly string[]>;
    readonly onboarded: Accessor<boolean>;
    readonly placement: Accessor<PlacementState | undefined>;
    readonly syncStatus: Accessor<SyncStatus>;
    readonly syncMessage: Accessor<string | undefined>;
    readonly outboxCount: Accessor<number>;
    readonly online: Accessor<boolean>;
    readonly recordStepEvidence: (mission: Mission, step: MissionStep, evaluation: StepEvaluation, hintsUsed: number) => Promise<void>;
    readonly completeMission: (mission: Mission, attemptId: string, hintsByStep: Readonly<Record<string, number>>) => Promise<CompletionOutcome>;
    readonly recordPracticeReview: (mission: Mission) => Promise<void>;
    readonly recordProjectCompletion: (project: ProjectDefinition, passedStages: number) => Promise<CompletionOutcome>;
    readonly savePreferences: (next: Preferences) => Promise<void>;
    readonly applyPlacement: (state: PlacementState) => Promise<void>;
    readonly setOnboarded: (value: boolean) => Promise<void>;
    readonly practicePlan: (length: SessionLength) => PracticePlan;
    readonly performWorldAction: (action: WorldAction) => Promise<WorldState>;
    readonly syncNow: () => Promise<void>;
    readonly login: (handle: string, password: string) => Promise<void>;
    readonly register: (handle: string, password: string) => Promise<void>;
    readonly logout: () => Promise<void>;
    readonly deleteAccount: () => Promise<void>;
    readonly exportData: () => Promise<void>;
    readonly refreshWorld: () => Promise<void>;
    readonly saveProjectDraft: (projectId: string, files: Readonly<Record<string, string>>) => Promise<void>;
    readonly loadProjectDraft: (projectId: string) => Promise<Readonly<Record<string, string>> | undefined>;
}

const LearningContext = createContext<LearningContextValue>();

const estimator = new MasteryEstimator();
const scheduler = new ReviewScheduler();

function todayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

function completionRowId(missionId: string, version: number): string {
    return `${missionId}@${version}`;
}

function skillPrefix(skillId: string): string {
    return skillId.split(".")[0] ?? skillId;
}

function languagePrefixes(evidence: readonly EvidenceRecord[]): readonly string[] {
    const prefixes = new Set<string>();
    const languageKeys = new Set([
        "js",
        "ts",
        "web",
        "html",
        "css",
        "python",
        "sql",
        "java",
        "c",
        "cpp",
        "csharp",
        "go",
        "rust",
        "kotlin",
        "swift",
        "ruby",
        "zig",
        "lua",
        "react",
    ]);
    for (const record of evidence) {
        if (record.outcome !== "success") {
            continue;
        }
        for (const skillId of record.skills) {
            const prefix = skillPrefix(skillId);
            if (languageKeys.has(prefix)) {
                prefixes.add(prefix === "html" || prefix === "css" ? "web" : prefix);
            }
        }
    }
    return [...prefixes];
}

function evidenceWeight(record: EvidenceRecord, skillId: string): number {
    const mission = getMission(record.missionId);
    const fullSkills = mission?.skills ?? projects.find(function match(project): boolean {
        return project.id === record.missionId;
    })?.skills ?? [];
    return fullSkills.includes(skillId) ? 1 : 0.25;
}

export function LearningProvider(props: { readonly children: JSX.Element }): JSX.Element {
    const [ready, setReady] = createSignal(false);
    const [user, setUser] = createSignal<User | undefined>(undefined);
    const [preferences, setPreferences] = createSignal<Preferences>(DEFAULT_PREFERENCES);
    const [progress, setProgress] = createSignal<LocalProgress>(defaultProgress());
    const [mastery, setMastery] = createSignal<Readonly<Record<string, SkillMastery>>>({});
    const [reviews, setReviews] = createSignal<readonly ReviewItem[]>([]);
    const [world, setWorld] = createSignal<WorldState>(createInitialWorld());
    const [completions, setCompletions] = createSignal<readonly CompletionRow[]>([]);
    const [evidence, setEvidence] = createSignal<readonly EvidenceRecord[]>([]);
    const [onboarded, setOnboardedSignal] = createSignal(false);
    const [placement, setPlacement] = createSignal<PlacementState | undefined>(undefined);
    const [completedProjectIds, setCompletedProjectIds] = createSignal<readonly string[]>([]);
    const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
    const [syncMessage, setSyncMessage] = createSignal<string | undefined>(undefined);
    const [outboxCount, setOutboxCount] = createSignal(0);
    const [online, setOnline] = createSignal(typeof navigator === "undefined" ? true : navigator.onLine);

    const completedMissionIds = createMemo(function completedSet(): ReadonlySet<string> {
        return new Set(completions().map(function idOf(item: CompletionRow): string {
            return item.missionId;
        }));
    });

    const dueReviews = createMemo(function dueNow(): readonly ReviewItem[] {
        return scheduler.due(reviews(), new Date());
    });

    const recommendation = createMemo(function recommend(): { id: string; reasons: readonly string[] } {
        const completedSequences: Record<string, number> = {};
        for (const completion of completions()) {
            const mission = getMission(completion.missionId);
            if (mission !== undefined) {
                completedSequences[mission.courseId] = Math.max(completedSequences[mission.courseId] ?? 0, mission.sequence);
            }
        }
        const failedMissionIds = new Set(
            evidence()
                .filter(function failed(record: EvidenceRecord): boolean {
                    return record.outcome === "failure";
                })
                .map(function idOf(record: EvidenceRecord): string {
                    return record.missionId;
                }),
        );
        const misconceptionSkills: string[] = [];
        const failureSkills: string[] = [];
        for (const missionId of failedMissionIds) {
            const mission = getMission(missionId);
            if (mission === undefined) {
                continue;
            }
            misconceptionSkills.push(...mission.skills);
            failureSkills.push(...mission.skills);
        }
        const masteryScores: Record<string, number> = {};
        for (const [skillId, snapshot] of Object.entries(mastery())) {
            masteryScores[skillId] = snapshot.score;
        }
        const recommendationResult = recommendMission({
            graph: skillGraph,
            missions,
            mastery: masteryScores,
            reviews: reviews(),
            interests: preferences().interests,
            challenge: preferences().challenge as ChallengeLevel,
            completedMissionIds: [...completedMissionIds()],
            completedSequences,
            misconceptionSkills,
            recentFailureSkills: failureSkills,
            skippedSkills: progress().placementSkippedSkills,
            now: new Date(),
            variationSeed: Math.floor(Date.now() / 86_400_000),
        });
        if (recommendationResult === undefined) {
            const first = missions[0];
            return { id: first?.id ?? "", reasons: ["Start with the first mission."] };
        }
        return { id: recommendationResult.missionId, reasons: recommendationResult.reasons };
    });

    function applyPresentation(next: Preferences): void {
        if (typeof document === "undefined") {
            return;
        }
        const root = document.documentElement;
        root.dataset["textScale"] = next.textScale >= 1.2 ? "large" : next.textScale <= 0.95 ? "small" : "normal";
        root.dataset["motion"] = next.motion === "reduce" ? "reduce" : "system";
    }

    async function reloadLocalState(): Promise<void> {
        const [progressRow, evidenceRows, masteryRows, reviewRows, worldRow, preferenceRow, completionRows, metaRows] =
            await Promise.all([
                loadProgress(db),
                db.evidence.toArray(),
                db.mastery.toArray(),
                db.reviews.toArray(),
                db.world.get("campus"),
                loadPreferences(db),
                db.completions.toArray(),
                db.meta.toArray(),
            ]);

        setProgress(progressRow);
        setEvidence(evidenceRows);
        setMastery(
            Object.fromEntries(masteryRows.map(function entry(snapshot): [string, SkillMastery] {
                return [snapshot.skillId, snapshot];
            })),
        );
        setReviews(reviewRows);
        setWorld(worldRow?.state ?? createInitialWorld());
        setPreferences(preferenceRow);
        applyPresentation(preferenceRow);
        setCompletions(completionRows);

        const meta = new Map(metaRows.map(function entry(row): [string, string] {
            return [row.key, row.value];
        }));
        setOnboardedSignal(meta.get("onboarded") === "true");
        const placementRaw = meta.get("placement");
        if (placementRaw !== undefined) {
            try {
                setPlacement(JSON.parse(placementRaw) as PlacementState);
            } catch {
                setPlacement(undefined);
            }
        }
        const projectsRaw = meta.get("projects-completed");
        if (projectsRaw !== undefined) {
            try {
                const parsed = JSON.parse(projectsRaw) as unknown;
                if (Array.isArray(parsed)) {
                    setCompletedProjectIds(parsed.filter(function isString(value): value is string {
                        return typeof value === "string";
                    }));
                }
            } catch {
                setCompletedProjectIds([]);
            }
        }
        setOutboxCount(await db.outbox.count());
    }

    async function hydrateAuthenticated(): Promise<void> {
        try {
            const me = await api.me();
            setUser(me.user);
            setPreferences(me.preferences);
            applyPresentation(me.preferences);
            try {
                localStorage.setItem("praxbit-account", "1");
            } catch {
                // Storage may be unavailable in private modes; the session cookie still works for this load.
            }
            const completionRows: CompletionRow[] = me.completions.map(function toRow(completion): CompletionRow {
                return {
                    id: completionRowId(completion.missionId, completion.missionVersion),
                    missionId: completion.missionId,
                    version: completion.missionVersion,
                    attemptId: completion.attemptId,
                    completedAt: completion.completedAt,
                    independent: completion.independent,
                };
            });
            await db.completions.bulkPut(completionRows);
            await syncManager.flush(50);
            const snapshot = await api.sync({ operations: [] });
            await applySyncSnapshot(db, snapshot);
            await reloadLocalState();
            setSyncStatus("synced");
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                setUser(undefined);
                try {
                    localStorage.removeItem("praxbit-account");
                } catch {
                    // Nothing else to clear.
                }
                return;
            }
            setSyncStatus("failed");
            setSyncMessage(error instanceof Error ? error.message : "Could not load account progress.");
        }
    }

    function hasAccountMarker(): boolean {
        try {
            return localStorage.getItem("praxbit-account") === "1";
        } catch {
            return false;
        }
    }

    async function initialize(): Promise<void> {
        try {
            await db.open();
            const existingWorld = await db.world.get("campus");
            if (existingWorld === undefined) {
                await saveWorld(db, createInitialWorld());
            }
            await reloadLocalState();
            if (hasAccountMarker()) {
                await hydrateAuthenticated();
            }
        } finally {
            setReady(true);
        }
    }

    onMount(function mount(): void {
        void initialize();
        const goOnline = function goOnline(): void {
            setOnline(true);
            void syncNow();
        };
        const goOffline = function goOffline(): void {
            setOnline(false);
            setSyncStatus("offline");
        };
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        onCleanup(function cleanup(): void {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        });
    });

    async function recomputeMastery(rows: readonly EvidenceRecord[], affected: readonly string[]): Promise<void> {
        const now = new Date();
        const next = { ...mastery() };
        for (const skillId of new Set(affected)) {
            const entries = rows
                .filter(function relevant(record: EvidenceRecord): boolean {
                    return record.skills.includes(skillId);
                })
                .map(function weighted(record): { evidence: EvidenceRecord; skillWeight: number } {
                    return { evidence: record, skillWeight: evidenceWeight(record, skillId) };
                });
            if (entries.length === 0) {
                continue;
            }
            const snapshot = estimator.estimate(skillId, entries, now);
            next[skillId] = snapshot;
            await db.mastery.put(snapshot);
        }
        setMastery(next);
    }

    async function persistEvidence(record: EvidenceRecord): Promise<void> {
        const existing = await db.evidence.get(record.id);
        if (existing !== undefined) {
            return;
        }
        await db.evidence.put(record);
        const rows = [...evidence(), record];
        setEvidence(rows);
        await queueOperation(db, {
            kind: "evidence",
            operationId: `evidence:${record.id}`,
            evidence: {
                id: record.id,
                missionId: record.missionId,
                missionVersion: record.missionVersion,
                category: record.category,
                outcome: record.outcome,
                assistance: record.assistance,
                independence: record.independence,
                createdAt: record.createdAt,
                ...(record.stepId === undefined ? {} : { stepId: record.stepId }),
                ...(record.attemptId === undefined ? {} : { attemptId: record.attemptId }),
                ...(record.detail === undefined ? {} : { detail: record.detail }),
            },
        });
        await recomputeMastery(rows, record.skills);
        setOutboxCount(await db.outbox.count());
        setSyncStatus(user() === undefined ? "idle" : "pending");
    }

    async function recordStepEvidence(
        mission: Mission,
        step: MissionStep,
        evaluation: StepEvaluation,
        hintsUsed: number,
        options?: { readonly attemptId?: string; readonly categoryOverride?: "testing" | "transfer" },
    ): Promise<void> {
        const draft = buildEvidenceDraft({
            id: crypto.randomUUID(),
            mission,
            step,
            evaluation,
            hintsUsed,
            now: new Date(),
            ...(options?.attemptId === undefined ? {} : { attemptId: options.attemptId }),
            ...(options?.categoryOverride === undefined ? {} : { category: options.categoryOverride }),
        });
        const expanded = [...expandEvidenceSkills(skillGraph, mission.skills).keys()];
        await persistEvidence({ ...draft, skills: expanded });

        if (step.kind === "machine" && evaluation.passed && options?.categoryOverride === undefined) {
            const transferDraft = buildEvidenceDraft({
                id: crypto.randomUUID(),
                mission,
                step,
                evaluation,
                hintsUsed,
                now: new Date(),
                ...(options?.attemptId === undefined ? {} : { attemptId: options.attemptId }),
                category: "transfer",
                detail: step.transfer.explanation,
            });
            await persistEvidence({ ...transferDraft, skills: expanded });
        }

        if (step.kind === "code" && evaluation.passed && options?.categoryOverride === undefined) {
            const testingDraft = buildEvidenceDraft({
                id: crypto.randomUUID(),
                mission,
                step,
                evaluation,
                hintsUsed,
                now: new Date(),
                ...(options?.attemptId === undefined ? {} : { attemptId: options.attemptId }),
                category: "testing",
                detail: "Tests passed against the learner's implementation.",
            });
            await persistEvidence({ ...testingDraft, skills: expanded });
        }
    }

    async function refreshAchievements(): Promise<readonly AchievementDefinition[]> {
        const context = {
            evidence: evidence(),
            completedMissionIds: [...completedMissionIds()],
            projectsCompleted: completedProjectIds().length,
            clubEventsCompleted: 0,
            worldRecovered: isWorldRecovered(world()) || world().flags["incidentResolved"] === true,
            languagesDemonstrated: languagePrefixes(evidence()),
            hiddenBoundaryFound: evidence().some(function boundary(record: EvidenceRecord): boolean {
                return record.category === "testing" && record.outcome === "success";
            }),
            difficultDebuggingRecovered: evidence().some(function debugging(record: EvidenceRecord): boolean {
                return record.category === "debugging" && record.outcome === "success";
            }),
            teammateHelped: false,
        };
        const newAchievements = earnedAchievements(
            achievementDefinitions,
            progress().achievements.map(function idOf(item: AchievementRecord): string {
                return item.achievementId;
            }),
            context,
        );
        if (newAchievements.length > 0) {
            const now = new Date().toISOString();
            const records: AchievementRecord[] = newAchievements.map(function record(achievement): AchievementRecord {
                return { achievementId: achievement.id, earnedAt: now };
            });
            const next: LocalProgress = {
                ...progress(),
                achievements: [...progress().achievements, ...records],
            };
            setProgress(next);
            await saveProgress(db, next);
        }
        return newAchievements;
    }

    async function completeMission(
        mission: Mission,
        attemptId: string,
        hintsByStep: Readonly<Record<string, number>>,
    ): Promise<CompletionOutcome> {
        const id = completionRowId(mission.id, mission.version);
        const existing = await db.completions.get(id);
        if (existing !== undefined) {
            return {
                alreadyCompleted: true,
                experience: 0,
                independent: existing.independent,
                newAchievements: [],
                worldChanged: false,
            };
        }

        const hints = Object.values(hintsByStep);
        const independent = hints.every(function noHelp(value: number): boolean {
            return value === 0;
        });
        const reward = completionReward(mission, independent);
        const now = new Date();
        const today = todayKey();

        const previousStreak: StreakRecord = {
            streakDays: progress().streakDays,
            longestStreak: progress().longestStreak,
            ...(progress().lastPracticeOn === undefined ? {} : { lastPracticeOn: progress().lastPracticeOn }),
        };
        const streak = recordPractice(previousStreak, today);
        const experience = progress().experience + reward.experience;
        const nextProgress: LocalProgress = {
            ...progress(),
            experience,
            level: levelForExperience(experience),
            streakDays: streak.streakDays,
            longestStreak: streak.longestStreak,
            lastPracticeOn: today,
        };
        setProgress(nextProgress);
        await saveProgress(db, nextProgress);

        for (const skillId of mission.skills) {
            const existingSchedule = reviews().find(function match(item: ReviewItem): boolean {
                return item.skillId === skillId;
            });
            const nextSchedule =
                existingSchedule === undefined
                    ? scheduler.create(skillId, now, "success")
                    : scheduler.update(existingSchedule, "success", now);
            await db.reviews.put(nextSchedule);
        }
        const refreshedReviews = await db.reviews.toArray();
        setReviews(refreshedReviews);

        let nextWorld = world();
        let worldChanged = false;
        if (mission.persistence.kind === "world-action" && mission.persistence.action !== undefined) {
            const action: WorldAction = {
                id: mission.persistence.action,
                ...(mission.persistence.system === undefined ? {} : { systemId: mission.persistence.system }),
            };
            const expectedVersion = nextWorld.version;
            const result = applyWorldAction(nextWorld, action);
            nextWorld = result.state;
            worldChanged = result.changed;
            setWorld(nextWorld);
            await saveWorld(db, nextWorld);
            await queueOperation(db, {
                kind: "world-action",
                operationId: `world:${mission.id}:${mission.version}`,
                expectedVersion,
                action,
            });
        }

        const completion: CompletionRow = {
            id,
            missionId: mission.id,
            version: mission.version,
            attemptId,
            completedAt: now.toISOString(),
            independent,
        };
        await db.completions.put(completion);
        setCompletions([...completions(), completion]);

        await queueOperation(db, {
            kind: "mission-completion",
            operationId: `completion:${mission.id}:${mission.version}`,
            missionId: mission.id,
            missionVersion: mission.version,
            attemptId,
            independent,
            completedAt: now.toISOString(),
        });

        const newAchievements = await refreshAchievements();
        setOutboxCount(await db.outbox.count());
        if (preferences().sound) {
            playCompletionTone();
        }
        if (user() !== undefined) {
            await syncNow();
        }

        return {
            alreadyCompleted: false,
            experience: reward.experience,
            independent,
            newAchievements,
            worldChanged,
        };
    }

    async function recordPracticeReview(mission: Mission): Promise<void> {
        const firstStep = mission.steps[0];
        if (firstStep === undefined) {
            return;
        }
        const reviewDraft = buildEvidenceDraft({
            id: crypto.randomUUID(),
            mission,
            step: firstStep,
            evaluation: {
                stepId: firstStep.id,
                passed: true,
                score: 1,
                detail: "Independent practice review completed.",
            },
            hintsUsed: 0,
            now: new Date(),
            category: "review",
            detail: "Spaced practice revisit.",
        });
        const expanded = [...expandEvidenceSkills(skillGraph, mission.skills).keys()];
        await persistEvidence({ ...reviewDraft, skills: expanded });

        const now = new Date();
        for (const skillId of mission.skills) {
            const existingSchedule = reviews().find(function match(item: ReviewItem): boolean {
                return item.skillId === skillId;
            });
            const nextSchedule =
                existingSchedule === undefined
                    ? scheduler.create(skillId, now, "success")
                    : scheduler.update(existingSchedule, "success", now);
            await db.reviews.put(nextSchedule);
        }
        const refreshedReviews = await db.reviews.toArray();
        setReviews(refreshedReviews);
        if (user() !== undefined) {
            await syncNow();
        }
    }

    async function recordProjectCompletion(project: ProjectDefinition, passedStages: number): Promise<CompletionOutcome> {
        if (completedProjectIds().includes(project.id)) {
            return {
                alreadyCompleted: true,
                experience: 0,
                independent: true,
                newAchievements: [],
                worldChanged: false,
            };
        }
        const nextProjects = [...new Set([...completedProjectIds(), project.id])];
        setCompletedProjectIds(nextProjects);
        await db.meta.put({ key: "projects-completed", value: JSON.stringify(nextProjects) });

        const now = new Date().toISOString();
        const expanded = [...expandEvidenceSkills(skillGraph, project.skills).keys()];
        const evidenceDraft: EvidenceRecord = {
            id: crypto.randomUUID(),
            missionId: project.id,
            missionVersion: 1,
            category: "construction",
            outcome: "success",
            assistance: "independent",
            independence: 1,
            createdAt: now,
            detail: `Completed ${passedStages} project stages with working checks.`,
            skills: expanded,
        };
        await persistEvidence(evidenceDraft);

        const experience = progress().experience + 200;
        const nextProgress: LocalProgress = {
            ...progress(),
            experience,
            level: levelForExperience(experience),
        };
        setProgress(nextProgress);
        await saveProgress(db, nextProgress);

        const newAchievements = await refreshAchievements();
        return {
            alreadyCompleted: false,
            experience: 200,
            independent: true,
            newAchievements,
            worldChanged: false,
        };
    }

    async function savePreferences(next: Preferences): Promise<void> {
        setPreferences(next);
        applyPresentation(next);
        await savePreferencesRow(db, next);
        await queueOperation(db, {
            kind: "preferences",
            operationId: `preferences:${crypto.randomUUID()}`,
            preferences: next,
        });
        setOutboxCount(await db.outbox.count());
        if (user() !== undefined) {
            await syncNow();
        }
    }

    async function applyPlacementState(state: PlacementState): Promise<void> {
        const next: LocalProgress = {
            ...progress(),
            placementSkippedSkills: [...state.skippedSkills],
        };
        setProgress(next);
        await saveProgress(db, next);
        setPlacement(state);
        await db.meta.put({ key: "placement", value: JSON.stringify(state) });
    }

    async function setOnboarded(value: boolean): Promise<void> {
        setOnboardedSignal(value);
        await db.meta.put({ key: "onboarded", value: value ? "true" : "false" });
    }

    function practicePlan(length: SessionLength): PracticePlan {
        const masteryScores: Record<string, number> = {};
        for (const [skillId, snapshot] of Object.entries(mastery())) {
            masteryScores[skillId] = snapshot.score;
        }
        return buildPracticePlan(
            {
                graph: skillGraph,
                missions,
                mastery: masteryScores,
                reviews: reviews(),
                interests: preferences().interests,
                challenge: preferences().challenge as ChallengeLevel,
                completedMissionIds: [...completedMissionIds()],
                completedSequences: {},
                misconceptionSkills: [],
                recentFailureSkills: [],
                skippedSkills: progress().placementSkippedSkills,
                now: new Date(),
                variationSeed: Math.floor(Date.now() / 86_400_000),
            },
            length,
        );
    }

    async function performWorldAction(action: WorldAction): Promise<WorldState> {
        const current = world();
        const expectedVersion = current.version;
        const result = applyWorldAction(current, action);
        setWorld(result.state);
        await saveWorld(db, result.state);
        await queueOperation(db, {
            kind: "world-action",
            operationId: `world-action:${crypto.randomUUID()}`,
            expectedVersion,
            action,
        });
        setOutboxCount(await db.outbox.count());
        if (user() !== undefined) {
            await syncNow();
        }
        return result.state;
    }

    async function syncNow(): Promise<void> {
        if (user() === undefined) {
            setOutboxCount(await db.outbox.count());
            return;
        }
        setSyncStatus("pending");
        const result = await syncManager.flush(50);
        if (result.status === "offline") {
            setSyncStatus("offline");
            return;
        }
        if (result.status === "unauthenticated") {
            setUser(undefined);
            return;
        }
        await reloadLocalState();
        if (result.status === "partial") {
            setSyncStatus("conflict");
            setSyncMessage(
                "This device and your account changed the same state. The account version is now shown. Your queued change was not applied.",
            );
            return;
        }
        if (result.status === "failed") {
            setSyncStatus("failed");
            setSyncMessage(result.message ?? "Sync failed. Progress remains on this device.");
            return;
        }
        setSyncStatus("synced");
        setSyncMessage(undefined);
    }

    async function login(handle: string, password: string): Promise<void> {
        const response = await api.login({ handle, password });
        setUser(response.user);
        setPreferences(response.preferences);
        applyPresentation(response.preferences);
        await syncNow();
        await hydrateAuthenticated();
    }

    async function register(handle: string, password: string): Promise<void> {
        const response = await api.register({ handle, password });
        setUser(response.user);
        setPreferences(response.preferences);
        applyPresentation(response.preferences);
        await syncNow();
        await hydrateAuthenticated();
    }

    async function clearLocalAccountData(): Promise<void> {
        await db.transaction(
            "rw",
            [db.progress, db.evidence, db.mastery, db.reviews, db.world, db.outbox, db.completions, db.preferences, db.attempts],
            async function clearTables(): Promise<void> {
                await Promise.all([
                    db.progress.clear(),
                    db.evidence.clear(),
                    db.mastery.clear(),
                    db.reviews.clear(),
                    db.world.clear(),
                    db.outbox.clear(),
                    db.completions.clear(),
                    db.preferences.clear(),
                    db.attempts.clear(),
                ]);
            },
        );
        setUser(undefined);
        setProgress(defaultProgress());
        setMastery({});
        setReviews([]);
        setCompletions([]);
        setEvidence([]);
        setWorld(createInitialWorld());
        setPreferences(DEFAULT_PREFERENCES);
        applyPresentation(DEFAULT_PREFERENCES);
        await saveWorld(db, createInitialWorld());
        await saveProgress(db, defaultProgress());
        setOutboxCount(0);
        setSyncStatus("idle");
    }

    async function logout(): Promise<void> {
        await api.logout();
        await clearLocalAccountData();
    }

    async function deleteAccount(): Promise<void> {
        await api.deleteAccount();
        await clearLocalAccountData();
    }

    async function exportData(): Promise<void> {
        const bundle = await api.exportData();
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `praxbit-export-${todayKey()}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    async function refreshWorld(): Promise<void> {
        const response = await api.getWorld();
        setWorld(response.world);
        await saveWorld(db, response.world);
    }

    async function saveProjectDraft(projectId: string, files: Readonly<Record<string, string>>): Promise<void> {
        const existing = await db.projects.get(projectId);
        await db.projects.put({
            id: projectId,
            files,
            revision: existing?.revision ?? 0,
            updatedAt: new Date().toISOString(),
        });
    }

    async function loadProjectDraft(projectId: string): Promise<Readonly<Record<string, string>> | undefined> {
        const row = await db.projects.get(projectId);
        return row?.files;
    }

    const value: LearningContextValue = {
        ready,
        user,
        preferences,
        progress,
        mastery,
        reviews,
        dueReviews,
        world,
        completions,
        completedMissionIds,
        completedProjectIds,
        recommendationId: function recommendationId(): string | undefined {
            const result = recommendation();
            return result.id.length === 0 ? undefined : result.id;
        },
        recommendationReasons: function recommendationReasons(): readonly string[] {
            return recommendation().reasons;
        },
        onboarded,
        placement,
        syncStatus,
        syncMessage,
        outboxCount,
        online,
        recordStepEvidence,
        completeMission,
        recordPracticeReview,
        recordProjectCompletion,
        savePreferences,
        applyPlacement: applyPlacementState,
        setOnboarded,
        practicePlan,
        performWorldAction,
        syncNow,
        login,
        register,
        logout,
        deleteAccount,
        exportData,
        refreshWorld,
        saveProjectDraft,
        loadProjectDraft,
    };

    return <LearningContext.Provider value={value}>{props.children}</LearningContext.Provider>;
}

export function useLearning(): LearningContextValue {
    const value = useContext(LearningContext);
    if (value === undefined) {
        throw new Error("useLearning must be used inside LearningProvider.");
    }
    return value;
}
