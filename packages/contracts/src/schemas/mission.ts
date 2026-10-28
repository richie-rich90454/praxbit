import { z } from "zod";
import {
    DifficultySchema,
    EvidenceCategorySchema,
    InterestSchema,
    InteractionKindSchema,
    MissionIdSchema,
    RuntimeKindSchema,
    SkillIdSchema,
} from "./common.ts";
import type { EvaluatorKind, InteractionKind } from "./common.ts";
import { CodeTestSchema } from "./code.ts";
import { WorldActionIdSchema, WorldSystemIdSchema } from "./world.ts";

export const StepIdSchema = z.string().regex(/^[a-z0-9-]+$/, "Step ids use lowercase words");

const OptionSchema = z.strictObject({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(400),
});

export const QuizSchema = z.strictObject({
    prompt: z.string().min(1).max(600),
    options: z.array(OptionSchema).min(2).max(8),
    correctId: z.string().min(1),
    explanation: z.string().min(1).max(800),
});
export type QuizDefinition = z.infer<typeof QuizSchema>;

export const MachineSchema = z.strictObject({
    kind: z.enum(["dot-stamp", "uppercase", "even-gate", "sum", "greeting"]),
    inputs: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(40),
                label: z.string().min(1).max(80),
                type: z.enum(["number", "text"]),
                min: z.number().int().optional(),
                max: z.number().int().optional(),
                placeholder: z.string().max(80).optional(),
            }),
        )
        .min(1)
        .max(2),
    outputLabel: z.string().min(1).max(80),
    minRuns: z.number().int().min(1).max(6),
});
export type MachineDefinition = z.infer<typeof MachineSchema>;

const stepBase = {
    id: StepIdSchema,
    title: z.string().min(1).max(160),
    prompt: z.string().min(1).max(1400),
    evidence: EvidenceCategorySchema.optional(),
    hints: z.array(z.string().min(1).max(700)).length(4).optional(),
};

const QuizStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("quiz"),
    quiz: QuizSchema,
});

const LessonStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("lesson"),
    sections: z
        .array(
            z.strictObject({
                title: z.string().min(1).max(120),
                body: z.string().min(1).max(1800),
            }),
        )
        .min(1),
    vocabulary: z
        .array(
            z.strictObject({
                term: z.string().min(1).max(60),
                definition: z.string().min(1).max(400),
            }),
        )
        .min(1),
});

const MachineStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("machine"),
    machine: MachineSchema,
    prediction: QuizSchema,
    transfer: QuizSchema,
});

const OrderStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("order"),
    items: z
        .array(z.strictObject({ id: z.string().min(1).max(80), label: z.string().min(1).max(300) }))
        .min(3)
        .max(8),
    correctOrder: z.array(z.string().min(1)).min(3).max(8),
    explanation: z.string().min(1).max(900),
});

const StateStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("state"),
    cells: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(60),
                label: z.string().min(1).max(120),
                initial: z.string().max(200),
            }),
        )
        .min(1)
        .max(4),
    operations: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(80),
                label: z.string().min(1).max(200),
                effects: z.record(z.string(), z.string()),
            }),
        )
        .min(2)
        .max(6),
    target: z.record(z.string(), z.string()),
    explanation: z.string().min(1).max(900),
});

const RuleStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("rule"),
    inputs: z
        .array(z.strictObject({ id: z.string().min(1), label: z.string().min(1).max(200) }))
        .min(2)
        .max(6),
    rules: z
        .array(z.strictObject({ id: z.string().min(1), label: z.string().min(1).max(300) }))
        .min(2)
        .max(5),
    expected: z
        .array(
            z.strictObject({
                inputId: z.string().min(1),
                outcome: z.enum(["allow", "reject"]),
            }),
        )
        .min(2),
    correctRuleId: z.string().min(1),
    explanation: z.string().min(1).max(900),
});

const LoopStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("loop"),
    repeatChoices: z.array(z.number().int().min(1).max(12)).min(2).max(6),
    correctRepeat: z.number().int().min(1).max(12),
    bodyItems: z
        .array(z.strictObject({ id: z.string().min(1), label: z.string().min(1).max(200) }))
        .min(2)
        .max(5),
    correctBody: z.array(z.string().min(1)).min(2).max(5),
    explanation: z.string().min(1).max(900),
});

const TraceStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("trace"),
    lines: z
        .array(z.strictObject({ id: z.string().min(1), code: z.string().min(1).max(160) }))
        .min(3)
        .max(12),
    watches: z
        .array(
            z.strictObject({
                id: z.string().min(1),
                label: z.string().min(1).max(60),
                initial: z.string().max(100),
            }),
        )
        .min(1)
        .max(4),
    snapshots: z
        .array(
            z.strictObject({
                lineId: z.string().min(1),
                values: z.record(z.string(), z.string()),
                note: z.string().max(400).optional(),
            }),
        )
        .min(2),
    explanation: z.string().min(1).max(900),
});

const DebugStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("debug"),
    instructions: z
        .array(z.strictObject({ id: z.string().min(1), label: z.string().min(1).max(240) }))
        .min(3)
        .max(8),
    buggyId: z.string().min(1),
    fixes: z
        .array(z.strictObject({ id: z.string().min(1), label: z.string().min(1).max(300) }))
        .min(2)
        .max(5),
    correctFixId: z.string().min(1),
    explanation: z.string().min(1).max(900),
});

const BinaryStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("binary"),
    message: z.string().min(1).max(12),
    bitsPerChar: z.literal(8),
    expectedBits: z.string().regex(/^[01]+$/),
    reference: z
        .array(
            z.strictObject({ char: z.string().min(1).max(1), bits: z.string().regex(/^[01]{8}$/) }),
        )
        .min(2),
    explanation: z.string().min(1).max(900),
});

const FilesystemStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("filesystem"),
    nodes: z
        .array(
            z.strictObject({
                path: z.string().min(1).max(240),
                type: z.enum(["folder", "file"]),
                note: z.string().max(240).optional(),
            }),
        )
        .min(3)
        .max(30),
    targetPath: z.array(z.string().min(1)).min(2),
    explanation: z.string().min(1).max(900),
});

const NetworkStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("network"),
    nodes: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(60),
                label: z.string().min(1).max(120),
                kind: z.enum(["device", "router", "server", "service", "database"]),
            }),
        )
        .min(3)
        .max(10),
    edges: z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(2),
    startId: z.string().min(1),
    targetId: z.string().min(1),
    goal: z.string().min(1).max(300),
    correctPath: z.array(z.string().min(1)).min(2),
    explanation: z.string().min(1).max(900),
});

const ReviewStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("review"),
    artifact: z.strictObject({
        title: z.string().min(1).max(160),
        caption: z.string().min(1).max(400),
        kind: z.enum(["code", "diff", "report"]),
        language: z.string().min(1).max(40),
        content: z.string().min(1).max(6000),
    }),
    findings: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(80),
                label: z.string().min(1).max(300),
                correct: z.boolean(),
            }),
        )
        .min(2)
        .max(6),
    verdicts: z.array(OptionSchema).min(2).max(4),
    correctVerdict: z.string().min(1),
    explanation: z.string().min(1).max(1200),
});

const CodeStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("code"),
    language: z.enum(["javascript", "typescript", "html", "css", "json", "python", "sql", "text"]),
    files: z
        .array(
            z.strictObject({
                path: z.string().min(1).max(200),
                content: z.string().max(30_000),
                editable: z.boolean(),
                language: z.string().min(1).max(40),
            }),
        )
        .min(1)
        .max(6),
    entry: z.string().min(1).max(200),
    preview: z.enum(["html", "css", "console", "sql", "none"]),
    tests: z.array(CodeTestSchema).min(1).max(12),
    database: z
        .strictObject({
            schemaSql: z.string().min(1).max(6000),
            seedSql: z.string().max(6000),
        })
        .optional(),
});

export const GitSeedCommitSchema = z.strictObject({
    message: z.string().min(1).max(160),
    files: z.record(z.string().min(1).max(200), z.string().max(20_000)),
});

const GitStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("git"),
    initialBranch: z.string().min(1).max(80),
    seedCommits: z.array(GitSeedCommitSchema).min(1).max(8),
    extraBranches: z
        .array(
            z.strictObject({
                name: z.string().min(1).max(80),
                from: z.string().min(1).max(80),
                commits: z.array(GitSeedCommitSchema).min(1).max(6),
            }),
        )
        .max(3),
    checks: z.strictObject({
        branch: z.string().min(1).max(80).optional(),
        fileIncludes: z
            .record(z.string().min(1).max(200), z.array(z.string().min(1).max(500)))
            .optional(),
        fileExcludes: z
            .record(z.string().min(1).max(200), z.array(z.string().min(1).max(200)))
            .optional(),
        logIncludes: z.array(z.string().min(1).max(160)).max(6).optional(),
        mergeCommit: z.boolean().optional(),
    }),
    explanation: z.string().min(1).max(1200),
});

const TerminalCheckSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("service"),
        serviceId: z.string().min(1).max(80),
        status: z.enum(["running", "failed"]),
    }),
    z.strictObject({
        kind: z.literal("file-mode"),
        path: z.string().min(1).max(240),
        mode: z.string().regex(/^[0-7]{3,4}$/),
    }),
    z.strictObject({
        kind: z.literal("symlink"),
        path: z.string().min(1).max(240),
        target: z.string().min(1).max(240),
    }),
    z.strictObject({
        kind: z.literal("command-output"),
        contains: z.string().min(1).max(200),
    }),
]);
export type TerminalCheck = z.infer<typeof TerminalCheckSchema>;

const TerminalStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("terminal"),
    initial: z.strictObject({
        cwd: z.string().min(1).max(240),
        files: z
            .array(
                z.strictObject({
                    path: z.string().min(1).max(240),
                    content: z.string().max(6000),
                    mode: z.string().regex(/^[0-7]{3,4}$/),
                }),
            )
            .min(1)
            .max(30),
        services: z
            .array(
                z.strictObject({
                    id: z.string().min(1).max(80),
                    name: z.string().min(1).max(120),
                    status: z.enum(["running", "failed"]),
                    logs: z.array(z.string().min(1).max(400)).max(20),
                }),
            )
            .min(1)
            .max(6),
        symlinks: z
            .array(
                z.strictObject({
                    path: z.string().min(1).max(240),
                    target: z.string().min(1).max(240),
                }),
            )
            .max(6),
        processes: z
            .array(
                z.strictObject({
                    pid: z.number().int().positive(),
                    command: z.string().min(1).max(200),
                }),
            )
            .max(12)
            .optional(),
    }),
    objectives: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(80),
                description: z.string().min(1).max(300),
                check: TerminalCheckSchema,
            }),
        )
        .min(1)
        .max(5),
    explanation: z.string().min(1).max(1200),
});

const TestDesignStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("test-design"),
    cases: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(80),
                label: z.string().min(1).max(300),
                shouldSelect: z.boolean(),
            }),
        )
        .min(3)
        .max(8),
    explanation: z.string().min(1).max(1200),
});

const ExplainStepSchema = z.strictObject({
    ...stepBase,
    kind: z.literal("explain"),
    statements: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(80),
                label: z.string().min(1).max(400),
                correct: z.boolean(),
            }),
        )
        .min(3)
        .max(6),
    explanation: z.string().min(1).max(1200),
});

export const MissionStepSchema = z.discriminatedUnion("kind", [
    QuizStepSchema,
    LessonStepSchema,
    MachineStepSchema,
    OrderStepSchema,
    StateStepSchema,
    RuleStepSchema,
    LoopStepSchema,
    TraceStepSchema,
    DebugStepSchema,
    BinaryStepSchema,
    FilesystemStepSchema,
    NetworkStepSchema,
    ReviewStepSchema,
    CodeStepSchema,
    GitStepSchema,
    TerminalStepSchema,
    TestDesignStepSchema,
    ExplainStepSchema,
]);
export type MissionStep = z.infer<typeof MissionStepSchema>;
export type QuizStep = z.infer<typeof QuizStepSchema>;
export type MachineStep = z.infer<typeof MachineStepSchema>;
export type OrderStep = z.infer<typeof OrderStepSchema>;
export type StateStep = z.infer<typeof StateStepSchema>;
export type RuleStep = z.infer<typeof RuleStepSchema>;
export type LoopStep = z.infer<typeof LoopStepSchema>;
export type TraceStep = z.infer<typeof TraceStepSchema>;
export type DebugStep = z.infer<typeof DebugStepSchema>;
export type BinaryStep = z.infer<typeof BinaryStepSchema>;
export type FilesystemStep = z.infer<typeof FilesystemStepSchema>;
export type NetworkStep = z.infer<typeof NetworkStepSchema>;
export type ReviewStep = z.infer<typeof ReviewStepSchema>;
export type CodeStep = z.infer<typeof CodeStepSchema>;
export type GitStep = z.infer<typeof GitStepSchema>;
export type TerminalStep = z.infer<typeof TerminalStepSchema>;
export type TestDesignStep = z.infer<typeof TestDesignStepSchema>;
export type ExplainStep = z.infer<typeof ExplainStepSchema>;
export type LessonStep = z.infer<typeof LessonStepSchema>;

