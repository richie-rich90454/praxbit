import { describe, expect, it } from "vitest";
import {
    MissionStateMachine,
    MissionTransitionError,
    practiceResult,
    resolveMissionMode,
} from "../../packages/domain/src/missions/state-machine.ts";
import { makeMission } from "./support/fixtures.ts";

function completeAttempt(machine: MissionStateMachine): void {
    machine.transition("start");
    machine.transition("explore");
    machine.transition("attempt");
    machine.transition("evaluate");
    machine.transition("respond");
    machine.transition("complete");
}

describe("MissionStateMachine", function missionStateMachine(): void {
    it("walks the full valid lifecycle", function lifecycle(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        expect(machine.session.phase).toBe("not-started");
        machine.transition("start");
        expect(machine.session.phase).toBe("introducing");
        machine.transition("explore");
        expect(machine.session.phase).toBe("exploring");
        machine.transition("attempt");
        expect(machine.session.phase).toBe("attempting");
        expect(machine.session.attempts).toBe(1);
        machine.transition("request-help");
        expect(machine.session.phase).toBe("assistance");
        expect(machine.session.hintsUsed).toBe(1);
        machine.transition("evaluate");
        expect(machine.session.phase).toBe("evaluating");
        machine.transition("respond");
        expect(machine.session.phase).toBe("feedback");
        machine.transition("complete");
        expect(machine.session.phase).toBe("completed");
        expect(machine.session.completionRecorded).toBe(true);
        machine.transition("schedule-review");
        expect(machine.session.phase).toBe("review-scheduled");
        machine.transition("replay");
        expect(machine.session.phase).toBe("attempting");
    });

    it("rejects an event that is invalid for the current phase", function invalidTransition(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        expect(function invalid(): void {
            machine.transition("complete");
        }).toThrow(MissionTransitionError);
        expect(machine.session.phase).toBe("not-started");
    });

    it("rejects evaluation before an attempt", function evaluateEarly(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        machine.transition("start");
        expect(function invalid(): void {
            machine.transition("evaluate");
        }).toThrow("cannot handle");
    });

    it("prevents a duplicate completion reward", function duplicateCompletion(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        completeAttempt(machine);
        machine.transition("schedule-review");
        machine.transition("replay");
        machine.transition("attempt");
        machine.transition("evaluate");
        machine.transition("respond");
        expect(function duplicate(): void {
            machine.transition("complete");
        }).toThrow("Completion reward already recorded");
        expect(machine.session.phase).toBe("feedback");
    });

    it("caps hints at four even if help is requested repeatedly", function hintCap(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        machine.transition("start");
        machine.transition("explore");
        machine.transition("attempt");
        for (let index = 0; index < 6; index += 1) {
            machine.transition("request-help");
            machine.transition("attempt");
        }
        expect(machine.session.hintsUsed).toBe(4);
    });

    it("records timestamps only at the matching transitions", function timestamps(): void {
        const start = new Date("2026-10-28T10:00:00.000Z");
        const finish = new Date("2026-10-28T10:10:00.000Z");
        const machine = MissionStateMachine.create("campus.test-mission");
        machine.transition("start", start);
        expect(machine.session.startedAt).toBe(start.toISOString());
        expect(machine.session.completedAt).toBeUndefined();
        machine.transition("explore", start);
        machine.transition("attempt", start);
        machine.transition("evaluate", start);
        machine.transition("respond", start);
        machine.transition("complete", finish);
        expect(machine.session.completedAt).toBe(finish.toISOString());
    });

    it("rejects responding before an evaluation", function respondEarly(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        machine.transition("start");
        machine.transition("explore");
        machine.transition("attempt");
        expect(function invalid(): void {
            machine.transition("respond");
        }).toThrow(MissionTransitionError);
        expect(machine.session.phase).toBe("attempting");
    });

    it("rejects scheduling a review before completion", function reviewEarly(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        machine.transition("start");
        machine.transition("explore");
        machine.transition("attempt");
        machine.transition("evaluate");
        machine.transition("respond");
        expect(function invalid(): void {
            machine.transition("schedule-review");
        }).toThrow(MissionTransitionError);
        expect(machine.session.phase).toBe("feedback");
    });

    it("rejects replay and reset from phases that cannot use them", function replayReset(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        machine.transition("start");
        machine.transition("explore");
        machine.transition("attempt");
        expect(function invalidReplay(): void {
            machine.transition("replay");
        }).toThrow(MissionTransitionError);
        expect(function invalidReset(): void {
            machine.transition("reset");
        }).not.toThrow();
        expect(machine.session.phase).toBe("not-started");
        expect(function resetAgain(): void {
            machine.transition("reset");
        }).toThrow(MissionTransitionError);
    });

    it("reports the rejected phase and event", function transitionError(): void {
        const machine = MissionStateMachine.create("campus.test-mission");
        try {
            machine.transition("complete");
        } catch (error) {
            expect(error).toBeInstanceOf(MissionTransitionError);
            if (error instanceof MissionTransitionError) {
                expect(error.from).toBe("not-started");
                expect(error.event).toBe("complete");
            }
        }
    });
});

describe("mission modes", function missionModes(): void {
    it("uses explicit metadata when present", function explicit(): void {
        expect(resolveMissionMode(makeMission({ mode: "project" }))).toBe("project");
        expect(resolveMissionMode(makeMission({ mode: "transfer" }))).toBe("transfer");
        expect(resolveMissionMode(makeMission({ mode: "incident" }))).toBe("incident");
    });

    it("infers incidents from world actions and defaults to campaign", function inferred(): void {
        expect(
            resolveMissionMode(
                makeMission({
                    estimatedMinutes: 8,
                    persistence: { kind: "world-action", action: "restart-service" },
                }),
            ),
        ).toBe("incident");
        expect(resolveMissionMode(makeMission({ estimatedMinutes: 4 }))).toBe("campaign");
        expect(resolveMissionMode(makeMission({ estimatedMinutes: 10 }))).toBe("campaign");
    });

    it("uses the practice mode for an explicit practice session", function practiceOverride(): void {
        expect(
            resolveMissionMode(makeMission({ mode: "incident", estimatedMinutes: 9 }), {
                practice: true,
            }),
        ).toBe("practice");
        expect(
            resolveMissionMode(makeMission({ estimatedMinutes: 4 }), {
                practice: true,
            }),
        ).toBe("practice");
    });
});

describe("practiceResult", function practiceOutcome(): void {
    it("records an assisted completion as a failure", function assisted(): void {
        expect(practiceResult({ completed: true }, { step: 1 })).toEqual({
            independent: false,
            outcome: "failure",
        });
    });

    it("records an independent completion as success", function independent(): void {
        expect(practiceResult({ completed: true }, { step: 0 })).toEqual({
            independent: true,
            outcome: "success",
        });
    });

    it("records an incomplete attempt as a failure even without hints", function incomplete(): void {
        expect(practiceResult({ completed: false }, {})).toEqual({
            independent: false,
            outcome: "failure",
        });
    });
});
