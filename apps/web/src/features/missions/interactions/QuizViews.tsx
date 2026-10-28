import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { evaluateStep } from "@praxbit/domain";
import type {
    ExplainStep,
    LessonStep,
    QuizStep,
    ReviewStep,
    TestDesignStep,
} from "@praxbit/contracts";
import type { InteractionProps } from "./types.ts";

export function LessonView(props: {
    readonly step: LessonStep;
    readonly onResult: InteractionProps["onResult"];
}): JSX.Element {
    return (
        <div class="stack">
            <For each={props.step.sections}>
                {function section(item): JSX.Element {
                    return (
                        <div class="stack stack--tight">
                            <h3>{item.title}</h3>
                            <p>{item.body}</p>
                        </div>
                    );
                }}
            </For>
            <button
                type="button"
                class="button"
                onClick={function acknowledge(): void {
                    props.onResult(
                        evaluateStep(props.step, { kind: "lesson", acknowledged: true }),
                    );
                }}
            >
                Continue
            </button>
        </div>
    );
}

export function QuizView(props: { readonly step: QuizStep } & InteractionProps): JSX.Element {
    const [selected, setSelected] = createSignal("");

    return (
        <div class="stack">
            <p>{props.step.quiz.prompt}</p>
            <div class="stack stack--tight" role="radiogroup" aria-label={props.step.quiz.prompt}>
                <For each={props.step.quiz.options}>
                    {function option(item): JSX.Element {
                        return (
                            <label class="choice">
                                <input
                                    type="radio"
                                    name={`quiz-${props.step.id}`}
                                    value={item.id}
                                    checked={selected() === item.id}
                                    onChange={function choose(): void {
                                        setSelected(item.id);
                                    }}
                                />
                                <span class="choice__text">{item.label}</span>
                            </label>
                        );
                    }}
                </For>
            </div>
            <button
                type="button"
                class="button"
                disabled={selected().length === 0}
                onClick={function submit(): void {
                    const response = { kind: "quiz" as const, optionId: selected() };
                    props.onResult(evaluateStep(props.step, response), selected());
                }}
            >
                Check answer
            </button>
        </div>
    );
}

export function MultiSelectView(props: {
    readonly step: ExplainStep | TestDesignStep;
    readonly onResult: InteractionProps["onResult"];
}): JSX.Element {
    const [selected, setSelected] = createSignal<readonly string[]>([]);
    const options = createMemo(function optionsList(): readonly { id: string; label: string }[] {
        if (props.step.kind === "explain") {
            return props.step.statements.map(function mapStatement(statement): {
                id: string;
                label: string;
            } {
                return { id: statement.id, label: statement.label };
            });
        }
        return props.step.cases.map(function mapCase(item): { id: string; label: string } {
            return { id: item.id, label: item.label };
        });
    });

    function toggle(id: string): void {
        setSelected(function update(current): readonly string[] {
            return current.includes(id)
                ? current.filter(function keep(item): boolean {
                      return item !== id;
                  })
                : [...current, id];
        });
    }

    return (
        <div class="stack">
            <div class="stack stack--tight">
                <For each={options()}>
                    {function option(item): JSX.Element {
                        return (
                            <label class="choice">
                                <input
                                    type="checkbox"
                                    checked={selected().includes(item.id)}
                                    onChange={function change(): void {
                                        toggle(item.id);
                                    }}
                                />
                                <span class="choice__text">{item.label}</span>
                            </label>
                        );
                    }}
                </For>
            </div>
            <button
                type="button"
                class="button"
                disabled={selected().length === 0}
                onClick={function submit(): void {
                    if (props.step.kind === "explain") {
                        props.onResult(
                            evaluateStep(props.step, { kind: "explain", selected: selected() }),
                            selected().join(","),
                        );
                    } else {
                        props.onResult(
                            evaluateStep(props.step, { kind: "test-design", selected: selected() }),
                            selected().join(","),
                        );
                    }
                }}
            >
                Submit selection
            </button>
        </div>
    );
}

export function ReviewView(props: { readonly step: ReviewStep } & InteractionProps): JSX.Element {
    const [findings, setFindings] = createSignal<readonly string[]>([]);
    const [verdict, setVerdict] = createSignal("");

    function toggle(id: string): void {
        setFindings(function update(current): readonly string[] {
            return current.includes(id)
                ? current.filter(function keep(item): boolean {
                      return item !== id;
                  })
                : [...current, id];
        });
    }

    return (
        <div class="stack">
            <div class="surface surface--quiet stack stack--tight">
                <h3>{props.step.artifact.title}</h3>
                <p class="meta">{props.step.artifact.caption}</p>
                <pre class="mono" aria-label={`${props.step.artifact.title} content`}>
                    {props.step.artifact.content}
                </pre>
            </div>
            <fieldset class="stack stack--tight">
                <legend class="meta">Supported findings</legend>
                <For each={props.step.findings}>
                    {function finding(item): JSX.Element {
                        return (
                            <label class="choice">
                                <input
                                    type="checkbox"
                                    checked={findings().includes(item.id)}
                                    onChange={function change(): void {
                                        toggle(item.id);
                                    }}
                                />
                                <span class="choice__text">{item.label}</span>
                            </label>
                        );
                    }}
                </For>
            </fieldset>
            <fieldset class="stack stack--tight">
                <legend class="meta">Verdict</legend>
                <For each={props.step.verdicts}>
                    {function option(item): JSX.Element {
                        return (
                            <label class="choice">
                                <input
                                    type="radio"
                                    name={`verdict-${props.step.id}`}
                                    value={item.id}
                                    checked={verdict() === item.id}
                                    onChange={function choose(): void {
                                        setVerdict(item.id);
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
                disabled={verdict().length === 0}
                onClick={function submit(): void {
                    props.onResult(
                        evaluateStep(props.step, {
                            kind: "review",
                            findings: findings(),
                            verdict: verdict(),
                        }),
                        `${verdict()}:${findings().join(",")}`,
                    );
                }}
            >
                Submit review
            </button>
            <Show when={props.step.artifact.kind === "diff"}>
                <p class="meta">
                    The artifact is a diff. Lines beginning with minus were removed; plus lines were
                    added.
                </p>
            </Show>
        </div>
    );
}
