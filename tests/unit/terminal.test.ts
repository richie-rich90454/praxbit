import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
    TerminalSimulator,
    evaluateTerminalChecks,
    terminalObjectiveIds,
} from "../../packages/execution/src/simulated/terminal.ts";
import { loadContent } from "../../packages/content-validator/src/index.ts";
import type { LoadedContent } from "../../packages/content-validator/src/index.ts";
import type { MissionStep } from "../../packages/contracts/src/index.ts";

function terminalStep(
    loaded: LoadedContent,
    missionId: string,
): Extract<MissionStep, { kind: "terminal" }> {
    const mission = loaded.missions.find(function matches(item): boolean {
        return item.id === missionId;
    });
    if (mission === undefined) {
        throw new Error(`Missing mission ${missionId}`);
    }
    const step = mission.steps.find(function isTerminal(item): boolean {
        return item.kind === "terminal";
    });
    if (step === undefined || step.kind !== "terminal") {
        throw new Error(`Mission ${missionId} has no terminal step.`);
    }
    return step;
}

async function content(): Promise<LoadedContent> {
    return await loadContent(fileURLToPath(new URL("../../content", import.meta.url)));
}

function completedObjectives(
    step: Extract<MissionStep, { kind: "terminal" }>,
    commands: readonly string[],
): readonly string[] {
    const simulator = new TerminalSimulator(step.initial);
    for (const command of commands) {
        simulator.execute(command);
    }
    return terminalObjectiveIds(simulator.snapshot(), step.objectives);
}

describe("TerminalSimulator launch scenarios", function terminalScenarios(): void {
    it("recovers the failing orders API after killing the conflicting process", async function failingService(): Promise<void> {
        const loaded = await content();
        const step = terminalStep(loaded, "campus.a-failing-service");
        const completed = completedObjectives(step, [
            "journalctl -u orders-api",
            "ps",
            "kill 4242",
            "systemctl restart orders-api",
            "curl http://localhost:8080/health",
        ]);
        expect([...completed].sort()).toEqual(["health", "log", "running"]);
    });

    it("repairs file permissions and restarts the service", async function permissions(): Promise<void> {
        const loaded = await content();
        const step = terminalStep(loaded, "campus.permission-denied");
        const completed = completedObjectives(step, [
            "journalctl -u orders-api",
            "chmod 640 /srv/campus/app/config.json",
            "chmod 600 /srv/campus/secrets/api.key",
            "systemctl restart orders-api",
        ]);
        expect([...completed].sort()).toEqual(["config-mode", "evidence", "key-mode", "running"]);
    });

    it("repoints the release symlink and verifies health", async function release(): Promise<void> {
        const loaded = await content();
        const step = terminalStep(loaded, "campus.the-deployment-is-broken");
        const completed = completedObjectives(step, [
            "readlink /srv/campus/current",
            "ln -sf releases/2026-10-19 /srv/campus/current",
            "systemctl restart orders-api",
            "curl http://localhost:8080/health",
        ]);
        expect([...completed].sort()).toEqual(["health", "readlink", "repoint", "running"]);
    });

    it("restarts the database before the API and verifies readiness", async function incident(): Promise<void> {
        const loaded = await content();
        const step = terminalStep(loaded, "campus.the-campus-incident");
        const completed = completedObjectives(step, [
            "journalctl -u inventory-db",
            "systemctl restart inventory-db",
            "systemctl restart orders-api",
            "curl http://localhost:8080/health",
        ]);
        expect([...completed].sort()).toEqual(["api", "db", "health"]);
    });
});

describe("TerminalSimulator commands", function terminalCommands(): void {
    it("normalizes paths and lists directories", function listing(): void {
        const simulator = new TerminalSimulator({
            cwd: "/srv/campus",
            files: [{ path: "/srv/campus/app/server.js", content: "", mode: "644" }],
            services: [],
            symlinks: [],
        });
        expect(simulator.execute("pwd").output).toBe("/srv/campus");
        expect(simulator.execute("cd app").output).toBe("");
        expect(simulator.execute("pwd").output).toBe("/srv/campus/app");
        expect(simulator.execute("ls").output).toBe("server.js");
    });

    it("reports unknown commands and invalid modes", function errors(): void {
        const simulator = new TerminalSimulator({
            cwd: "/",
            files: [{ path: "/file.txt", content: "text", mode: "644" }],
            services: [],
            symlinks: [],
        });
        expect(simulator.execute("nope").output).toContain("command not found");
        expect(simulator.execute("chmod 999 /file.txt").output).toContain("invalid mode");
        expect(simulator.execute("cat /missing").output).toContain("No such file");
        expect(simulator.execute("kill 999").output).toContain("No such process");
    });

    it("checks file modes and symlinks", function checks(): void {
        const simulator = new TerminalSimulator({
            cwd: "/srv",
            files: [{ path: "/srv/config.json", content: "{}", mode: "640" }],
            services: [],
            symlinks: [{ path: "/srv/current", target: "releases/2026-10-19" }],
        });
        const snapshot = simulator.snapshot();
        const completed = evaluateTerminalChecks(snapshot, [
            { kind: "file-mode", path: "/srv/config.json", mode: "640" },
            { kind: "symlink", path: "/srv/current", target: "releases/2026-10-19" },
        ]);
        expect([...completed].sort()).toEqual(["/srv/config.json", "/srv/current"]);
    });

    it("refuses privilege escalation and reports process state", function privilege(): void {
        const simulator = new TerminalSimulator({
            cwd: "/",
            files: [],
            services: [{ id: "api", name: "api", status: "failed", logs: ["[error] down"] }],
            symlinks: [],
            processes: [{ pid: 12, command: "node app.js" }],
        });
        expect(simulator.execute("sudo systemctl restart api").output).toContain(
            "no privilege escalation",
        );
        expect(simulator.execute("ps").output).toContain("12 node app.js");
        expect(simulator.execute("systemctl status api").output).toContain("failed");
    });
});
