import type {
    BinaryStep,
    DebugStep,
    EvidenceCategory,
    ExplainStep,
    FilesystemStep,
    GitStep,
    LessonStep,
    LoopStep,
    MachineStep,
    Mission,
    MissionStep,
    NetworkStep,
    OrderStep,
    QuizStep,
    ReviewStep,
    RuleStep,
    StateStep,
    TerminalStep,
    TestDesignStep,
    TraceStep,
    CodeStep,
} from "@praxbit/contracts";

export type StepResponse =
    | { readonly kind: "lesson"; readonly acknowledged: boolean }
    | { readonly kind: "quiz"; readonly optionId: string }
    | {
          readonly kind: "machine";
          readonly runs: number;
          readonly predictionId: string;
          readonly transferId: string;
      }
    | { readonly kind: "order"; readonly order: readonly string[] }
    | { readonly kind: "state"; readonly values: Readonly<Record<string, string>> }
    | { readonly kind: "rule"; readonly ruleId: string }
    | { readonly kind: "loop"; readonly repeat: number; readonly body: readonly string[] }
    | { readonly kind: "trace"; readonly values: Readonly<Record<string, string>> }
    | { readonly kind: "debug"; readonly buggyId: string; readonly fixId: string }
    | { readonly kind: "binary"; readonly bits: string }
    | { readonly kind: "filesystem"; readonly path: readonly string[] }
    | { readonly kind: "network"; readonly path: readonly string[] }
    | {
          readonly kind: "review";
          readonly findings: readonly string[];
          readonly verdict: string;
      }
    | {
          readonly kind: "code";
          readonly passedTests: readonly string[];
          readonly failedTests: readonly string[];
          readonly totalTests: number;
      }
    | { readonly kind: "git"; readonly checks: Readonly<Record<string, boolean>>; readonly log: readonly string[] }
    | { readonly kind: "terminal"; readonly completedObjectiveIds: readonly string[]; readonly transcript: readonly string[] }
    | { readonly kind: "test-design"; readonly selected: readonly string[] }
    | { readonly kind: "explain"; readonly selected: readonly string[] };

export interface StepEvaluation {
    readonly stepId: string;
    readonly passed: boolean;
    readonly score: number;
    readonly detail: string;
    readonly answerKey?: string;
}

function clampScore(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    const leftSet = new Set(left);
    for (const item of right) {
        if (!leftSet.has(item)) {
            return false;
        }
    }
    return true;
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

function evaluateQuiz(step: QuizStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "quiz") {
        return mismatch(step.id, "Choose one of the options.");
    }
    const passed = response.optionId === step.quiz.correctId;
    return {
        stepId: step.id,
        passed,
        score: passed ? 1 : 0,
        detail: passed ? step.quiz.explanation : "That answer does not match the rule yet.",
        answerKey: response.optionId,
    };
}

function evaluateLesson(step: LessonStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "lesson") {
        return mismatch(step.id, "Continue when you have read the explanation.");
    }
    return {
        stepId: step.id,
        passed: response.acknowledged,
        score: response.acknowledged ? 1 : 0,
        detail: "Explanation acknowledged.",
    };
}

function evaluateMachine(step: MachineStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "machine") {
        return mismatch(step.id, "Run the machine, then answer the prediction.");
    }
    const ranEnough = response.runs >= step.machine.minRuns;
    const predicted = response.predictionId === step.prediction.correctId;
    const transferred = response.transferId === step.transfer.correctId;
    const score = (ranEnough ? 0.2 : 0) + (predicted ? 0.4 : 0) + (transferred ? 0.4 : 0);
    return {
        stepId: step.id,
        passed: ranEnough && predicted && transferred,
        score: clampScore(score),
        detail: transferred
            ? step.transfer.explanation
            : predicted
              ? step.prediction.explanation
              : "Test the machine with a few more inputs, then compare the rule with your prediction.",
        answerKey: response.predictionId,
    };
}

function evaluateOrder(step: OrderStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "order") {
        return mismatch(step.id, "Arrange the steps in order.");
    }
    const passed = sameSequence(response.order, step.correctOrder);
    let correct = 0;
    for (let index = 0; index < step.correctOrder.length; index += 1) {
        if (response.order[index] === step.correctOrder[index]) {
            correct += 1;
        }
    }
    return {
        stepId: step.id,
        passed,
        score: clampScore(correct / step.correctOrder.length),
        detail: passed ? step.explanation : "At least one instruction is out of order.",
        answerKey: response.order.join(","),
    };
}

