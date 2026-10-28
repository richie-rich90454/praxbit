import type { RuntimeKind } from "@praxbit/contracts";

export const RUNTIME_LABELS: Readonly<Record<RuntimeKind, string>> = {
    none: "Guided interaction, no code runtime",
    "browser-javascript": "Real JavaScript execution in an isolated browser worker",
    "browser-typescript": "TypeScript transpiled and executed in an isolated browser worker",
    "browser-html": "Real HTML and CSS rendering in an isolated browser frame",
    "browser-css": "Real CSS rendering in an isolated browser frame",
    "browser-python": "Real Python execution in an isolated browser worker",
    "browser-sql": "Real SQL execution against a browser-local database",
    "browser-git": "Real Git operations against a browser-local repository",
    "simulated-linux": "Deterministic Linux simulation, not a real machine",
    "guided-simulation": "Guided simulation, results are deterministic",
    "static-analysis": "Static analysis, code is not executed",
};

export function runtimeLabel(kind: RuntimeKind): string {
    return RUNTIME_LABELS[kind];
}
