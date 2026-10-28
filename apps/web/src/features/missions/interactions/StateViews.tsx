import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { evaluateStep } from "@praxbit/domain";
import type {
    BinaryStep,
    DebugStep,
    FilesystemStep,
    NetworkStep,
    RuleStep,
    StateStep,
    TraceStep,
} from "@praxbit/contracts";
import type { InteractionProps } from "./types.ts";

export function StateView(props: { readonly step: StateStep } & InteractionProps): JSX.Element {
    const initial: Record<string, string> = {};
    for (const cell of props.step.cells) {
        initial[cell.id] = cell.initial;
    }
    const [values, setValues] = createSignal<Readonly<Record<string, string>>>(initial);

    function apply(operationId: string): void {
        const operation = props.step.operations.find(function match(item): boolean {
            return item.id === operationId;
        });
        if (operation === undefined) {
            return;
        }
        setValues(function update(current): Readonly<Record<string, string>> {
            return { ...current, ...operation.effects };
        });
    }

    return (
        <div class="stack">
            <div class="grid grid--two">
                <div class="surface stack stack--tight">
                    <h3>Memory</h3>
                    <For each={props.step.cells}>
                        {function cell(item): JSX.Element {
                            return (
                                <div class="row row--between">
                                    <span>{item.label}</span>
                                    <code class="inline-code">{values()[item.id] ?? item.initial}</code>
                                </div>
                            );
                        }}
                    </For>
                </div>
                <div class="surface stack stack--tight">
                    <h3>Target state</h3>
                    <For each={Object.entries(props.step.target)}>
                        {function entry(item): JSX.Element {
                            const cell = props.step.cells.find(function match(candidate): boolean {
                                return candidate.id === item[0];
                            });
                            return (
                                <div class="row row--between">
                                    <span>{cell?.label ?? item[0]}</span>
                                    <code class="inline-code">{item[1]}</code>
                                </div>
                            );
                        }}
                    </For>
                </div>
            </div>
            <div class="stack stack--tight">
                <span class="meta">Operations</span>
                <div class="row">
                    <For each={props.step.operations}>
                        {function operation(item): JSX.Element {
                            return (
                                <button
                                    type="button"
                                    class="button button--secondary button--small"
                                    onClick={function run(): void {
                                        apply(item.id);
                                    }}
                                >
                                    {item.label}
                                </button>
                            );
                        }}
                    </For>
                </div>
            </div>
            <button
                type="button"
                class="button"
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, { kind: "state", values: values() }),
                        JSON.stringify(values()),
                    );
                }}
            >
                Check state
            </button>
        </div>
    );
}

export function RuleView(props: { readonly step: RuleStep } & InteractionProps): JSX.Element {
    const [rule, setRule] = createSignal("");

    return (
        <div class="stack">
            <fieldset class="stack stack--tight">
                <legend class="meta">Candidate rules</legend>
                <For each={props.step.rules}>
                    {function option(item): JSX.Element {
                        return (
                            <label class="choice">
                                <input
                                    type="radio"
                                    name={`rule-${props.step.id}`}
                                    checked={rule() === item.id}
                                    onChange={function choose(): void {
                                        setRule(item.id);
                                    }}
                                />
                                <span class="choice__text">{item.label}</span>
                            </label>
                        );
                    }}
                </For>
            </fieldset>
            <table class="data-table">
                <caption class="meta">Required outcomes</caption>
                <thead>
                    <tr>
                        <th scope="col">Case</th>
                        <th scope="col">Required outcome</th>
                    </tr>
                </thead>
                <tbody>
                    <For each={props.step.inputs}>
                        {function input(item): JSX.Element {
                            const expected = props.step.expected.find(function match(candidate): boolean {
                                return candidate.inputId === item.id;
                            });
                            return (
                                <tr>
                                    <td>{item.label}</td>
                                    <td>{expected?.outcome ?? "reject"}</td>
                                </tr>
                            );
                        }}
                    </For>
                </tbody>
            </table>
            <button
                type="button"
                class="button"
                disabled={rule().length === 0}
                onClick={function submit(): void {
                    props.onResult(evaluateStep(props.step, { kind: "rule", ruleId: rule() }), rule());
                }}
            >
                Apply rule
            </button>
        </div>
    );
}

