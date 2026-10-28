import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import type { WorldSystemId } from "@praxbit/contracts";
import type { CampusRenderer } from "@praxbit/game";
import { worldHealth } from "@praxbit/domain";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";

function statusLabel(status: string): string {
    return status === "healthy" ? "Healthy" : status === "degraded" ? "Degraded" : status === "down" ? "Down" : "Offline";
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
    const [busy, setBusy] = createSignal(false);

    const health = createMemo(function worldHealthSummary() {
        return worldHealth(learning.world());
    });

    const selectedSystem = createMemo(function selectedSystemValue() {
        return learning.world().systems.find(function match(system): boolean {
            return system.id === selected();
        });
    });

    onMount(function mount(): void {
        void (async function initialize(): Promise<void> {
            if (canvasContainer === undefined) {
                return;
            }
            try {
                const game = await import("@praxbit/game");
                renderer = await game.mountCampusWorld(canvasContainer, learning.world(), setSelected);
            } catch (error) {
                setPixiError(
                    error instanceof Error
                        ? `${error.message} The accessible system list below still contains the full state.`
                        : "The visual world could not load. The accessible list below still contains the full state.",
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

    async function restartSystem(): Promise<void> {
        const system = selectedSystem();
        if (system === undefined) {
            return;
        }
        setBusy(true);
        try {
            await learning.performWorldAction({ id: "restart-service", systemId: system.id });
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
                        The campus storefront, services, data, people, and machines share one deterministic state.
                        Missions change it, and recovery actions here are recorded.
                    </p>
                </div>
                <div class="row">
                    <span class="meta">
                        {health().healthy} of {health().total} systems healthy
                    </span>
                    <Pip pose={health().healthy === health().total ? "celebrating" : "alert"} size={72} />
                </div>
            </div>

            <div class="stack stack--wide">
                <div class="surface stack">
                    <div class="surface__header">
                        <div>
                            <h2>Campus systems</h2>
                            <p class="meta">Select a system in the map or in the accessible list to inspect its evidence.</p>
                        </div>
                    </div>
                    <Show when={pixiError().length > 0}>
                        <p class="notice notice--error">{pixiError()}</p>
                    </Show>
                    <div ref={canvasContainer} style={{ "min-height": "520px" }} aria-hidden="true" />
                </div>

                <div class="grid grid--two">
                    <section class="surface stack" aria-labelledby="system-list-heading">
                        <h2 id="system-list-heading">Accessible system list</h2>
                        <ul class="stack stack--tight">
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
                                                    setSelected(item.id);
                                                }}
                                            >
                                                <span class="row row--between">
                                                    <strong>{item.name}</strong>
                                                    <span class={`status ${statusClass(item.status)}`}>
                                                        <span class="status__mark" aria-hidden="true" />
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
                                        {selectedSystem()?.dependsOn
                                            .map(function dependency(id): string {
                                                return (
                                                    learning.world().systems.find(function find(system): boolean {
                                                        return system.id === id;
                                                    })?.name ?? id
                                                );
                                            })
                                            .join(", ") || "No internal dependencies"}
                                    </p>
                                </div>
                                <Show when={selectedSystem()?.status !== "healthy"}>
                                    <div class="row">
                                        <button type="button" class="button" disabled={busy()} onClick={function restart(): void {
                                            void restartSystem();
                                        }}>
                                            {busy() ? "Restarting" : "Restart service"}
                                        </button>
                                    </div>
                                </Show>
                            </div>
                        </Show>
                    </section>
                </div>

                <section class="surface stack" aria-labelledby="world-log-heading">
                    <h2 id="world-log-heading">World changes</h2>
                    <Show
                        when={learning.world().log.length > 0}
                        fallback={<p class="muted">No accepted world changes yet. Missions and recovery actions appear here.</p>}
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
