import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { evaluateStep } from "@praxbit/domain";
import type { MachineStep, QuizDefinition } from "@praxbit/contracts";
import type { InteractionProps } from "./types.ts";

function InlineQuiz(props: {
    readonly title: string;
    readonly quiz: QuizDefinition;
    readonly name: string;
    readonly selected: string;
    readonly onSelect: (id: string) => void;
}): JSX.Element {
    return (
        <fieldset class="stack stack--tight">
            <legend>
                <strong>{props.title}</strong>
            </legend>
            <p class="small">{props.quiz.prompt}</p>
            <For each={props.quiz.options}>
                {function option(item): JSX.Element {
                    return (
                        <label class="choice">
                            <input
                                type="radio"
                                name={props.name}
                                value={item.id}
                                checked={props.selected === item.id}
                                onChange={function choose(): void {
                                    props.onSelect(item.id);
                                }}
                            />
                            <span class="choice__text">{item.label}</span>
                        </label>
                    );
                }}
            </For>
        </fieldset>
    );
}

export function MachineView(props: { readonly step: MachineStep } & InteractionProps): JSX.Element {
    const initialValues: Record<string, string> = {};
    for (const input of props.step.machine.inputs) {
        initialValues[input.id] = input.type === "number" ? String(input.min ?? 1) : "";
    }
    const [values, setValues] = createSignal<Readonly<Record<string, string>>>(initialValues);
    const [runs, setRuns] = createSignal(0);
    const [output, setOutput] = createSignal("");
    const [error, setError] = createSignal("");
    const [prediction, setPrediction] = createSignal("");
    const [transfer, setTransfer] = createSignal("");

    const machine = props.step.machine;

    const computedOutput = createMemo(function computeOutput(): string {
        const inputs = values();
        switch (machine.kind) {
            case "dot-stamp": {
                const count = Number(inputs["count"] ?? "0");
                return Number.isFinite(count) && count > 0
                    ? "•".repeat(Math.min(24, Math.floor(count)))
                    : "";
            }
            case "uppercase":
                return (inputs["text"] ?? "").toUpperCase();
            case "even-gate": {
                const value = Number(inputs["value"] ?? "0");
                return Number.isFinite(value) ? (value % 2 === 0 ? "Even" : "Odd") : "";
            }
            case "sum": {
                const left = Number(inputs["left"] ?? "0");
                const right = Number(inputs["right"] ?? "0");
                return Number.isFinite(left) && Number.isFinite(right) ? String(left + right) : "";
            }
            case "greeting":
                return (inputs["name"] ?? "").trim().length === 0
                    ? ""
                    : `Welcome, ${(inputs["name"] ?? "").trim()}`;
            default:
                return "";
        }
    });

    function run(): void {
        const result = computedOutput();
        if (result.length === 0) {
            setError("Fill in every input before running the machine.");
            return;
        }
        setError("");
        setOutput(result);
        setRuns(function increment(current): number {
            return current + 1;
        });
    }

    const enoughRuns = createMemo(function enough(): boolean {
        return runs() >= machine.minRuns;
    });

    return (
        <div class="stack">
            <div class="surface stack">
                <div class="grid grid--two">
                    <For each={machine.inputs}>
                        {function input(item): JSX.Element {
                            return (
                                <div class="field">
                                    <label for={`machine-${props.step.id}-${item.id}`}>
                                        {item.label}
                                    </label>
                                    <input
                                        id={`machine-${props.step.id}-${item.id}`}
                                        class="input"
                                        type={item.type === "number" ? "number" : "text"}
                                        min={item.min}
                                        max={item.max}
                                        placeholder={item.placeholder ?? ""}
                                        value={values()[item.id] ?? ""}
                                        onInput={function change(event): void {
                                            const next = event.currentTarget.value;
                                            setValues(function update(current): Readonly<
                                                Record<string, string>
                                            > {
                                                return { ...current, [item.id]: next };
                                            });
                                        }}
                                    />
                                </div>
                            );
                        }}
                    </For>
                </div>
                <div class="row">
                    <button type="button" class="button" onClick={run}>
                        Run machine
                    </button>
                    <span class="meta">
                        {runs()} {runs() === 1 ? "run" : "runs"}
                        {enoughRuns() ? "" : `, at least ${machine.minRuns} needed`}
                    </span>
                </div>
                <Show when={error().length > 0}>
                    <p class="feedback feedback--error" role="alert">
                        {error()}
                    </p>
                </Show>
                <div class="stack stack--tight" aria-live="polite">
                    <span class="meta">{machine.outputLabel}</span>
                    <Show
                        when={output().length > 0}
                        fallback={
                            <p class="muted">No output yet. Run the machine to see a result.</p>
                        }
                    >
                        <Show when={machine.kind === "dot-stamp"}>
                            <div class="row" aria-label={`${output().length} marks`}>
                                <For each={Array.from({ length: output().length })}>
                                    {function mark(): JSX.Element {
                                        return (
                                            <span
                                                aria-hidden="true"
                                                style={{
                                                    width: "18px",
                                                    height: "18px",
                                                    background: "var(--accent)",
                                                    "border-radius": "3px",
                                                    display: "inline-block",
                                                }}
                                            />
                                        );
                                    }}
                                </For>
                            </div>
                        </Show>
                        <p class="mono" aria-label={`Output: ${output()}`}>
                            {machine.kind === "dot-stamp" ? `${output().length} marks` : output()}
                        </p>
                    </Show>
                </div>
            </div>

            <InlineQuiz
                title="Predict the next result"
                quiz={props.step.prediction}
                name={`prediction-${props.step.id}`}
                selected={prediction()}
                onSelect={setPrediction}
            />
            <InlineQuiz
                title="Transfer the idea"
                quiz={props.step.transfer}
                name={`transfer-${props.step.id}`}
                selected={transfer()}
                onSelect={setTransfer}
            />

            <button
                type="button"
                class="button"
                disabled={!enoughRuns() || prediction().length === 0 || transfer().length === 0}
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, {
                            kind: "machine",
                            runs: runs(),
                            predictionId: prediction(),
                            transferId: transfer(),
                        }),
                        prediction(),
                    );
                }}
            >
                Check prediction
            </button>
        </div>
    );
}
