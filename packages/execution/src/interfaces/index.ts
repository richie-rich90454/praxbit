export interface ExecutionRequest {
    readonly language: string;
    readonly runtimeId: string;
    readonly sourceFiles: Readonly<Record<string, string>>;
    readonly stdin?: string;
    readonly timeoutMs: number;
    readonly maximumOutputBytes: number;
}

export interface ExecutionDiagnostic {
    readonly code: string;
    readonly message: string;
    readonly severity: "error" | "warning" | "information";
    readonly filename?: string;
    readonly line?: number;
}

export interface ExecutionResult {
    readonly status: "completed" | "failed" | "timed_out" | "canceled";
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly diagnostics: readonly ExecutionDiagnostic[];
}

export interface CodeRunner {
    supports(request: ExecutionRequest): boolean;
    execute(request: ExecutionRequest, signal: AbortSignal): Promise<ExecutionResult>;
    dispose(): Promise<void>;
}

export interface RuntimeCapability {
    readonly id: string;
    readonly label: string;
    readonly kind: "real-execution" | "simulation" | "static-analysis" | "structural-analysis" | "guided-prediction" | "local-toolchain" | "remote-isolated";
    readonly offline: boolean;
    readonly description: string;
}

export const RUNTIME_CAPABILITIES: readonly RuntimeCapability[] = [
    {
        id: "browser-javascript",
        label: "Browser JavaScript worker",
        kind: "real-execution",
        offline: true,
        description: "Runs learner JavaScript in a dedicated Web Worker with a timeout and no DOM access. Best-effort isolation, not a security boundary.",
    },
    {
        id: "browser-html",
        label: "Sandboxed HTML preview",
        kind: "real-execution",
        offline: true,
        description: "Renders HTML and CSS in a sandboxed iframe and checks DOM structure and computed styles.",
    },
    {
        id: "browser-css",
        label: "Sandboxed CSS preview",
        kind: "real-execution",
        offline: true,
        description: "Applies CSS in a sandboxed iframe and checks computed styles.",
    },
    {
        id: "browser-typescript",
        label: "Transpiled TypeScript",
        kind: "real-execution",
        offline: true,
        description: "Transpiles TypeScript in the browser, reports syntax diagnostics, and runs behavioral tests. Full type checking is available in the local companion.",
    },
    {
        id: "browser-python",
        label: "Pyodide WebAssembly Python",
        kind: "real-execution",
        offline: true,
        description: "Downloads and caches the Pyodide runtime on demand, then runs Python and its tests in a worker.",
    },
    {
        id: "browser-sql",
        label: "SQLite WebAssembly",
        kind: "real-execution",
        offline: true,
        description: "Runs SQL against SQLite compiled to WebAssembly. PostgreSQL-specific behavior is taught separately and labeled.",
    },
    {
        id: "browser-git",
        label: "isomorphic-git",
        kind: "real-execution",
        offline: true,
        description: "Runs Git operations against an in-browser repository. Commits and merges are real within that repository.",
    },
    {
        id: "simulated-linux",
        label: "Deterministic Linux simulation",
        kind: "simulation",
        offline: true,
        description: "A constrained filesystem, process, and service simulator. It is not a real Linux host and never claims to be.",
    },
    {
        id: "static-analysis",
        label: "Static and structural analysis",
        kind: "static-analysis",
        offline: true,
        description: "Checks code or configuration structure without executing it.",
    },
    {
        id: "guided-simulation",
        label: "Guided simulation",
        kind: "guided-prediction",
        offline: true,
        description: "Interactive state simulation for toolchains that cannot run safely in the browser. Clearly labeled as simulated.",
    },
];
