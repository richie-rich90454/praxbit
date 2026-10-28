import fs from "node:fs";
import path from "node:path";
import { buildDoctorReport, type DoctorReport } from "./doctor.ts";
import { formatTimestamp } from "../util/text.ts";
import { COMPANION_NAME, COMPANION_VERSION } from "../version.ts";

export interface ExportRequest {
    readonly resultsPath: string;
    readonly directory: string;
}

export interface ExportEnvelope {
    readonly format: "praxbit-companion-export";
    readonly formatVersion: 1;
    readonly exportedAt: string;
    readonly companion: {
        readonly name: string;
        readonly version: string;
    };
    readonly trustedForRankedCompetition: false;
    readonly trustNote: string;
    readonly toolchains: DoctorReport;
    readonly results: unknown;
    readonly inputClaimedRankedTrust: boolean;
}

function readJson(filePath: string): unknown {
    const text = fs.readFileSync(filePath, "utf8");
    return JSON.parse(text) as unknown;
}

function inputClaimsTrust(value: unknown): boolean {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    if (!("trustedForRankedCompetition" in value)) {
        return false;
    }
    return value.trustedForRankedCompetition === true;
}

function availableOutputPath(directory: string, timestamp: string): string {
    const base = path.join(directory, `praxbit-results-${timestamp}`);
    let candidate = `${base}.json`;
    let counter = 1;
    while (fs.existsSync(candidate)) {
        candidate = `${base}-${String(counter)}.json`;
        counter += 1;
    }
    return candidate;
}

export function executeExport(request: ExportRequest): string {
    const inputPath = path.resolve(process.cwd(), request.resultsPath);
    const results = readJson(inputPath);
    const claimed = inputClaimsTrust(results);
    const directory = path.resolve(process.cwd(), request.directory);
    fs.mkdirSync(directory, { recursive: true });

    const envelope: ExportEnvelope = {
        format: "praxbit-companion-export",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        companion: {
            name: COMPANION_NAME,
            version: COMPANION_VERSION,
        },
        trustedForRankedCompetition: false,
        trustNote:
            "Local execution cannot prove what happened on this machine. Ranked competition results require independent server-side verification.",
        toolchains: buildDoctorReport(),
        results,
        inputClaimedRankedTrust: claimed,
    };

    const outputPath = availableOutputPath(directory, formatTimestamp(new Date()));
    fs.writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });

    process.stdout.write(`Exported companion results to ${outputPath}\n`);
    if (claimed) {
        process.stdout.write(
            "The input file claimed ranked trust. This export overrides that claim: trustedForRankedCompetition is false.\n",
        );
    }
    process.stdout.write("Local results are not a verified competition attestation.\n");
    return outputPath;
}
