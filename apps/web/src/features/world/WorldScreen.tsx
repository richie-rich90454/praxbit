import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    onMount,
    type JSX,
} from "solid-js";
import type { WorldSystem, WorldSystemId } from "@praxbit/contracts";
import type { CampusRenderer } from "@praxbit/game";
import { isWorldRecovered, worldHealth } from "@praxbit/domain";
import { announce } from "../../app/AppShell.tsx";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";
import "./world.css";

function statusLabel(status: string): string {
    return status === "healthy"
        ? "Healthy"
        : status === "degraded"
          ? "Degraded"
          : status === "down"
            ? "Down"
            : "Offline";
}

function statusClass(status: string): string {
    return status === "healthy"
        ? "status--success"
        : status === "degraded"
          ? "status--warning"
          : status === "down"
            ? "status--error"
            : "";
}

export function WorldScreen(): JSX.Element {
    const learning = useLearning();
    let canvasContainer: HTMLDivElement | undefined;
    let renderer: CampusRenderer | undefined;
    const [selected, setSelected] = createSignal<WorldSystemId>("storefront");
    const [pixiError, setPixiError] = createSignal("");
    const [visualState, setVisualState] = createSignal<"loading" | "ready" | "failed">("loading");
    const [busy, setBusy] = createSignal(false);
    const [actionError, setActionError] = createSignal("");
    const [actionNotice, setActionNotice] = createSignal("");
    const [actionFailed, setActionFailed] = createSignal(false);

    const health = createMemo(function worldHealthSummary() {
        return worldHealth(learning.world());
    });

    const recovered = createMemo(function worldRecoveryState() {
        return isWorldRecovered(learning.world());
    });

    const incidentOpen = createMemo(function incidentState() {
        return learning.world().flags["incidentOpen"] === true;
    });

    const unhealthySystems = createMemo(function affectedSystems() {
        return learning.world().systems.filter(function unhealthy(system): boolean {
            return system.status !== "healthy";
        });
    });

    const selectedSystem = createMemo(function selectedSystemValue() {
        return learning.world().systems.find(function match(system): boolean {
            return system.id === selected();
        });
    });

    const selectedBlocker = createMemo(function selectedRestartBlocker() {
        return restartBlocker(selectedSystem());
    });

    function selectSystem(systemId: WorldSystemId): void {
        setSelected(systemId);
        setActionError("");
        setActionNotice("");
        const system = learning.world().systems.find(function match(item): boolean {
            return item.id === systemId;
        });
        if (system !== undefined) {
            announce(`${system.name}. Status ${statusLabel(system.status)}. ${system.summary}`);
        }
    }

    onMount(function mount(): void {
        void (async function initialize(): Promise<void> {
            if (canvasContainer === undefined) {
                setVisualState("failed");
                setPixiError(
                    "The visual map container did not become available. Use the accessible system list below.",
                );
                return;
            }
            try {
                const game = await import("@praxbit/game");
                renderer = await game.mountCampusWorld(
                    canvasContainer,
                    learning.world(),
                    selectSystem,
                );
                setVisualState("ready");
            } catch (error) {
                setVisualState("failed");
                setPixiError(
                    error instanceof Error
                        ? `${error.message} Use the accessible system list below; it contains the full state and all available actions.`
                        : "The visual map could not load. Use the accessible system list below; it contains the full state and all available actions.",
                );
            }
        })();
    });

    createEffect(function updateScene(): void {
        if (renderer !== undefined) {
            renderer.update(learning.world());
        }
    });

    onCleanup(function cleanup(): void {
        renderer?.destroy();
        renderer = undefined;
    });

    function restartBlocker(system: WorldSystem | undefined): string | undefined {
        if (system === undefined) {
            return undefined;
        }
        if (system.kind !== "service" && system.kind !== "automation") {
            return `${system.name} is not a restartable service. Correct the underlying prerequisite instead.`;
        }
        const blocked = system.dependsOn.flatMap(function dependencyName(id): string[] {
            const dependency = learning.world().systems.find(function match(item): boolean {
                return item.id === id;
            });
            if (dependency === undefined) {
                return [id];
            }
            return dependency.status === "healthy" ? [] : [dependency.name];
        });
        if (blocked.length > 0) {
            return `Restart blocked: ${blocked.join(", ")} ${blocked.length === 1 ? "is" : "are"} not healthy. An incorrect restart opens an incident.`;
        }
        return undefined;
    }

    async function restartSystem(): Promise<void> {
        const system = selectedSystem();
        if (system === undefined || busy()) {
            return;
        }
        setActionError("");
        setActionNotice("");
        setActionFailed(false);
        setBusy(true);
        try {
            const outcome = await learning.performWorldAction({
                id: "restart-service",
                systemId: system.id,
            });
            const message =
                outcome.state.log[outcome.state.log.length - 1]?.text ??
                (outcome.changed
                    ? `Restart recorded for ${system.name}.`
                    : "No system state changed.");
            setActionNotice(message);
            setActionFailed(outcome.state.flags["incidentOpen"] === true);
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : `${system.name} could not be restarted. The world state was not changed.`,
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <main class="page">
            <div class="page-header">
                <div class="page-header__text">
                    <h1>World</h1>
                    <p class="lede">
                        The campus storefront, services, data, people, and machines share one
                        deterministic state. Missions change it, and recovery actions here are
                        recorded.
                    </p>
                </div>
                <div class="row">
                    <span class="meta">
                        {health().healthy} of {health().total} systems healthy
                        {recovered() ? " · campus recovered" : " · recovery in progress"}
                    </span>
                    <span aria-hidden="true">
                        <Pip
                            pose={health().healthy === health().total ? "celebrating" : "alert"}
                            size={72}
                        />
                    </span>
                </div>
            </div>

            <div class="stack stack--wide">
                <Show when={incidentOpen()}>
                    <div class="notice world-incident" role="alert">
                        <strong>Open incident</strong>
                        <p class="small">
                            A recovery action was attempted before its prerequisites were met.
                            Correct the affected prerequisites, then restart the intended service.
                        </p>
                        <Show when={unhealthySystems().length > 0}>
                            <ul class="world-incident__list small">
                                <For each={unhealthySystems()}>
                                    {function system(item): JSX.Element {
                                        return (
                                            <li>
                                                {item.name}: {statusLabel(item.status)}
                                            </li>
                                        );
                                    }}
                                </For>
                            </ul>
                        </Show>
                    </div>
                </Show>
                <div class="surface stack">
                    <div class="surface__header">
                        <div>
                            <h2>Campus systems</h2>
                            <p class="meta">
                                The map is a visual overview. The accessible system list below is
                                the complete control set and works without graphics.
                            </p>
                        </div>
                    </div>
                    <Show when={visualState() === "loading"}>
                        <p class="feedback feedback--info" role="status">
                            Loading the visual campus map…
                        </p>
                    </Show>
                    <Show when={pixiError().length > 0}>
                        <p class="notice notice--error" role="alert">
                            {pixiError()}
                        </p>
                    </Show>
                    <Show when={visualState() !== "failed"}>
                        <div
                            ref={canvasContainer}
                            class="world-canvas"
                            style={{
                                "min-height": visualState() === "loading" ? "160px" : "520px",
                            }}
                            aria-hidden="true"
                        />
                    </Show>
                </div>

                <div class="grid grid--two">
                    <section class="surface stack" aria-labelledby="system-list-heading">
                        <h2 id="system-list-heading">Accessible system list</h2>
                        <ul class="world-system-list stack stack--tight">
                            <For each={learning.world().systems}>
                                {function system(item): JSX.Element {
                                    return (
                                        <li>
                                            <button
                                                type="button"
                                                class="surface surface--quiet"
                                                style={{ width: "100%", "text-align": "left" }}
                                                aria-pressed={selected() === item.id}
                                                onClick={function choose(): void {
                                                    selectSystem(item.id);
                                                }}
                                            >
                                                <span class="row row--between">
                                                    <strong>{item.name}</strong>
                                                    <span
                                                        class={`status ${statusClass(item.status)}`}
                                                    >
                                                        <span
                                                            class="status__mark"
                                                            aria-hidden="true"
                                                        />
                                                        {statusLabel(item.status)}
                                                    </span>
                                                </span>
                                                <span class="meta">{item.summary}</span>
                                            </button>
                                        </li>
                                    );
                                }}
                            </For>
                        </ul>
                    </section>

                    <section class="surface stack" aria-labelledby="system-detail-heading">
                        <h2 id="system-detail-heading">{selectedSystem()?.name ?? "System"}</h2>
                        <Show when={selectedSystem() !== undefined}>
                            <div class="stack">
                                <p>{selectedSystem()?.summary}</p>
                                <p class="meta">
                                    Status: {statusLabel(selectedSystem()?.status ?? "offline")}
                                </p>
                                <div class="stack stack--tight">
                                    <h3>Metrics</h3>
                                    <dl class="stack stack--tight">
                                        <For each={Object.entries(selectedSystem()?.metrics ?? {})}>
                                            {function metric(item): JSX.Element {
                                                return (
                                                    <div class="row row--between">
                                                        <dt class="small muted">{item[0]}</dt>
                                                        <dd class="mono small">{item[1]}</dd>
                                                    </div>
                                                );
                                            }}
                                        </For>
                                    </dl>
                                </div>
                                <div class="stack stack--tight">
                                    <h3>Depends on</h3>
                                    <p class="small muted">
                                        {selectedSystem()
                                            ?.dependsOn.map(function dependency(id): string {
                                                return (
                                                    learning
                                                        .world()
                                                        .systems.find(
                                                            function find(system): boolean {
                                                                return system.id === id;
                                                            },
                                                        )?.name ?? id
                                                );
                                            })
                                            .join(", ") || "No internal dependencies"}
                                    </p>
                                </div>
                                <Show
                                    when={selectedSystem()?.status !== "healthy"}
                                    fallback={
                                        <p class="meta">
                                            This system is healthy, so no restart action is
                                            available.
                                        </p>
                                    }
                                >
                                    <div class="stack stack--tight">
                                        <p class="meta">
                                            Restarting only succeeds when the service is restartable
                                            and every dependency is healthy.
                                        </p>
                                        <Show when={selectedBlocker()}>
                                            <p class="feedback feedback--info" role="status">
                                                {selectedBlocker()}
                                            </p>
                                        </Show>
                                        <div class="row">
                                            <button
                                                type="button"
                                                class="button"
                                                disabled={busy() || selectedBlocker() !== undefined}
                                                onClick={function restart(): void {
                                                    void restartSystem();
                                                }}
                                            >
                                                {busy() ? "Restarting service…" : "Restart service"}
                                            </button>
                                        </div>
                                    </div>
                                </Show>
                                <Show when={actionError().length > 0}>
                                    <p class="feedback feedback--error" role="alert">
                                        {actionError()}
                                    </p>
                                </Show>
                                <Show when={actionNotice().length > 0}>
                                    <p
                                        class={
                                            actionFailed()
                                                ? "feedback feedback--error"
                                                : "feedback feedback--success"
                                        }
                                        role={actionFailed() ? "alert" : "status"}
                                    >
                                        {actionNotice()}
                                    </p>
                                </Show>
                            </div>
                        </Show>
                    </section>
                </div>

                <section class="surface stack" aria-labelledby="world-log-heading">
                    <h2 id="world-log-heading">World changes</h2>
                    <Show
                        when={learning.world().log.length > 0}
                        fallback={
                            <p class="muted">
                                No accepted world changes yet. Missions and recovery actions appear
                                here.
                            </p>
                        }
                    >
                        <ol class="stack stack--tight">
                            <For each={[...learning.world().log].reverse().slice(0, 12)}>
                                {function entry(item): JSX.Element {
                                    return (
                                        <li class="small">
                                            <span class="meta">#{item.seq}</span> {item.text}
                                        </li>
                                    );
                                }}
                            </For>
                        </ol>
                    </Show>
                </section>
            </div>
        </main>
    );
}