export function TraceView(props: { readonly step: TraceStep } & InteractionProps): JSX.Element {
    const [index, setIndex] = createSignal(0);
    const [values, setValues] = createSignal<Readonly<Record<string, string>>>({});
    const snapshot = createMemo(function currentSnapshot() {
        return props.step.snapshots[Math.min(index(), props.step.snapshots.length - 1)];
    });
    const activeLine = createMemo(function active() {
        const id = snapshot()?.lineId;
        return props.step.lines.find(function match(line): boolean {
            return line.id === id;
        });
    });
    const atEnd = createMemo(function end(): boolean {
        return index() >= props.step.snapshots.length - 1;
    });

    return (
        <div class="stack">
            <div class="surface stack stack--tight">
                <pre class="mono">
                    <For each={props.step.lines}>
                        {function line(item): JSX.Element {
                            return (
                                <div
                                    style={{
                                        background: activeLine()?.id === item.id ? "#F1D9D5" : "transparent",
                                        padding: "2px 6px",
                                    }}
                                >
                                    <code>{item.code}</code>
                                </div>
                            );
                        }}
                    </For>
                </pre>
                <Show when={snapshot()?.note !== undefined}>
                    <p class="small muted">{snapshot()?.note}</p>
                </Show>
                <div class="row">
                    <button
                        type="button"
                        class="button button--secondary button--small"
                        onClick={function restart(): void {
                            setIndex(0);
                            setValues({});
                        }}
                    >
                        Restart trace
                    </button>
                    <button
                        type="button"
                        class="button button--small"
                        disabled={atEnd()}
                        onClick={function next(): void {
                            setIndex(function increment(current): number {
                                return Math.min(current + 1, props.step.snapshots.length - 1);
                            });
                        }}
                    >
                        Next line
                    </button>
                </div>
            </div>
            <table class="data-table">
                <caption class="meta">Watched values</caption>
                <thead>
                    <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Value</th>
                    </tr>
                </thead>
                <tbody>
                    <For each={props.step.watches}>
                        {function watch(item): JSX.Element {
                            return (
                                <tr>
                                    <td>{item.label}</td>
                                    <td>
                                        <code>{snapshot()?.values[item.id] ?? item.initial}</code>
                                    </td>
                                </tr>
                            );
                        }}
                    </For>
                </tbody>
            </table>
            <div class="surface stack stack--tight">
                <h3>Final values</h3>
                <For each={props.step.watches}>
                    {function watch(item): JSX.Element {
                        return (
                            <div class="field">
                                <label for={`watch-${props.step.id}-${item.id}`}>{item.label}</label>
                                <input
                                    id={`watch-${props.step.id}-${item.id}`}
                                    class="input"
                                    value={values()[item.id] ?? ""}
                                    onInput={function change(event): void {
                                        const next = event.currentTarget.value;
                                        setValues(function update(current): Readonly<Record<string, string>> {
                                            return { ...current, [item.id]: next };
                                        });
                                    }}
                                />
                            </div>
                        );
                    }}
                </For>
                <button
                    type="button"
                    class="button"
                    onClick={function submit(): void {
                        props.onResult(
                            evaluateStep(props.step, { kind: "trace", values: values() }),
                            JSON.stringify(values()),
                        );
                    }}
                >
                    Check final values
                </button>
            </div>
        </div>
    );
}