function evaluateState(step: StateStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "state") {
        return mismatch(step.id, "Apply operations until the memory matches the target.");
    }
    const targetEntries = Object.entries(step.target);
    let correct = 0;
    for (const [cell, value] of targetEntries) {
        if ((response.values[cell] ?? "") === value) {
            correct += 1;
        }
    }
    const passed = correct === targetEntries.length;
    return {
        stepId: step.id,
        passed,
        score: clampScore(targetEntries.length === 0 ? 1 : correct / targetEntries.length),
        detail: passed ? step.explanation : "The stored values do not match the target state yet.",
        answerKey: JSON.stringify(response.values),
    };
}

function evaluateRule(step: RuleStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "rule") {
        return mismatch(step.id, "Choose a decision rule.");
    }
    const passed = response.ruleId === step.correctRuleId;
    return {
        stepId: step.id,
        passed,
        score: passed ? 1 : 0,
        detail: passed ? step.explanation : "That rule does not produce the required outcome for every input.",
        answerKey: response.ruleId,
    };
}

function evaluateLoop(step: LoopStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "loop") {
        return mismatch(step.id, "Choose how many repetitions and what each repetition does.");
    }
    const repeatOk = response.repeat === step.correctRepeat;
    const bodyOk = sameSequence(response.body, step.correctBody);
    const passed = repeatOk && bodyOk;
    return {
        stepId: step.id,
        passed,
        score: clampScore((repeatOk ? 0.5 : 0) + (bodyOk ? 0.5 : 0)),
        detail: passed ? step.explanation : "Check both the number of repetitions and the order of the repeated work.",
        answerKey: `${response.repeat}:${response.body.join(",")}`,
    };
}

function evaluateTrace(step: TraceStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "trace") {
        return mismatch(step.id, "Step through the program and record the final values.");
    }
    const finalSnapshot = step.snapshots[step.snapshots.length - 1];
    const expected = finalSnapshot?.values ?? {};
    const entries = Object.entries(expected);
    let correct = 0;
    for (const [watchId, value] of entries) {
        if ((response.values[watchId] ?? "").trim() === value) {
            correct += 1;
        }
    }
    const passed = correct === entries.length;
    return {
        stepId: step.id,
        passed,
        score: clampScore(entries.length === 0 ? 1 : correct / entries.length),
        detail: passed ? step.explanation : "At least one watched value differs from the trace.",
        answerKey: JSON.stringify(response.values),
    };
}

function evaluateDebug(step: DebugStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "debug") {
        return mismatch(step.id, "Identify the faulty instruction and choose a repair.");
    }
    const buggyOk = response.buggyId === step.buggyId;
    const fixOk = response.fixId === step.correctFixId;
    const passed = buggyOk && fixOk;
    return {
        stepId: step.id,
        passed,
        score: clampScore((buggyOk ? 0.5 : 0) + (fixOk ? 0.5 : 0)),
        detail: passed ? step.explanation : buggyOk ? "The instruction is right, but the replacement is not." : "That instruction still behaves correctly.",
        answerKey: `${response.buggyId}:${response.fixId}`,
    };
}

function evaluateBinary(step: BinaryStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "binary") {
        return mismatch(step.id, "Encode the message as bits.");
    }
    const expected = step.expectedBits;
    const actual = response.bits.replace(/\s+/g, "");
    let correct = 0;
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
        if (expected[index] === actual[index]) {
            correct += 1;
        }
    }
    const passed = actual === expected;
    return {
        stepId: step.id,
        passed,
        score: clampScore(length === 0 ? 1 : correct / length),
        detail: passed ? step.explanation : "Compare each byte with the reference table. Bits are read from left to right.",
        answerKey: actual,
    };
}

function evaluateFilesystem(step: FilesystemStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "filesystem") {
        return mismatch(step.id, "Navigate the folders and select the file.");
    }
    const passed = sameSequence(response.path, step.targetPath);
    return {
        stepId: step.id,
        passed,
        score: passed ? 1 : 0,
        detail: passed ? step.explanation : "That is not the requested location.",
        answerKey: response.path.join("/"),
    };
}

