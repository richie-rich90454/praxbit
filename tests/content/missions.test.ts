import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadContent } from "../../packages/content-validator/src/index.ts";
import type { LoadedContent } from "../../packages/content-validator/src/index.ts";
import type { Mission, MissionStep } from "../../packages/contracts/src/index.ts";

const LAUNCH_IDS = [
    "before-code.make-it-respond",
    "before-code.give-better-instructions",
    "before-code.remember-this",
    "before-code.make-a-decision",
    "before-code.do-it-again",
    "before-code.one-step-at-a-time",
    "before-code.fix-the-instructions",
    "before-code.everything-is-information",
    "before-code.find-the-file",
    "before-code.send-a-message",
    "before-code.break-it-into-parts",
    "before-code.can-we-trust-the-result",
    "campus.page-with-no-identity",
    "campus.everything-is-misplaced",
    "campus.the-button-does-nothing",
    "campus.inventory-went-negative",
    "campus.repeating-the-same-work",
    "campus.incorrect-totals",
    "campus.the-missing-property",
    "campus.the-mysterious-exception",
    "campus.changes-nobody-can-find",
    "campus.two-developers-disagree",
    "campus.the-broken-request",
    "campus.the-duplicate-order",
    "campus.the-ai-says-it-is-fixed",
    "campus.a-failing-service",
    "campus.permission-denied",
    "campus.the-deployment-is-broken",
    "campus.nothing-works-together",
    "campus.the-campus-incident",
];

const RUNTIME_FOR_LANGUAGE: Readonly<Record<string, string>> = {
    javascript: "browser-javascript",
    typescript: "browser-typescript",
    html: "browser-html",
    css: "browser-css",
    python: "browser-python",
    sql: "browser-sql",
    json: "static-analysis",
    text: "static-analysis",
    java: "static-analysis",
    c: "static-analysis",
    cpp: "static-analysis",
    csharp: "static-analysis",
    go: "static-analysis",
    rust: "static-analysis",
    kotlin: "static-analysis",
    swift: "static-analysis",
    ruby: "static-analysis",
    zig: "static-analysis",
    lua: "static-analysis",
};

async function content(): Promise<LoadedContent> {
    return await loadContent(fileURLToPath(new URL("../../content", import.meta.url)));
}

function stepsOfKind<K extends MissionStep["kind"]>(
    mission: Mission,
    kind: K,
): readonly Extract<MissionStep, { kind: K }>[] {
    return mission.steps.filter(function matches(step): step is Extract<MissionStep, { kind: K }> {
        return step.kind === kind;
    });
}