export function DebugView(props: { readonly step: DebugStep } & InteractionProps): JSX.Element {
    const [buggy, setBuggy] = createSignal("");
    const [fix, setFix] = createSignal("");

    return (
        <div class="stack">
            <fieldset class="stack stack--tight">
                <legend class="meta">Instructions</legend>
                <For each={props.step.instructions}>
                    {function instruction(item): JSX.Element {
                        return (
                            <label class="choice">
                                <input
                                    type="radio"
                                    name={`buggy-${props.step.id}`}
                                    checked={buggy() === item.id}
                                    onChange={function choose(): void {
                                        setBuggy(item.id);
                                    }}
                                />
                                <span class="choice__text">{item.label}</span>
                            </label>
                        );
                    }}
                </For>
            </fieldset>
            <fieldset class="stack stack--tight">
                <legend class="meta">Repair</legend>
                <For each={props.step.fixes}>
                    {function repair(item): JSX.Element {
                        return (
                            <label class="choice">
                                <input
                                    type="radio"
                                    name={`fix-${props.step.id}`}
                                    checked={fix() === item.id}
                                    onChange={function choose(): void {
                                        setFix(item.id);
                                    }}
                                />
                                <span class="choice__text">{item.label}</span>
                            </label>
                        );
                    }}
                </For>
            </fieldset>
            <button
                type="button"
                class="button"
                disabled={buggy().length === 0 || fix().length === 0}
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, { kind: "debug", buggyId: buggy(), fixId: fix() }),
                        `${buggy()}:${fix()}`,
                    );
                }}
            >
                Submit repair
            </button>
        </div>
    );
}

export function BinaryView(props: { readonly step: BinaryStep } & InteractionProps): JSX.Element {
    const characters = props.step.message.split("");
    const [bytes, setBytes] = createSignal<readonly string[]>(
        characters.map(function empty(): string {
            return "00000000";
        }),
    );

    function toggle(charIndex: number, bitIndex: number): void {
        setBytes(function update(current): readonly string[] {
            return current.map(function mapByte(bits, index): string {
                if (index !== charIndex) {
                    return bits;
                }
                const position = bits.length - 1 - bitIndex;
                const digits = bits.split("");
                digits[position] = digits[position] === "1" ? "0" : "1";
                return digits.join("");
            });
        });
    }

    return (
        <div class="stack">
            <div class="stack stack--tight">
                <For each={characters}>
                    {function character(char, charIndex): JSX.Element {
                        return (
                            <div class="surface surface--quiet stack stack--tight">
                                <div class="row row--between">
                                    <strong>{char}</strong>
                                    <code class="mono">{bytes()[charIndex()] ?? "00000000"}</code>
                                </div>
                                <div class="row" role="group" aria-label={`Bits for ${char}`}>
                                    <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                                        {function bit(bitIndex): JSX.Element {
                                            const bits = bytes()[charIndex()] ?? "00000000";
                                            const value = bits[bitIndex] ?? "0";
                                            return (
                                                <button
                                                    type="button"
                                                    class="button button--secondary button--small mono"
                                                    aria-pressed={value === "1"}
                                                    aria-label={`${char} bit ${bitIndex + 1}, value ${value}`}
                                                    onClick={function toggleBit(): void {
                                                        toggle(charIndex(), bitIndex);
                                                    }}
                                                >
                                                    {value}
                                                </button>
                                            );
                                        }}
                                    </For>
                                </div>
                            </div>
                        );
                    }}
                </For>
            </div>
            <div class="surface surface--quiet stack stack--tight">
                <h3>Reference</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th scope="col">Character</th>
                            <th scope="col">Bits</th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={props.step.reference}>
                            {function row(item): JSX.Element {
                                return (
                                    <tr>
                                        <td>{item.char}</td>
                                        <td class="mono">{item.bits}</td>
                                    </tr>
                                );
                            }}
                        </For>
                    </tbody>
                </table>
            </div>
            <button
                type="button"
                class="button"
                onClick={function submit(): void {
                    const bits = bytes().join("");
                    props.onResult(evaluateStep(props.step, { kind: "binary", bits }), bits);
                }}
            >
                Send bytes
            </button>
        </div>
    );
}

function nodeParent(path: string): string {
    const index = path.lastIndexOf("/");
    return index < 0 ? "" : path.slice(0, index);
}