function evaluateNetwork(step: NetworkStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "network") {
        return mismatch(step.id, "Trace the request through the network.");
    }
    const passed = sameSequence(response.path, step.correctPath);
    let prefix = 0;
    while (prefix < response.path.length && response.path[prefix] === step.correctPath[prefix]) {
        prefix += 1;
    }
    return {
        stepId: step.id,
        passed,
        score: clampScore(prefix / step.correctPath.length),
        detail: passed ? step.explanation : "The request leaves the correct starting point, but the route is not right.",
        answerKey: response.path.join(">"),
    };
}

function evaluateReview(step: ReviewStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "review") {
        return mismatch(step.id, "Inspect the artifact and choose your findings.");
    }
    const correctFindings = step.findings
        .filter(function isCorrect(finding): boolean {
            return finding.correct;
        })
        .map(function idOf(finding): string {
            return finding.id;
        });
    const selected = new Set(response.findings);
    let truePositives = 0;
    let falsePositives = 0;
    for (const findingId of correctFindings) {
        if (selected.has(findingId)) {
            truePositives += 1;
        }
    }
    for (const findingId of response.findings) {
        const finding = step.findings.find(function match(item): boolean {
            return item.id === findingId;
        });
        if (finding !== undefined && !finding.correct) {
            falsePositives += 1;
        }
    }
    const verdictOk = response.verdict === step.correctVerdict;
    const passed = truePositives === correctFindings.length && falsePositives === 0 && verdictOk;
    const findingScore = Math.max(0, truePositives - falsePositives) / Math.max(1, correctFindings.length);
    return {
        stepId: step.id,
        passed,
        score: clampScore(findingScore * 0.75 + (verdictOk ? 0.25 : 0)),
        detail: passed ? step.explanation : "Re-examine the evidence. Some findings are missing or not supported.",
        answerKey: `${response.verdict}:${response.findings.join(",")}`,
    };
}

function evaluateCode(step: CodeStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "code") {
        return mismatch(step.id, "Run the tests against your code.");
    }
    const passed = response.totalTests > 0 && response.failedTests.length === 0 && response.passedTests.length === response.totalTests;
    return {
        stepId: step.id,
        passed,
        score: clampScore(response.totalTests === 0 ? 0 : response.passedTests.length / response.totalTests),
        detail: passed
            ? "All tests pass. Passing tests are evidence, not proof that every possible behavior is correct."
            : `${response.failedTests.length} of ${response.totalTests} tests still fail.`,
    };
}

function evaluateGit(step: GitStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "git") {
        return mismatch(step.id, "Repair the repository with Git commands.");
    }
    const values = Object.values(response.checks);
    const passed = values.length > 0 && values.every(Boolean);
    const score = values.length === 0 ? 0 : values.filter(Boolean).length / values.length;
    return {
        stepId: step.id,
        passed,
        score: clampScore(score),
        detail: passed ? step.explanation : "The repository does not satisfy every check yet.",
    };
}

function evaluateTerminal(step: TerminalStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "terminal") {
        return mismatch(step.id, "Use the terminal to complete the objectives.");
    }
    const completed = new Set(response.completedObjectiveIds);
    let done = 0;
    for (const objective of step.objectives) {
        if (completed.has(objective.id)) {
            done += 1;
        }
    }
    const passed = done === step.objectives.length;
    return {
        stepId: step.id,
        passed,
        score: clampScore(step.objectives.length === 0 ? 1 : done / step.objectives.length),
        detail: passed ? step.explanation : "Some system objectives are not satisfied yet.",
    };
}

function evaluateTestDesign(step: TestDesignStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "test-design") {
        return mismatch(step.id, "Select the test cases you would keep.");
    }
    const expected = step.cases
        .filter(function shouldKeep(testCase): boolean {
            return testCase.shouldSelect;
        })
        .map(function idOf(testCase): string {
            return testCase.id;
        });
    const passed = sameSet(response.selected, expected);
    return {
        stepId: step.id,
        passed,
        score: passed ? 1 : 0,
        detail: passed ? step.explanation : "A useful test suite covers boundaries and ordinary cases, without redundant copies.",
        answerKey: response.selected.join(","),
    };
}

