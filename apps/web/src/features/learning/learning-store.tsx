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
    demonstratedLanguages,
    earnedAchievements,
    expandEvidenceSkills,
    isWorldRecovered,
    levelForExperience,
    practiceResult,
    recordPractice,
    recommendMission,
    type MissionEvaluation,
    type PracticePlan,
    type RecommendationContext,
    type SessionLength,
    type StepEvaluation,
    type StreakRecord,
    type WorldActionResult,
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
    readonly evidence: Accessor<readonly EvidenceRecord[]>;
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
    readonly conflictCount: Accessor<number>;
    readonly online: Accessor<boolean>;
    readonly aiTutorAvailable: Accessor<boolean>;
    readonly recordStepEvidence: (
        mission: Mission,
        step: MissionStep,
        evaluation: StepEvaluation,
        hintsUsed: number,
    ) => Promise<void>;
    readonly completeMission: (
        mission: Mission,
        attemptId: string,
        hintsByStep: Readonly<Record<string, number>>,
        evaluation?: MissionEvaluation,
    ) => Promise<CompletionOutcome>;
    readonly recordPracticeReview: (
        mission: Mission,
        evaluation: MissionEvaluation,
        hintsByStep: Readonly<Record<string, number>>,
    ) => Promise<void>;
    readonly recordProjectCompletion: (
        project: ProjectDefinition,
        passedStages: number,
    ) => Promise<CompletionOutcome>;
    readonly savePreferences: (next: Preferences) => Promise<void>;
    readonly applyPlacement: (state: PlacementState) => Promise<void>;
    readonly setOnboarded: (value: boolean) => Promise<void>;
    readonly practicePlan: (length: SessionLength) => PracticePlan;
    readonly performWorldAction: (action: WorldAction) => Promise<WorldActionResult>;
    readonly syncNow: () => Promise<void>;
    readonly retryConflicts: () => Promise<void>;
    readonly discardConflicts: () => Promise<void>;
    readonly login: (handle: string, password: string) => Promise<void>;
    readonly register: (handle: string, password: string) => Promise<void>;
    readonly logout: () => Promise<void>;
    readonly deleteAccount: () => Promise<void>;
    readonly exportData: () => Promise<void>;
    readonly refreshWorld: () => Promise<void>;
    readonly saveProjectDraft: (
        projectId: string,
        files: Readonly<Record<string, string>>,
        revision?: number,
    ) => Promise<void>;
    readonly loadProjectDraft: (
        projectId: string,
    ) => Promise<Readonly<Record<string, string>> | undefined>;
    readonly loadProjectRevision: (projectId: string) => Promise<number | undefined>;
    readonly queueProjectRevision: (
        projectId: string,
        files: Readonly<Record<string, string>>,
        baseRevision: number,
        message: string,
    ) => Promise<void>;
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

