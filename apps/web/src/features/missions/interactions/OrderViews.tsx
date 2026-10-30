import { For, createMemo, createSignal, type JSX } from "solid-js";
import { evaluateStep } from "@praxbit/domain";
import type { LoopStep, OrderStep } from "@praxbit/contracts";
import { announce } from "../../../app/AppShell.tsx";
import type { InteractionProps } from "./types.ts";

function ReorderList(props: {
    readonly items: readonly { id: string; label: string }[];
    readonly order: readonly string[];
    readonly label: string;
    readonly listId: string;
    readonly onMove: (index: number, delta: number) => void;
}): JSX.Element {
    const byId = createMemo(function indexItems(): ReadonlyMap<
        string,
        { id: string; label: string }
    > {
        return new Map(
            props.items.map(function entry(item): [string, { id: string; label: string }] {
                return [item.id, item];
            }),
        );
    });

    function move(index: number, delta: number, id: string): void {
        const item = byId().get(id);
        const target = index + delta;
        if (item === undefined || target < 0 || target >= props.order.length) {
            return;
        }
        props.onMove(index, delta);
        announce(`${item.label} moved to position ${target + 1} of ${props.order.length}.`);
        queueMicrotask(function focusMovedItem(): void {
            document.getElementById(`${props.listId}-${id}`)?.focus();
        });
    }

    return (
        <ol class="stack stack--tight" aria-label={props.label}>
            <For each={props.order}>
                {function id(itemId, index): JSX.Element {
                    const item = byId().get(itemId);
                    return (
                        <li
                            class="surface surface--quiet row row--between"
                            id={`${props.listId}-${itemId}`}
                            tabindex="-1"
                        >
                            <span>{item?.label ?? itemId}</span>
                            <span class="row">
                                <button
                                    type="button"
                                    class="button button--secondary button--small"
                                    aria-label={`Move ${item?.label ?? itemId} up`}
                                    disabled={index() === 0}
                                    onClick={function moveUp(): void {
                                        move(index(), -1, itemId);
                                    }}
                                >
                                    Move up
                                </button>
                                <button
                                    type="button"
                                    class="button button--secondary button--small"
                                    aria-label={`Move ${item?.label ?? itemId} down`}
                                    disabled={index() === props.order.length - 1}
                                    onClick={function moveDown(): void {
                                        move(index(), 1, itemId);
                                    }}
                                >
                                    Move down
                                </button>
                            </span>
                        </li>
                    );
                }}
            </For>
        </ol>
    );
}

function moveItem(current: readonly string[], index: number, delta: number): readonly string[] {
    const target = index + delta;
    if (target < 0 || target >= current.length) {
        return current;
    }
    const next = [...current];
    const item = next[index];
    const displaced = next[target];
    if (item === undefined || displaced === undefined) {
        return current;
    }
    next[index] = displaced;
    next[target] = item;
    return next;
}

export function OrderView(props: { readonly step: OrderStep } & InteractionProps): JSX.Element {
    const [order, setOrder] = createSignal<readonly string[]>(
        props.step.items.map(function idOf(item): string {
            return item.id;
        }),
    );

    return (
        <div class="stack">
            <ReorderList
                items={props.step.items}
                order={order()}
                label="Ordered steps"
                listId={`order-${props.step.id}`}
                onMove={function onMove(index, delta): void {
                    setOrder(function update(current): readonly string[] {
                        return moveItem(current, index, delta);
                    });
                }}
            />
            <button
                type="button"
                class="button"
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, { kind: "order", order: order() }),
                        order().join(","),
                    );
                }}
            >
                Check order
            </button>
        </div>
    );
}

export function LoopView(props: { readonly step: LoopStep } & InteractionProps): JSX.Element {
    const [repeat, setRepeat] = createSignal(0);
    const [body, setBody] = createSignal<readonly string[]>(
        props.step.bodyItems.map(function idOf(item): string {
            return item.id;
        }),
    );

    return (
        <div class="stack">
            <fieldset class="stack stack--tight">
                <legend class="meta">Repetitions</legend>
                <div class="row">
                    <For each={props.step.repeatChoices}>
                        {function choice(value): JSX.Element {
                            return (
                                <label class="choice">
                                    <input
                                        type="radio"
                                        name={`repeat-${props.step.id}`}
                                        checked={repeat() === value}
                                        onChange={function choose(): void {
                                            setRepeat(value);
                                        }}
                                    />
                                    <span class="choice__text">{value} times</span>
                                </label>
                            );
                        }}
                    </For>
                </div>
            </fieldset>
            <div class="stack stack--tight">
                <span class="meta">Work inside each repetition</span>
                <ReorderList
                    items={props.step.bodyItems}
                    order={body()}
                    label="Repeated work"
                    listId={`loop-${props.step.id}`}
                    onMove={function onMove(index, delta): void {
                        setBody(function update(current): readonly string[] {
                            return moveItem(current, index, delta);
                        });
                    }}
                />
            </div>
            <button
                type="button"
                class="button"
                disabled={repeat() === 0}
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, { kind: "loop", repeat: repeat(), body: body() }),
                        `${repeat()}:${body().join(",")}`,
                    );
                }}
            >
                Run loop plan
            </button>
        </div>
    );
}