function evaluateExplain(step: ExplainStep, response: StepResponse): StepEvaluation {
    if (response.kind !== "explain") {
        return mismatch(step.id, "Select the statements that are accurate.");
    }
    const expected = step.statements
        .filter(function isCorrect(statement): boolean {
            return statement.correct;
        })
        .map(function idOf(statement): string {
            return statement.id;
        });
    const passed = sameSet(response.selected, expected);
    return {
        stepId: step.id,
        passed,
        score: passed ? 1 : 0,
        detail: passed ? step.explanation : "At least one selected statement is inaccurate or incomplete.",
        answerKey: response.selected.join(","),
    };
}

function mismatch(stepId: string, detail: string): StepEvaluation {
    return { stepId, passed: false, score: 0, detail };
}

export class RuntimeStepError extends Error {
    public constructor(stepId: string, kind: string) {
        super(`Step ${stepId} (${kind}) requires a runtime adapter.`);
        this.name = "RuntimeStepError";
    }
}

export function evaluateStep(step: MissionStep, response: StepResponse): StepEvaluation {
    switch (step.kind) {
        case "lesson":
            return evaluateLesson(step, response);
        case "quiz":
            return evaluateQuiz(step, response);
        case "machine":
            return evaluateMachine(step, response);
        case "order":
            return evaluateOrder(step, response);
        case "state":
            return evaluateState(step, response);
        case "rule":
            return evaluateRule(step, response);
        case "loop":
            return evaluateLoop(step, response);
        case "trace":
            return evaluateTrace(step, response);
        case "debug":
            return evaluateDebug(step, response);
        case "binary":
            return evaluateBinary(step, response);
        case "filesystem":
            return evaluateFilesystem(step, response);
        case "network":
            return evaluateNetwork(step, response);
        case "review":
            return evaluateReview(step, response);
        case "code":
            return evaluateCode(step, response);
        case "git":
            return evaluateGit(step, response);
        case "terminal":
            return evaluateTerminal(step, response);
        case "test-design":
            return evaluateTestDesign(step, response);
        case "explain":
            return evaluateExplain(step, response);
        default:
            throw new RuntimeStepError("unknown", "unknown");
    }
}

export function isRuntimeStep(step: MissionStep): boolean {
    return step.kind === "code" || step.kind === "git" || step.kind === "terminal";
}

export function defaultEvidenceCategory(step: MissionStep): EvidenceCategory {
    switch (step.kind) {
        case "lesson":
            return "explanation";
        case "quiz":
        case "machine":
        case "trace":
            return "prediction";
        case "order":
        case "state":
        case "loop":
        case "binary":
        case "filesystem":
        case "network":
        case "rule":
            return "construction";
        case "debug":
        case "terminal":
            return "debugging";
        case "review":
            return "review";
        case "test-design":
            return "testing";
        case "explain":
            return "explanation";
        case "code":
        case "git":
            return "construction";
        default:
            return "construction";
    }
}

export interface MissionEvaluation {
    readonly score: number;
    readonly completed: boolean;
    readonly passedStepIds: readonly string[];
    readonly failedStepIds: readonly string[];
}

export function evaluateMission(
    mission: Mission,
    results: Readonly<Record<string, StepEvaluation>>,
): MissionEvaluation {
    const passedStepIds: string[] = [];
    const failedStepIds: string[] = [];

    for (const step of mission.steps) {
        const result = results[step.id];
        if (result?.passed === true) {
            passedStepIds.push(step.id);
        } else {
            failedStepIds.push(step.id);
        }
    }

    const score = mission.steps.length === 0 ? 0 : passedStepIds.length / mission.steps.length;
    return {
        score,
        completed: score >= mission.evaluation.passScore && failedStepIds.length === 0,
        passedStepIds,
        failedStepIds,
    };
}

export function assistanceForHints(hintsUsed: number): "independent" | "hint-1" | "hint-2" | "hint-3" | "hint-4" {
    if (hintsUsed <= 0) {
        return "independent";
    }
    if (hintsUsed === 1) {
        return "hint-1";
    }
    if (hintsUsed === 2) {
        return "hint-2";
    }
    if (hintsUsed === 3) {
        return "hint-3";
    }
    return "hint-4";
}

export function independenceForHints(hintsUsed: number): number {
    const factors = [1, 0.8, 0.6, 0.4, 0.2];
    return factors[Math.min(hintsUsed, 4)] ?? 0.2;
}
