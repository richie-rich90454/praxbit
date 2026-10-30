import { For, Show, createSignal, onMount, type JSX } from "solid-js";
import { evaluateStep } from "@praxbit/domain";
import {
    TerminalSimulator,
    terminalObjectiveIds,
    type TerminalSnapshot,
} from "@praxbit/execution/simulated";
import type { TerminalStep } from "@praxbit/contracts";
import { announce } from "../../../app/AppShell.tsx";
import type { InteractionProps } from "./types.ts";

export function TerminalView(
    props: { readonly step: TerminalStep } & InteractionProps,
): JSX.Element {
    const simulator = new TerminalSimulator(props.step.initial);
    let inputElement: HTMLInputElement | undefined;
    const [state, setState] = createSignal<TerminalSnapshot>(simulator.snapshot());
    const [command, setCommand] = createSignal("");
    const [completed, setCompleted] = createSignal<readonly string[]>([]);

    onMount(function focus(): void {
        inputElement?.focus();
    });

    function runCommand(): void {
        const entry = (inputElement?.value ?? command()).trim();
        if (entry.length === 0) {
            return;
        }
        const result = simulator.execute(entry);
        setState(result.state);
        setCompleted(terminalObjectiveIds(result.state, props.step.objectives));
        setCommand("");
        inputElement?.focus();
    }

    function submit(): void {
        const current = state();
        const objectiveIds = terminalObjectiveIds(current, props.step.objectives);
        setCompleted(objectiveIds);
        announce(`${objectiveIds.length} of ${props.step.objectives.length} objectives complete.`);
        props.onResult(
            evaluateStep(props.step, {
                kind: "terminal",
                completedObjectiveIds: objectiveIds,
                transcript: current.transcript.map(function lineOf(item): string {
                    return `${item.command}\n${item.output}`;
                }),
            }),
        );
    }

    return (
        <div class="stack">
            <p class="meta">
                Deterministic Linux simulation. The files, processes, permissions, and services
                below are state inside this exercise, not a real machine. Command behavior is
                constrained to what the exercise needs.
            </p>
            <div class="surface surface--quiet stack stack--tight">
                <h3>Objectives</h3>
                <ul class="stack stack--tight">
                    <For each={props.step.objectives}>
                        {function objective(item): JSX.Element {
                            return (
                                <li>
                                    <span
                                        class={`status ${completed().includes(item.id) ? "status--success" : "status--warning"}`}
                                    >
                                        <span class="status__mark" aria-hidden="true" />
                                        {completed().includes(item.id)
                                            ? "Complete"
                                            : "Not yet"}:{" "}
                                        {item.description}
                                    </span>
                                </li>
                            );
                        }}
                    </For>
                </ul>
            </div>
            <div
                class="terminal"
                role="log"
                aria-live="polite"
                aria-label="Terminal output"
                tabindex="0"
            >
                <For each={state().transcript}>
                    {function entry(item): JSX.Element {
                        return (
                            <div class="terminal__line">
                                <span class="terminal__prompt">campus@praxbit:~$ </span>
                                {item.command}
                                <Show when={item.output.length > 0}>
                                    <pre
                                        class="terminal__line"
                                        style={{ "white-space": "pre-wrap" }}
                                    >
                                        {item.output}
                                    </pre>
                                </Show>
                            </div>
                        );
                    }}
                </For>
            </div>
            <form
                class="terminal__input-row"
                onSubmit={function submitCommand(event): void {
                    event.preventDefault();
                    runCommand();
                }}
            >
                <label class="terminal__label" for={`terminal-${props.step.id}`}>
                    Terminal command
                </label>
                <span class="terminal__prompt" aria-hidden="true">
                    {state().cwd} $
                </span>
                <input
                    id={`terminal-${props.step.id}`}
                    ref={inputElement}
                    class="terminal__input"
                    value={command()}
                    autocomplete="off"
                    spellcheck={false}
                    onInput={function change(event): void {
                        setCommand(event.currentTarget.value);
                    }}
                />
                <button type="submit" class="button button--small">
                    Run
                </button>
            </form>
            <div class="row">
                <button type="button" class="button" onClick={submit}>
                    Check objectives
                </button>
                <span class="meta">Try help for the supported command list.</span>
            </div>
        </div>
    );
}
