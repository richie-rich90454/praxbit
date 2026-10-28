import type { StepEvaluation } from "@praxbit/domain";

export interface InteractionProps {
    readonly onResult: (evaluation: StepEvaluation, answerKey?: string) => void;
}
