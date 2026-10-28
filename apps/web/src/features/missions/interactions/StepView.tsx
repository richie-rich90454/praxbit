import type { JSX } from "solid-js";
import type { MissionStep } from "@praxbit/contracts";
import type { StepEvaluation } from "@praxbit/domain";
import { LessonView, MultiSelectView, QuizView, ReviewView } from "./QuizViews.tsx";
import { MachineView } from "./MachineView.tsx";
import { LoopView, OrderView } from "./OrderViews.tsx";
import {
    BinaryView,
    DebugView,
    FilesystemView,
    NetworkView,
    RuleView,
    StateView,
    TraceView,
} from "./StateViews.tsx";
import { CodeView } from "./CodeView.tsx";
import { GitView } from "./GitView.tsx";
import { TerminalView } from "./TerminalView.tsx";

export interface StepViewProps {
    readonly step: MissionStep;
    readonly draftKey: string;
    readonly onResult: (evaluation: StepEvaluation, answerKey?: string) => void;
}

export function StepView(props: StepViewProps): JSX.Element {
    const step = props.step;
    switch (step.kind) {
        case "lesson":
            return <LessonView step={step} onResult={props.onResult} />;
        case "quiz":
            return <QuizView step={step} onResult={props.onResult} />;
        case "machine":
            return <MachineView step={step} onResult={props.onResult} />;
        case "order":
            return <OrderView step={step} onResult={props.onResult} />;
        case "state":
            return <StateView step={step} onResult={props.onResult} />;
        case "rule":
            return <RuleView step={step} onResult={props.onResult} />;
        case "loop":
            return <LoopView step={step} onResult={props.onResult} />;
        case "trace":
            return <TraceView step={step} onResult={props.onResult} />;
        case "debug":
            return <DebugView step={step} onResult={props.onResult} />;
        case "binary":
            return <BinaryView step={step} onResult={props.onResult} />;
        case "filesystem":
            return <FilesystemView step={step} onResult={props.onResult} />;
        case "network":
            return <NetworkView step={step} onResult={props.onResult} />;
        case "review":
            return <ReviewView step={step} onResult={props.onResult} />;
        case "code":
            return <CodeView step={step} draftKey={props.draftKey} onResult={props.onResult} />;
        case "git":
            return <GitView step={step} onResult={props.onResult} />;
        case "terminal":
            return <TerminalView step={step} onResult={props.onResult} />;
        case "test-design":
            return <MultiSelectView step={step} onResult={props.onResult} />;
        case "explain":
            return <MultiSelectView step={step} onResult={props.onResult} />;
        default:
            return (
                <p class="feedback feedback--error">
                    This step type is not available in this client.
                </p>
            );
    }
}