export function FilesystemView(props: { readonly step: FilesystemStep } & InteractionProps): JSX.Element {
    const [current, setCurrent] = createSignal<readonly string[]>([]);
    const [selected, setSelected] = createSignal<readonly string[]>([]);

    const currentPath = createMemo(function path(): string {
        return current().join("/");
    });

    const children = createMemo(function list(): readonly { path: string; name: string; type: "folder" | "file"; note?: string }[] {
        return props.step.nodes
            .filter(function direct(node): boolean {
                return nodeParent(node.path) === currentPath();
            })
            .map(function entry(node): { path: string; name: string; type: "folder" | "file"; note?: string } {
                return {
                    path: node.path,
                    name: node.path.slice(node.path.lastIndexOf("/") + 1),
                    type: node.type,
                    ...(node.note === undefined ? {} : { note: node.note }),
                };
            })
            .sort(function foldersFirst(left, right): number {
                if (left.type !== right.type) {
                    return left.type === "folder" ? -1 : 1;
                }
                return left.name.localeCompare(right.name);
            });
    });

    function enter(path: string): void {
        setCurrent(path.split("/"));
        setSelected([]);
    }

    return (
        <div class="stack">
            <div class="row" aria-label="Breadcrumb">
                <button
                    type="button"
                    class="button button--ghost button--small"
                    onClick={function root(): void {
                        setCurrent([]);
                        setSelected([]);
                    }}
                >
                    root
                </button>
                <For each={current()}>
                    {function segment(name, index): JSX.Element {
                        return (
                            <button
                                type="button"
                                class="button button--ghost button--small"
                                onClick={function go(): void {
                                    setCurrent(current().slice(0, index() + 1));
                                    setSelected([]);
                                }}
                            >
                                {name}
                            </button>
                        );
                    }}
                </For>
            </div>
            <div class="surface surface--quiet stack stack--tight">
                <For each={children()}>
                    {function node(item): JSX.Element {
                        if (item.type === "folder") {
                            return (
                                <button
                                    type="button"
                                    class="button button--secondary row row--between"
                                    onClick={function open(): void {
                                        enter(item.path);
                                    }}
                                >
                                    <span>{item.name}</span>
                                    <span class="meta">folder</span>
                                </button>
                            );
                        }
                        const path = item.path.split("/");
                        return (
                            <label class="choice">
                                <input
                                    type="radio"
                                    name={`file-${props.step.id}`}
                                    checked={selected().join("/") === item.path}
                                    onChange={function choose(): void {
                                        setSelected(path);
                                    }}
                                />
                                <span class="choice__text">
                                    {item.name}
                                    <Show when={item.note !== undefined}>
                                        <span class="meta">{item.note}</span>
                                    </Show>
                                </span>
                            </label>
                        );
                    }}
                </For>
            </div>
            <Show when={selected().length > 0}>
                <p class="meta">Selected: {selected().join("/")}</p>
            </Show>
            <button
                type="button"
                class="button"
                disabled={selected().length === 0}
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, { kind: "filesystem", path: selected() }),
                        selected().join("/"),
                    );
                }}
            >
                Open selected file
            </button>
        </div>
    );
}

export function NetworkView(props: { readonly step: NetworkStep } & InteractionProps): JSX.Element {
    const [path, setPath] = createSignal<readonly string[]>([]);
    const start = props.step.nodes.find(function match(node): boolean {
        return node.id === props.step.startId;
    });

    function add(id: string): void {
        setPath(function update(current): readonly string[] {
            if (current.includes(id)) {
                return current;
            }
            return [...current, id];
        });
    }

    return (
        <div class="stack">
            <div class="surface surface--quiet stack stack--tight">
                <p>
                    <strong>Goal:</strong> {props.step.goal}
                </p>
                <p class="meta">Start: {start?.label ?? props.step.startId}</p>
                <div class="row">
                    <For each={props.step.nodes}>
                        {function node(item): JSX.Element {
                            return (
                                <button
                                    type="button"
                                    class="button button--secondary button--small"
                                    aria-pressed={path().includes(item.id)}
                                    onClick={function choose(): void {
                                        add(item.id);
                                    }}
                                >
                                    {item.label}
                                </button>
                            );
                        }}
                    </For>
                </div>
                <div class="row row--between">
                    <span class="meta">Route: {path().length === 0 ? "not started" : path().join(" → ")}</span>
                    <button
                        type="button"
                        class="button button--ghost button--small"
                        onClick={function reset(): void {
                            setPath([]);
                        }}
                    >
                        Reset route
                    </button>
                </div>
            </div>
            <button
                type="button"
                class="button"
                disabled={path().length === 0}
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, { kind: "network", path: path() }),
                        path().join(">"),
                    );
                }}
            >
                Send along route
            </button>
        </div>
    );
}
