import { describe, expect, it } from "vitest";
import {
    applyWorldAction,
    createInitialWorld,
    isWorldRecovered,
    worldHealth,
} from "../../packages/domain/src/simulation/world.ts";

describe("world reducer", function worldReducer(): void {
    it("starts with the campus in a degraded state", function initial(): void {
        const state = createInitialWorld();
        expect(state.version).toBe(0);
        expect(state.systems).toHaveLength(9);
        expect(state.log).toEqual([]);
        expect(isWorldRecovered(state)).toBe(false);
    });

    it("increments the version exactly once per action", function versioning(): void {
        const initial = createInitialWorld();
        const first = applyWorldAction(initial, { id: "repair-inventory" });
        const second = applyWorldAction(first.state, { id: "publish-storefront" });
        expect(first.state.version).toBe(1);
        expect(second.state.version).toBe(2);
        expect(initial.version).toBe(0);
    });

    it("is deterministic for the same input", function determinism(): void {
        const initial = createInitialWorld();
        const first = applyWorldAction(initial, { id: "restart-service", systemId: "api" });
        const second = applyWorldAction(initial, { id: "restart-service", systemId: "api" });
        expect(first.state).toEqual(second.state);
    });

    it("reports no change when a restart has nothing left to repair", function noChange(): void {
        const initial = createInitialWorld();
        const result = applyWorldAction(initial, { id: "restart-service", systemId: "api" });
        expect(result.changed).toBe(false);
        expect(result.state.version).toBe(1);
        expect(result.state.log).toHaveLength(1);
        expect(initial.version).toBe(0);
    });

    it("opens an incident when a restart runs before its prerequisites", function badRestart(): void {
        const initial = createInitialWorld();
        const failed = applyWorldAction(initial, {
            id: "restart-service",
            systemId: "robotics",
        });
        expect(failed.changed).toBe(true);
        expect(failed.state.flags["incidentOpen"]).toBe(true);
        expect(
            failed.state.systems.find(function robotics(system): boolean {
                return system.id === "robotics";
            })?.status,
        ).toBe("down");
        expect(isWorldRecovered(failed.state)).toBe(false);

        const blocked = applyWorldAction(failed.state, { id: "resolve-incident" });
        expect(blocked.state.flags["incidentResolved"]).toBe(false);
    });

    it("heals only after the failing prerequisites are corrected", function recovery(): void {
        const initial = createInitialWorld();
        let state = applyWorldAction(initial, {
            id: "restart-service",
            systemId: "robotics",
        }).state;
        state = applyWorldAction(state, { id: "integrate-systems" }).state;
        state = applyWorldAction(state, { id: "enable-robotics" }).state;
        state = applyWorldAction(state, { id: "restart-service", systemId: "robotics" }).state;
        expect(state.flags["incidentOpen"]).toBe(false);

        state = applyWorldAction(state, { id: "restore-deploy" }).state;
        state = applyWorldAction(state, { id: "publish-storefront" }).state;
        state = applyWorldAction(state, { id: "resolve-incident" }).state;
        expect(isWorldRecovered(state)).toBe(true);
    });

    it("refuses to restart a system that is not restartable", function notRestartable(): void {
        const initial = createInitialWorld();
        const result = applyWorldAction(initial, {
            id: "restart-service",
            systemId: "database",
        });
        expect(result.changed).toBe(true);
        expect(result.state.flags["incidentOpen"]).toBe(true);
        expect(
            result.state.systems.find(function database(system): boolean {
                return system.id === "database";
            })?.status,
        ).toBe("down");
    });

    it("requires meaningful recovery evidence, not only healthy statuses", function recoveryEvidence(): void {
        const initial = createInitialWorld();
        const healthyButUnverified = {
            ...initial,
            systems: initial.systems.map(function healthy(system) {
                return { ...system, status: "healthy" as const };
            }),
        };
        expect(isWorldRecovered(healthyButUnverified)).toBe(false);
    });

    it("sets world flags and appends a sequenced log entry", function flags(): void {
        const result = applyWorldAction(createInitialWorld(), { id: "repair-inventory" });
        expect(result.changed).toBe(true);
        expect(result.state.flags["inventoryConsistent"]).toBe(true);
        expect(result.state.log).toHaveLength(1);
        expect(result.state.log[0]?.seq).toBe(1);
    });

    it("restores the incident only when recovery prerequisites are present", function incident(): void {
        const initial = createInitialWorld();
        const early = applyWorldAction(initial, { id: "resolve-incident" });
        expect(early.state.flags["incidentResolved"]).toBe(false);

        let state = initial;
        state = applyWorldAction(state, { id: "integrate-systems" }).state;
        state = applyWorldAction(state, { id: "restore-deploy" }).state;
        state = applyWorldAction(state, { id: "publish-storefront" }).state;
        const resolved = applyWorldAction(state, { id: "resolve-incident" });
        expect(resolved.state.flags["incidentResolved"]).toBe(true);
        expect(isWorldRecovered(resolved.state)).toBe(false);
        const recovered = applyWorldAction(resolved.state, { id: "enable-robotics" });
        expect(isWorldRecovered(recovered.state)).toBe(true);
    });

    it("reports health and recovery as a ratio", function health(): void {
        const initial = createInitialWorld();
        const report = worldHealth(initial);
        expect(report.total).toBe(9);
        expect(report.healthy).toBeGreaterThanOrEqual(5);
        expect(report.recovery).toBeCloseTo(report.healthy / 9);
    });

    it("does not expose a shared mutable world through the reducer", function immutability(): void {
        const initial = createInitialWorld();
        const result = applyWorldAction(initial, { id: "enable-robotics" });
        expect(initial.flags["roboticsEnabled"]).toBe(false);
        expect(result.state.flags["roboticsEnabled"]).toBe(true);
        const firstSystem = result.state.systems[0];
        if (firstSystem === undefined) {
            throw new Error("The world is missing its first system.");
        }
        firstSystem.status = "down";
        expect(initial.systems[0]?.status).toBe("degraded");
    });
});
