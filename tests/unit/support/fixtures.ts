import type {
    EvidenceCategory,
    EvidenceSubmission,
    Mission,
    MissionStep,
    SkillDefinition,
    SkillGraphDocument,
} from "../../../packages/contracts/src/index.ts";

export function makeSkill(
    id: string,
    parents: readonly string[] = [],
    kind: SkillDefinition["kind"] = "concept",
): SkillDefinition {
    return {
        id,
        name: id,
        description: `Skill ${id}`,
        kind,
        parents: [...parents],
        interests: ["everything"],
    };
}

export function makeSkillDocument(skills: readonly SkillDefinition[]): SkillGraphDocument {
    return { version: 1, skills: [...skills] };
}

export function makeQuizStep(id: string): MissionStep {
    return {
        kind: "quiz",
        id,
        title: `Step ${id}`,
        prompt: "Choose the accurate answer.",
        quiz: {
            prompt: "Which statement is accurate?",
            options: [
                { id: "correct", label: "The accurate statement." },
                { id: "wrong", label: "The inaccurate statement." },
            ],
            correctId: "correct",
            explanation: "The accurate statement is correct.",
        },
    };
}

export function makeMission(overrides: Partial<Mission> = {}): Mission {
    const base: Mission = {
        id: "campus.test-mission",
        version: 1,
        sequence: 1,
        courseId: "campus",
        title: "Test mission",
        summary: "A mission used by unit tests.",
        skills: ["concept.testing"],
        prerequisites: [],
        difficulty: "developing",
        estimatedMinutes: 5,
        interaction: "quiz",
        runtime: { kind: "none", capabilities: ["guided-simulation"] },
        scenario: {
            world: "campus",
            system: "storefront",
            initialState: "test",
            briefing: "A test briefing.",
        },
        objectives: [{ id: "objective", description: "Complete the step.", stepIds: ["answer"] }],
        assets: ["pip:thinking", "scene:campus", "system:storefront", "icon:test"],
        hints: ["Hint one.", "Hint two.", "Hint three.", "Hint four."],
        misconceptions: [
            {
                id: "misconception-one",
                description: "A first misconception.",
                stepId: "answer",
                feedback: "Feedback for the first misconception.",
            },
            {
                id: "misconception-two",
                description: "A second misconception.",
                stepId: "answer",
                feedback: "Feedback for the second misconception.",
            },
        ],
        lesson: {
            sections: [{ title: "Lesson", body: "A short explanation." }],
            vocabulary: [{ term: "Term", definition: "A definition." }],
        },
        steps: [makeQuizStep("answer")],
        evaluation: { kind: "steps", passScore: 1 },
        rewards: { experience: 100, unlocks: [] },
        persistence: { kind: "none" },
        accessibility: {
            summary: "Accessible by keyboard.",
            keyboardNotes: "Use Tab and Enter.",
            screenReaderNotes: "Each option is announced.",
        },
        license: "Test license",
        tags: ["everything"],
    };
    return { ...base, ...overrides };
}

export function makeEvidence(overrides: Partial<EvidenceSubmission> = {}): EvidenceSubmission {
    return {
        id: "evidence-0001",
        missionId: "campus.test-mission",
        missionVersion: 1,
        category: "construction",
        outcome: "success",
        assistance: "independent",
        independence: 1,
        createdAt: "2026-10-01T00:00:00.000Z",
        ...overrides,
    };
}

export function categoryEvidence(
    category: EvidenceCategory,
    assistance: EvidenceSubmission["assistance"],
    outcome: EvidenceSubmission["outcome"],
    index: number,
): EvidenceSubmission {
    return makeEvidence({
        id: `evidence-${category}-${index}`,
        category,
        assistance,
        outcome,
        independence: assistance === "independent" ? 1 : 0.5,
        createdAt: `2026-10-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    });
}