describe("launch content", function launchContent(): void {
    it("loads every authored document through the schemas", async function schemas(): Promise<void> {
        const loaded = await content();
        expect(loaded.issues).toEqual([]);
        expect(loaded.missions.length).toBeGreaterThanOrEqual(48);
        expect(loaded.tracks.length).toBeGreaterThanOrEqual(10);
        expect(loaded.projects.length).toBeGreaterThanOrEqual(3);
        expect(loaded.skills.skills.length).toBeGreaterThanOrEqual(70);
    });

    it("contains the 30 launch missions at sequences one through thirty", async function launchMissions(): Promise<void> {
        const loaded = await content();
        const sorted = [...loaded.missions].sort(function bySequence(left, right): number {
            return left.sequence - right.sequence;
        });
        expect(
            sorted.slice(0, 30).map(function idOf(mission): string {
                return mission.id;
            }),
        ).toEqual(LAUNCH_IDS);
    });

    it("requires no code editor in missions one through twelve", async function beforeCode(): Promise<void> {
        const loaded = await content();
        const missions = loaded.missions.filter(function isBeforeCode(mission): boolean {
            return mission.courseId === "before-code";
        });
        expect(missions).toHaveLength(12);
        for (const mission of missions) {
            expect(stepsOfKind(mission, "code")).toHaveLength(0);
            expect(mission.runtime.kind).toBe("none");
            expect(mission.steps.length).toBeGreaterThanOrEqual(3);
        }
    });

    it("opens with a machine, a lesson, and a quiz with prediction and transfer", async function openingMission(): Promise<void> {
        const loaded = await content();
        const mission = loaded.missions.find(function isFirst(item): boolean {
            return item.id === "before-code.make-it-respond";
        });
        expect(mission).toBeDefined();
        if (mission === undefined) {
            return;
        }
        const machine = stepsOfKind(mission, "machine")[0];
        expect(stepsOfKind(mission, "lesson")).toHaveLength(1);
        expect(stepsOfKind(mission, "quiz")).toHaveLength(1);
        expect(machine).toBeDefined();
        expect(machine?.prediction.options.length).toBeGreaterThanOrEqual(2);
        expect(machine?.transfer.options.length).toBeGreaterThanOrEqual(2);
        expect(machine?.prediction.correctId).not.toBe(machine?.transfer.correctId);
    });

    it("gives every mission four hints, two misconceptions, and reachable objectives", async function quality(): Promise<void> {
        const loaded = await content();
        for (const mission of loaded.missions) {
            expect(mission.hints, mission.id).toHaveLength(4);
            expect(
                mission.hints.every(function nonEmpty(hint): boolean {
                    return hint.trim().length > 0;
                }),
                mission.id,
            ).toBe(true);
            expect(mission.misconceptions.length, mission.id).toBeGreaterThanOrEqual(2);
            expect(
                mission.misconceptions.every(function hasFeedback(item): boolean {
                    return item.feedback.trim().length > 0;
                }),
                mission.id,
            ).toBe(true);
            expect(mission.objectives.length, mission.id).toBeGreaterThanOrEqual(1);
            const stepIds = new Set(
                mission.steps.map(function idOf(step): string {
                    return step.id;
                }),
            );
            for (const objective of mission.objectives) {
                expect(objective.stepIds.length, `${mission.id}/${objective.id}`).toBeGreaterThan(
                    0,
                );
                for (const stepId of objective.stepIds) {
                    expect(stepIds.has(stepId), `${mission.id}/${objective.id}/${stepId}`).toBe(
                        true,
                    );
                }
            }
            for (const step of mission.steps) {
                if (step.hints !== undefined) {
                    expect(step.hints, `${mission.id}/${step.id}`).toHaveLength(4);
                }
            }
        }
    });

    it("carries licensing, accessibility, duration, and vocabulary on every mission", async function metadata(): Promise<void> {
        const loaded = await content();
        for (const mission of loaded.missions) {
            expect(mission.license.trim().length, mission.id).toBeGreaterThan(0);
            expect(mission.accessibility.summary.trim().length, mission.id).toBeGreaterThan(0);
            expect(mission.accessibility.keyboardNotes.trim().length, mission.id).toBeGreaterThan(
                0,
            );
            expect(
                mission.accessibility.screenReaderNotes.trim().length,
                mission.id,
            ).toBeGreaterThan(0);
            expect(mission.estimatedMinutes, mission.id).toBeGreaterThanOrEqual(2);
            expect(mission.estimatedMinutes, mission.id).toBeLessThanOrEqual(30);
            expect(mission.lesson.vocabulary.length, mission.id).toBeGreaterThan(0);
        }
    });

    it("places every mission in exactly one track and resolves every track reference", async function tracks(): Promise<void> {
        const loaded = await content();
        const missionIds = new Set(
            loaded.missions.map(function idOf(mission): string {
                return mission.id;
            }),
        );
        const seen = new Map<string, number>();
        for (const track of loaded.tracks) {
            expect(new Set(track.missionIds).size, track.id).toBe(track.missionIds.length);
            for (const missionId of track.missionIds) {
                expect(missionIds.has(missionId), `${track.id}/${missionId}`).toBe(true);
                seen.set(missionId, (seen.get(missionId) ?? 0) + 1);
            }
        }
        for (const missionId of missionIds) {
            expect(seen.get(missionId), missionId).toBeGreaterThanOrEqual(1);
        }
    });

    it("declares honest runtime labels", async function runtimes(): Promise<void> {
        const loaded = await content();
        for (const mission of loaded.missions) {
            expect(mission.runtime.capabilities.length, mission.id).toBeGreaterThan(0);
            const codeSteps = stepsOfKind(mission, "code");
            const terminalSteps = stepsOfKind(mission, "terminal");
            const gitSteps = stepsOfKind(mission, "git");
            if (terminalSteps.length > 0) {
                expect(mission.runtime.kind, mission.id).toBe("simulated-linux");
            }
            if (gitSteps.length > 0) {
                expect(mission.runtime.kind, mission.id).toBe("browser-git");
            }
            if (codeSteps.length > 0 && terminalSteps.length === 0) {
                for (const step of codeSteps) {
                    expect(mission.runtime.kind, `${mission.id}/${step.id}`).toBe(
                        RUNTIME_FOR_LANGUAGE[step.language],
                    );
                    if (mission.runtime.kind === "static-analysis") {
                        expect(
                            step.tests.every(function structural(test): boolean {
                                return (
                                    test.kind === "static" ||
                                    test.kind === "regex" ||
                                    test.kind === "json"
                                );
                            }),
                            `${mission.id}/${step.id}`,
                        ).toBe(true);
                    }
                }
            }
            if (codeSteps.length === 0 && terminalSteps.length === 0 && gitSteps.length === 0) {
                expect(mission.runtime.kind, mission.id).not.toBe("browser-javascript");
            }
        }
    });

    it("publishes assessed tracks for every required language and framework", async function breadth(): Promise<void> {
        const loaded = await content();
        const requiredTracks = [
            "typescript",
            "python-foundations",
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
            "vue",
            "solidjs",
            "angular",
            "svelte",
            "node-services",
            "express",
            "fastify",
            "nestjs",
            "spring-boot",
            "aspnet-core",
            "fastapi",
            "django",
            "cmake",
            "cargo",
            "database-engineering",
            "algorithms-advanced",
            "systems-architecture",
            "devops-practice",
            "ai-practice",
            "native",
        ];
        for (const trackId of requiredTracks) {
            const track = loaded.tracks.find(function matches(item): boolean {
                return item.id === trackId;
            });
            expect(track, trackId).toBeDefined();
            if (track === undefined) {
                continue;
            }
            expect(track.missionIds.length, trackId).toBeGreaterThanOrEqual(2);
            for (const missionId of track.missionIds) {
                const mission = loaded.missions.find(function matches(item): boolean {
                    return item.id === missionId;
                });
                expect(mission, `${trackId}/${missionId}`).toBeDefined();
                expect(
                    mission?.steps.some(function assessed(step): boolean {
                        return step.kind !== "lesson";
                    }),
                    `${trackId}/${missionId}`,
                ).toBe(true);
            }
        }
        for (const skillId of [
            "web.html",
            "web.css",
            "js.functions",
            "js.conditions",
            "js.loops",
        ]) {
            expect(
                loaded.missions.some(function teaches(mission): boolean {
                    return mission.skills.includes(skillId);
                }),
                skillId,
            ).toBe(true);
        }
    });

    it("uses only supported assets", async function assets(): Promise<void> {
        const loaded = await content();
        const poses = new Set(["observing", "explaining", "thinking", "alert", "celebrating"]);
        for (const mission of loaded.missions) {
            for (const asset of mission.assets) {
                const [prefix, value] = asset.split(":");
                if (prefix === "pip") {
                    expect(poses.has(value ?? ""), `${mission.id}/${asset}`).toBe(true);
                } else if (prefix === "scene") {
                    expect(value, mission.id).toBe("campus");
                } else if (prefix === "system") {
                    expect(
                        [
                            "storefront",
                            "website",
                            "api",
                            "database",
                            "messaging",
                            "delivery",
                            "dev-team",
                            "server-room",
                            "robotics",
                        ],
                        mission.id,
                    ).toContain(value);
                } else {
                    expect(prefix, mission.id).toBe("icon");
                }
            }
        }
    });
});
