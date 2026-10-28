import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireConsent } from "../security/consent.ts";
import {
    assertRealPathInside,
    ensureDirectory,
    isDirectory,
    resolveConfinedPath,
} from "../security/paths.ts";
import {
    findRepositoryRoot,
    resolveContentTarget,
    type ContentTarget,
} from "../project/content.ts";

export interface OpenRequest {
    readonly identifier: string;
    readonly directory: string | undefined;
    readonly preApproved: boolean;
}

export interface OpenResult {
    readonly target: ContentTarget;
    readonly directory: string;
    readonly writtenFiles: readonly string[];
    readonly overwrittenFiles: readonly string[];
}

function safeDirectoryName(identifier: string): string {
    const normalized = identifier
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return `praxbit-${normalized.length === 0 ? "exercise" : normalized}`;
}

function locateRepository(): string {
    const candidates: string[] = [process.cwd()];
    try {
        candidates.push(path.dirname(fileURLToPath(import.meta.url)));
    } catch (error) {
        if (!(error instanceof Error)) {
            throw error;
        }
    }
    let lastError: Error | undefined;
    for (const candidate of candidates) {
        try {
            return findRepositoryRoot(candidate);
        } catch (error) {
            if (error instanceof Error) {
                lastError = error;
            }
        }
    }
    throw lastError ?? new Error("Could not find the Praxbit repository.");
}

export async function executeOpen(request: OpenRequest): Promise<OpenResult> {
    const repositoryRoot = locateRepository();
    const target = resolveContentTarget(repositoryRoot, request.identifier);
    const requestedDirectory = request.directory ?? safeDirectoryName(target.id);
    const directory = path.resolve(process.cwd(), requestedDirectory);

    if (fs.existsSync(directory) && !isDirectory(directory)) {
        throw new Error(`The target exists and is not a directory: ${directory}`);
    }

    const existing: string[] = [];
    for (const file of target.files) {
        const destination = resolveConfinedPath(directory, file.path);
        if (fs.existsSync(destination)) {
            existing.push(file.path);
        }
    }

    process.stdout.write(
        `\n${target.kind === "mission" ? "Mission" : "Project"}: ${target.title}\n`,
    );
    process.stdout.write(`${target.summary}\n\n`);
    process.stdout.write(`Target directory: ${directory}\n`);
    process.stdout.write(`Starter files (${String(target.files.length)}):\n`);
    for (const file of target.files) {
        process.stdout.write(`  ${file.path}\n`);
    }
    for (const note of target.notes) {
        process.stdout.write(`Note: ${note}\n`);
    }
    if (existing.length > 0) {
        process.stdout.write(
            `\nThese files already exist and will be overwritten: ${existing.join(", ")}\n`,
        );
    }

    if (target.files.length === 0) {
        process.stdout.write("\nNothing to write. Open this exercise in the web application.\n");
        return { target, directory, writtenFiles: [], overwrittenFiles: [] };
    }

    await requireConsent(
        `Write ${String(target.files.length)} starter files to ${directory}?`,
        request.preApproved,
    );
    ensureDirectory(directory);

    const writtenFiles: string[] = [];
    const overwrittenFiles: string[] = [];
    for (const file of target.files) {
        const destination = resolveConfinedPath(directory, file.path);
        ensureDirectory(path.dirname(destination));
        assertRealPathInside(directory, destination);
        if (fs.existsSync(destination)) {
            overwrittenFiles.push(file.path);
        }
        fs.writeFileSync(destination, file.content, { encoding: "utf8", mode: 0o600 });
        writtenFiles.push(file.path);
    }

    process.stdout.write(`\nWrote ${String(writtenFiles.length)} files to ${directory}\n`);
    process.stdout.write("Next steps:\n");
    process.stdout.write(`  cd "${directory}"\n`);
    process.stdout.write(`  praxbit test .\n`);
    process.stdout.write(
        "Local test results are not independently verified and are not trusted for ranked competitions.\n",
    );

    return { target, directory, writtenFiles, overwrittenFiles };
}
