import type {
    AchievementRecord,
    CompletionRecord,
    Progress,
    ReviewItem,
    SkillMastery,
    WorldState,
} from "@praxbit/contracts";
import type { PraxbitDatabase } from "../persistence/index.ts";
import { loadProgress, saveProgress } from "../persistence/index.ts";

export async function setMastery(
    db: PraxbitDatabase,
    rows: readonly SkillMastery[],
): Promise<void> {
    await db.mastery.bulkPut(
        rows.map(function copy(row): SkillMastery {
            return { ...row };
        }),
    );
}

export async function setReviews(db: PraxbitDatabase, rows: readonly ReviewItem[]): Promise<void> {
    await db.reviews.bulkPut(
        rows.map(function copy(row): ReviewItem {
            return { ...row };
        }),
    );
}

export async function setProgress(db: PraxbitDatabase, progress: Progress): Promise<void> {
    await saveProgress(db, progress);
}

export async function setAchievements(
    db: PraxbitDatabase,
    achievements: readonly AchievementRecord[],
): Promise<void> {
    if (achievements.length === 0) {
        return;
    }
    const progress = await loadProgress(db);
    const existing = new Set(
        progress.achievements.map(function idOf(item): string {
            return item.achievementId;
        }),
    );
    const merged = [...progress.achievements];
    for (const achievement of achievements) {
        if (!existing.has(achievement.achievementId)) {
            merged.push(achievement);
        }
    }
    await saveProgress(db, { ...progress, achievements: merged });
}

export async function setWorld(db: PraxbitDatabase, state: WorldState): Promise<void> {
    await db.world.put({ id: "campus", state, updatedAt: new Date().toISOString() });
}

export async function setCompletions(
    db: PraxbitDatabase,
    completions: readonly CompletionRecord[],
): Promise<void> {
    if (completions.length === 0) {
        return;
    }
    await db.completions.bulkPut(
        completions.map(function toRow(completion): {
            id: string;
            missionId: string;
            version: number;
            attemptId: string;
            completedAt: string;
            independent: boolean;
        } {
            return {
                id: `${completion.missionId}@${completion.missionVersion}`,
                missionId: completion.missionId,
                version: completion.missionVersion,
                attemptId: completion.attemptId,
                completedAt: completion.completedAt,
                independent: completion.independent,
            };
        }),
    );
}