export const ObjectiveSchema = z.strictObject({
    id: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    stepIds: z.array(StepIdSchema).min(1),
});

export const MisconceptionSchema = z.strictObject({
    id: z.string().min(1).max(80),
    description: z.string().min(1).max(300),
    stepId: StepIdSchema,
    answer: z.string().max(200).optional(),
    feedback: z.string().min(1).max(900),
    followUpSkill: SkillIdSchema.optional(),
});
export type Misconception = z.infer<typeof MisconceptionSchema>;

export const MissionSchema = z.strictObject({
    id: MissionIdSchema,
    version: z.number().int().positive(),
    sequence: z.number().int().positive(),
    courseId: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/),
    title: z.string().min(1).max(140),
    summary: z.string().min(1).max(600),
    skills: z.array(SkillIdSchema).min(1).max(6),
    prerequisites: z.array(SkillIdSchema).max(8),
    difficulty: DifficultySchema,
    estimatedMinutes: z.number().int().min(2).max(30),
    interaction: InteractionKindSchema,
    runtime: z.strictObject({
        kind: RuntimeKindSchema,
        capabilities: z.array(z.string().min(1).max(80)).min(1),
    }),
    scenario: z.strictObject({
        world: z.literal("campus"),
        system: WorldSystemIdSchema,
        initialState: z.string().min(1).max(120),
        briefing: z.string().min(1).max(1200),
    }),
    objectives: z.array(ObjectiveSchema).min(1).max(6),
    assets: z.array(z.string().regex(/^(pip|scene|system|icon):[a-z0-9-]+$/)).min(1),
    hints: z.array(z.string().min(1).max(800)).length(4),
    misconceptions: z.array(MisconceptionSchema).min(2).max(8),
    lesson: z.strictObject({
        sections: z
            .array(
                z.strictObject({
                    title: z.string().min(1).max(120),
                    body: z.string().min(1).max(2400),
                }),
            )
            .min(1)
            .max(5),
        vocabulary: z
            .array(
                z.strictObject({
                    term: z.string().min(1).max(60),
                    definition: z.string().min(1).max(500),
                }),
            )
            .min(1)
            .max(10),
    }),
    steps: z.array(MissionStepSchema).min(1).max(12),
    evaluation: z.strictObject({
        kind: z.literal("steps"),
        passScore: z.number().min(0.5).max(1),
    }),
    rewards: z.strictObject({
        experience: z.number().int().min(10).max(500),
        unlocks: z.array(MissionIdSchema).max(5),
        achievement: z.string().min(1).max(80).optional(),
    }),
    persistence: z.strictObject({
        kind: z.enum(["world-action", "none"]),
        action: WorldActionIdSchema.optional(),
        system: WorldSystemIdSchema.optional(),
    }),
    accessibility: z.strictObject({
        summary: z.string().min(1).max(800),
        keyboardNotes: z.string().min(1).max(800),
        screenReaderNotes: z.string().min(1).max(800),
    }),
    license: z.string().min(1).max(120),
    tags: z.array(InterestSchema).min(1),
});
export type Mission = z.infer<typeof MissionSchema>;

export const MissionCatalogSchema = z.strictObject({
    version: z.literal(1),
    missions: z.array(MissionSchema).min(1),
});
export type MissionCatalog = z.infer<typeof MissionCatalogSchema>;

export const StepEvaluatorKindByInteraction: Readonly<
    Record<InteractionKind, EvaluatorKind | null>
> = {
    lesson: null,
    quiz: "exact",
    machine: "program-output",
    order: "structured",
    state: "state-transition",
    rule: "configuration",
    loop: "structured",
    trace: "state-transition",
    debug: "exact",
    binary: "structured",
    filesystem: "exact",
    network: "structured",
    review: "explanation",
    code: "code-tests",
    git: "state-transition",
    terminal: "state-transition",
    "test-design": "structural",
    explain: "explanation",
};