function evidenceWeight(record: EvidenceRecord, skillId: string): number {
    const mission = getMission(record.missionId);
    const fullSkills =
        mission?.skills ??
        projects.find(function match(project): boolean {
            return project.id === record.missionId;
        })?.skills ??
        [];
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
    const [conflictCount, setConflictCount] = createSignal(0);
    const [online, setOnline] = createSignal(
        typeof navigator === "undefined" ? true : navigator.onLine,
    );
    const [aiTutorAvailable, setAiTutorAvailable] = createSignal(false);

    const completedMissionIds = createMemo(function completedSet(): ReadonlySet<string> {
        return new Set(
            completions().map(function idOf(item: CompletionRow): string {
                return item.missionId;
            }),
        );
    });

    const dueReviews = createMemo(function dueNow(): readonly ReviewItem[] {
        return scheduler.due(reviews(), new Date());
    });

    const recommendationContext = createMemo(
        function buildRecommendationContext(): RecommendationContext {
            const completedSequences: Record<string, number> = {};
            for (const completion of completions()) {
                const mission = getMission(completion.missionId);
                if (mission !== undefined) {
                    completedSequences[mission.courseId] = Math.max(
                        completedSequences[mission.courseId] ?? 0,
                        mission.sequence,
                    );
                }
            }
            const misconceptionSkills = new Set<string>();
            const failureSkills = new Set<string>();
            for (const record of evidence()) {
                if (record.outcome !== "failure") {
                    continue;
                }
                const mission = getMission(record.missionId);
                if (mission === undefined) {
                    continue;
                }
                for (const skillId of mission.skills) {
                    failureSkills.add(skillId);
                }
                for (const misconception of mission.misconceptions) {
                    if (misconception.stepId !== record.stepId) {
                        continue;
                    }
                    if (misconception.followUpSkill !== undefined) {
                        misconceptionSkills.add(misconception.followUpSkill);
                    } else {
                        for (const skillId of mission.skills) {
                            misconceptionSkills.add(skillId);
                        }
                    }
                }
            }
            const masteryScores: Record<string, number> = {};
            for (const [skillId, snapshot] of Object.entries(mastery())) {
                masteryScores[skillId] = snapshot.score;
            }
            return {
                graph: skillGraph,
                missions,
                mastery: masteryScores,
                reviews: reviews(),
                interests: preferences().interests,
                challenge: preferences().challenge,
                completedMissionIds: [...completedMissionIds()],
                completedMissionSkills: [...completedMissionIds()].flatMap(
                    function skillsOf(missionId): readonly string[] {
                        return getMission(missionId)?.skills ?? [];
                    },
                ),
                completedSequences,
                misconceptionSkills: [...misconceptionSkills],
                recentFailureSkills: [...failureSkills],
                skippedSkills: progress().placementSkippedSkills,
                now: new Date(),
                variationSeed: Math.floor(Date.now() / 86_400_000),
            };
        },
    );

    const recommendation = createMemo(function recommend(): {
        id: string;
        reasons: readonly string[];
    } {
        const recommendationResult = recommendMission(recommendationContext());
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
        root.dataset["textScale"] =
            next.textScale >= 1.2 ? "large" : next.textScale <= 0.95 ? "small" : "normal";
        root.dataset["motion"] = next.motion;
    }

    async function refreshConflictState(): Promise<void> {
        const conflicts = await syncManager.listConflicts();
        setConflictCount(conflicts.length);
    }

    async function reloadLocalState(): Promise<void> {
        const [
            progressRow,
            evidenceRows,
            masteryRows,
            reviewRows,
            worldRow,
            preferenceRow,
            completionRows,
            metaRows,
        ] = await Promise.all([
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
            Object.fromEntries(
                masteryRows.map(function entry(snapshot): [string, SkillMastery] {
                    return [snapshot.skillId, snapshot];
                }),
            ),
        );
        setReviews(reviewRows);
        setWorld(worldRow?.state ?? createInitialWorld());
        setPreferences(preferenceRow);
        applyPresentation(preferenceRow);
        setCompletions(completionRows);

        const meta = new Map(
            metaRows.map(function entry(row): [string, string] {
                return [row.key, row.value];
            }),
        );
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
                    setCompletedProjectIds(
                        parsed.filter(function isString(value): value is string {
                            return typeof value === "string";
                        }),
                    );
                }
            } catch {
                setCompletedProjectIds([]);
            }
        }
        setOutboxCount(await db.outbox.count());
        await refreshConflictState();
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
            const completionRows: CompletionRow[] = me.completions.map(
                function toRow(completion): CompletionRow {
                    return {
                        id: completionRowId(completion.missionId, completion.missionVersion),
                        missionId: completion.missionId,
                        version: completion.missionVersion,
                        attemptId: completion.attemptId,
                        completedAt: completion.completedAt,
                        independent: completion.independent,
                    };
                },
            );
            await db.completions.bulkPut(completionRows);
            await syncManager.flush(50);
            const snapshot = await api.sync({ operations: [] });
            await applySyncSnapshot(db, snapshot);
            await reloadLocalState();
            if (conflictCount() > 0) {
                setSyncStatus("conflict");
                setSyncMessage(
                    `${String(conflictCount())} local change${conflictCount() === 1 ? "" : "s"} could not be applied to the account. The local change is kept on this device for review.`,
                );
                return;
            }
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
            setSyncMessage(
                error instanceof Error ? error.message : "Could not load account progress.",
            );
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

    async function loadCapabilities(): Promise<void> {
        try {
            const capabilities = await api.requestCapabilities();
            setAiTutorAvailable(capabilities.aiTutor);
        } catch {
            setAiTutorAvailable(false);
        }
    }

    onMount(function mount(): void {
        void initialize();
        void loadCapabilities();
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

    async function recomputeMastery(
        rows: readonly EvidenceRecord[],
        affected: readonly string[],
    ): Promise<void> {
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
        options?: {
            readonly attemptId?: string;
            readonly categoryOverride?: "testing" | "transfer";
        },
    ): Promise<void> {
        const draft = buildEvidenceDraft({
            id: crypto.randomUUID(),
            mission,
            step,
            evaluation,
            hintsUsed,
            now: new Date(),
            ...(options?.attemptId === undefined ? {} : { attemptId: options.attemptId }),
            ...(options?.categoryOverride === undefined
                ? {}
                : { category: options.categoryOverride }),
        });
        const expanded = [...expandEvidenceSkills(skillGraph, mission.skills).keys()];
        await persistEvidence({ ...draft, skills: expanded });

        if (
            step.kind === "machine" &&
            evaluation.passed &&
            options?.categoryOverride === undefined
        ) {
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
            languagesDemonstrated: demonstratedLanguages(evidence()),
            hiddenBoundaryFound: evidence().some(function boundary(
                record: EvidenceRecord,
            ): boolean {
                return record.category === "testing" && record.outcome === "success";
            }),
            difficultDebuggingRecovered: evidence().some(function debugging(
                record: EvidenceRecord,
            ): boolean {
                return record.category === "debugging" && record.outcome === "success";
            }),
            cooperativeChallengeCompleted: false,
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
            const records: AchievementRecord[] = newAchievements.map(
                function record(achievement): AchievementRecord {
                    return { achievementId: achievement.id, earnedAt: now };
                },
            );
            const next: LocalProgress = {
                ...progress(),
                achievements: [...progress().achievements, ...records],
            };
            setProgress(next);
            await saveProgress(db, next);
            if (user() !== undefined) {
                await queueProgressSnapshot();
            }
        }
        return newAchievements;
    }

    async function queueProgressSnapshot(): Promise<void> {
        const current = progress();
        await queueOperation(db, {
            kind: "progress",
            operationId: `progress:${crypto.randomUUID()}`,
            experience: current.experience,
            streakDays: current.streakDays,
            longestStreak: current.longestStreak,
            ...(current.lastPracticeOn === undefined
                ? {}
                : { lastPracticeOn: current.lastPracticeOn }),
            placementSkippedSkills: [...current.placementSkippedSkills],
            achievements: current.achievements.map(function idOf(record): string {
                return record.achievementId;
            }),
        });
        setOutboxCount(await db.outbox.count());
    }

    async function completeMission(
        mission: Mission,
        attemptId: string,
        hintsByStep: Readonly<Record<string, number>>,
        evaluation?: MissionEvaluation,
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
        const independent =
            hints.every(function noHelp(value: number): boolean {
                return value === 0;
            }) &&
            (evaluation?.completed ?? true);
        const reward = completionReward(mission, independent);
        const now = new Date();
        const today = todayKey();

        const previousStreak: StreakRecord = {
            streakDays: progress().streakDays,
            longestStreak: progress().longestStreak,
            ...(progress().lastPracticeOn === undefined
                ? {}
                : { lastPracticeOn: progress().lastPracticeOn }),
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
            const reviewOutcome = independent ? "success" : "failure";
            const nextSchedule =
                existingSchedule === undefined
                    ? scheduler.create(skillId, now, reviewOutcome)
                    : scheduler.update(existingSchedule, reviewOutcome, now);
            await db.reviews.put(nextSchedule);
        }
        const refreshedReviews = await db.reviews.toArray();
        setReviews(refreshedReviews);

        let nextWorld = world();
        let worldChanged = false;
        if (
            mission.persistence.kind === "world-action" &&
            mission.persistence.action !== undefined
        ) {
            const action: WorldAction = {
                id: mission.persistence.action,
                ...(mission.persistence.system === undefined
                    ? {}
                    : { systemId: mission.persistence.system }),
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

    async function recordPracticeReview(
        mission: Mission,
        evaluation: MissionEvaluation,
        hintsByStep: Readonly<Record<string, number>>,
    ): Promise<void> {
        const firstStep = mission.steps[0];
        if (firstStep === undefined) {
            return;
        }
        const hintValues = Object.values(hintsByStep);
        const hintsUsed = hintValues.length === 0 ? 0 : Math.max(...hintValues);
        const result = practiceResult(evaluation, hintsByStep);
        const independent = result.independent;
        const outcome = result.outcome;
        const reviewDraft = buildEvidenceDraft({
            id: crypto.randomUUID(),
            mission,
            step: firstStep,
            evaluation: {
                stepId: firstStep.id,
                passed: independent,
                score: independent ? evaluation.score : 0,
                detail: independent
                    ? "Practice review completed without assistance."
                    : evaluation.completed
                      ? "Practice review used hints, so the schedule did not advance."
                      : `${String(evaluation.failedStepIds.length)} step${evaluation.failedStepIds.length === 1 ? "" : "s"} did not pass, so this review did not advance.`,
            },
            hintsUsed,
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
                    ? scheduler.create(skillId, now, outcome)
                    : scheduler.update(existingSchedule, outcome, now);
            await db.reviews.put(nextSchedule);
        }
        const refreshedReviews = await db.reviews.toArray();
        setReviews(refreshedReviews);
        if (user() !== undefined) {
            await syncNow();
        }
    }

    async function recordProjectCompletion(
        project: ProjectDefinition,
        passedStages: number,
    ): Promise<CompletionOutcome> {
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
        if (user() !== undefined) {
            await queueProgressSnapshot();
            await syncNow();
        }
    }

    async function setOnboarded(value: boolean): Promise<void> {
        setOnboardedSignal(value);
        await db.meta.put({ key: "onboarded", value: value ? "true" : "false" });
    }

    function practicePlan(length: SessionLength): PracticePlan {
        return buildPracticePlan(recommendationContext(), length);
    }

    async function performWorldAction(action: WorldAction): Promise<WorldActionResult> {
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
        return result;
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
        if (conflictCount() > 0) {
            setSyncStatus("conflict");
            setSyncMessage(
                `${String(conflictCount())} local change${conflictCount() === 1 ? "" : "s"} could not be applied to the account. The local change is kept on this device. Retry after merging, or discard it deliberately.`,
            );
            return;
        }
        if (result.status === "partial") {
            setSyncStatus("conflict");
            setSyncMessage(
                `${String(conflictCount())} local change${conflictCount() === 1 ? "" : "s"} could not be applied to the account. The local change is kept on this device. Retry after merging, or discard it deliberately.`,
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

    async function retryConflicts(): Promise<void> {
        await syncManager.retryConflicts();
        await syncNow();
        await refreshConflictState();
    }

    async function discardConflicts(): Promise<void> {
        await syncManager.discardConflicts();
        await refreshConflictState();
        setSyncStatus(conflictCount() > 0 ? "conflict" : "synced");
        setSyncMessage(undefined);
    }

    async function login(handle: string, password: string): Promise<void> {
        const response = await api.login({ handle, password });
        setUser(response.user);
        setPreferences(response.preferences);
        applyPresentation(response.preferences);
        await syncManager.migrateGuestProgress();
        await hydrateAuthenticated();
    }

    async function register(handle: string, password: string): Promise<void> {
        const response = await api.register({ handle, password });
        setUser(response.user);
        setPreferences(response.preferences);
        applyPresentation(response.preferences);
        await syncManager.migrateGuestProgress();
        await hydrateAuthenticated();
    }

    async function clearLocalAccountData(): Promise<void> {
        await db.transaction(
            "rw",
            [
                db.progress,
                db.evidence,
                db.mastery,
                db.reviews,
                db.world,
                db.outbox,
                db.completions,
                db.preferences,
                db.attempts,
                db.projects,
                db.drafts,
                db.meta,
            ],
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
                    db.projects.clear(),
                    db.drafts.clear(),
                    db.meta.clear(),
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
        setCompletedProjectIds([]);
        setPlacement(undefined);
        setOnboardedSignal(false);
        applyPresentation(DEFAULT_PREFERENCES);
        await saveWorld(db, createInitialWorld());
        await saveProgress(db, defaultProgress());
        setOutboxCount(0);
        setSyncStatus("idle");
        try {
            localStorage.removeItem("praxbit-account");
        } catch {
            // No stored marker to remove.
        }
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

    async function saveProjectDraft(
        projectId: string,
        files: Readonly<Record<string, string>>,
        revision?: number,
    ): Promise<void> {
        const existing = await db.projects.get(projectId);
        await db.projects.put({
            id: projectId,
            files,
            revision: revision ?? existing?.revision ?? 0,
            updatedAt: new Date().toISOString(),
        });
    }

    async function loadProjectDraft(
        projectId: string,
    ): Promise<Readonly<Record<string, string>> | undefined> {
        const row = await db.projects.get(projectId);
        return row?.files;
    }

    async function loadProjectRevision(projectId: string): Promise<number | undefined> {
        const row = await db.projects.get(projectId);
        return row?.revision;
    }

    async function queueProjectRevision(
        projectId: string,
        files: Readonly<Record<string, string>>,
        baseRevision: number,
        message: string,
    ): Promise<void> {
        await saveProjectDraft(projectId, files, baseRevision);
        await syncManager.queueProjectRevision({ projectId, files, baseRevision, message });
        setOutboxCount(await db.outbox.count());
        if (user() !== undefined) {
            await syncNow();
        }
    }

    const value: LearningContextValue = {
        ready,
        user,
        preferences,
        progress,
        mastery,
        evidence,
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
        conflictCount,
        online,
        aiTutorAvailable,
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
        retryConflicts,
        discardConflicts,
        login,
        register,
        logout,
        deleteAccount,
        exportData,
        refreshWorld,
        saveProjectDraft,
        loadProjectDraft,
        loadProjectRevision,
        queueProjectRevision,
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
