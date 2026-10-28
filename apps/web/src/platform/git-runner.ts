import git, { Errors, type FsClient } from "isomorphic-git";
import FS from "@isomorphic-git/lightning-fs";
import type { GitStep } from "@praxbit/contracts";

const AUTHOR = { name: "Campus team", email: "team@campus.example" };
const DIR = "/repo";

interface PendingMerge {
    readonly ours: string;
    readonly theirs: string;
}

export interface GitCommandResult {
    readonly output: string;
    readonly changed: boolean;
}

export interface GitCheckResult {
    readonly checks: Readonly<Record<string, boolean>>;
    readonly log: readonly string[];
    readonly branch: string | undefined;
}

export class GitExercise {
    private readonly fs: FS;
    private readonly gitfs: FsClient;
    private readonly exercise: GitStep;
    private pendingMerge: PendingMerge | undefined;

    public constructor(exercise: GitStep) {
        this.exercise = exercise;
        this.fs = new FS(`praxbit-git-${crypto.randomUUID()}`, { wipe: true });
        this.gitfs = this.fs as unknown as FsClient;
    }

    public async initialize(): Promise<void> {
        await this.ensureDirectory(DIR);
        await git.init({ fs: this.gitfs, dir: DIR, defaultBranch: this.exercise.initialBranch });
        const commitOids = new Map<string, string>();

        for (const seed of this.exercise.seedCommits) {
            await this.applyFiles(seed.files);
            const oid = await this.commitAll(seed.message, []);
            commitOids.set(seed.message, oid);
        }

        for (const branch of this.exercise.extraBranches) {
            const base = commitOids.get(branch.from);
            if (base === undefined) {
                continue;
            }
            await git.branch({ fs: this.gitfs, dir: DIR, ref: branch.name, object: base });
            await git.checkout({ fs: this.gitfs, dir: DIR, ref: branch.name });
            for (const seed of branch.commits) {
                await this.applyFiles(seed.files);
                const oid = await this.commitAll(seed.message, []);
                commitOids.set(seed.message, oid);
            }
        }

        await git.checkout({ fs: this.gitfs, dir: DIR, ref: this.exercise.initialBranch });
    }

    public async execute(rawCommand: string): Promise<GitCommandResult> {
        const command = rawCommand.trim();
        if (!command.startsWith("git ")) {
            return { output: "Only git commands are available in this exercise.", changed: false };
        }
        const parts = command.slice(4).split(/\s+/);
        const subcommand = parts[0] ?? "";
        const args = parts.slice(1);

        try {
            switch (subcommand) {
                case "status":
                    return { output: await this.status(), changed: false };
                case "log":
                    return { output: await this.log(args.includes("--oneline")), changed: false };
                case "branch":
                    return { output: await this.branches(), changed: false };
                case "checkout":
                    return { output: await this.checkout(args), changed: true };
                case "add":
                    return { output: await this.add(args), changed: true };
                case "commit":
                    return { output: await this.commit(args), changed: true };
                case "merge":
                    return { output: await this.merge(args), changed: true };
                case "diff":
                    return { output: await this.diff(), changed: false };
                default:
                    return { output: `git: '${subcommand}' is not supported in this exercise.`, changed: false };
            }
        } catch (error) {
            return {
                output: `error: ${error instanceof Error ? error.message : String(error)}`,
                changed: false,
            };
        }
    }

    public async listFiles(): Promise<readonly string[]> {
        const files: string[] = [];

        async function walk(directory: string, relative: string, fs: FS): Promise<void> {
            const entries = await fs.promises.readdir(directory);
            for (const entry of entries) {
                if (entry === ".git") {
                    continue;
                }
                const path = `${directory}/${entry}`;
                const relativePath = relative.length === 0 ? entry : `${relative}/${entry}`;
                const stat = await fs.promises.stat(path);
                if (stat.isDirectory()) {
                    await walk(path, relativePath, fs);
                } else {
                    files.push(relativePath);
                }
            }
        }

        await walk(DIR, "", this.fs);
        return files.sort();
    }

    public async readFile(path: string): Promise<string> {
        const data = await this.fs.promises.readFile(`${DIR}/${path}`, "utf8");
        return typeof data === "string" ? data : new TextDecoder().decode(data);
    }

    public async writeFile(path: string, content: string): Promise<void> {
        await this.ensureDirectory(`${DIR}/${path.split("/").slice(0, -1).join("/")}`);
        await this.fs.promises.writeFile(`${DIR}/${path}`, content, "utf8");
    }

    public async verify(): Promise<GitCheckResult> {
        const checks: Record<string, boolean> = {};
        const branchName = await git.currentBranch({ fs: this.gitfs, dir: DIR, fullname: false });
        const branch: string | undefined = branchName ?? undefined;
        const checksConfig = this.exercise.checks;
        const logEntries = await git.log({ fs: this.gitfs, dir: DIR, depth: 30 });
        const messages = logEntries.map(function messageOf(entry): string {
            return entry.commit.message.trim();
        });

        if (checksConfig.branch !== undefined) {
            checks["branch"] = branch === checksConfig.branch;
        }
        if (checksConfig.fileIncludes !== undefined) {
            for (const [path, fragments] of Object.entries(checksConfig.fileIncludes)) {
                let content = "";
                try {
                    content = await this.readFile(path);
                } catch {
                    content = "";
                }
                checks[`file:${path}`] = fragments.every(function included(fragment: string): boolean {
                    return content.includes(fragment);
                });
            }
        }
        if (checksConfig.fileExcludes !== undefined) {
            for (const [path, fragments] of Object.entries(checksConfig.fileExcludes)) {
                let content = "";
                try {
                    content = await this.readFile(path);
                } catch {
                    content = "";
                }
                checks[`exclude:${path}`] = fragments.every(function absent(fragment: string): boolean {
                    return !content.includes(fragment);
                });
            }
        }
        if (checksConfig.logIncludes !== undefined) {
            for (const message of checksConfig.logIncludes) {
                checks[`log:${message}`] = messages.includes(message);
            }
        }
        if (checksConfig.mergeCommit === true) {
            checks["merge-commit"] = logEntries.some(function isMerge(entry): boolean {
                return entry.commit.parent.length > 1;
            });
        }

        return {
            checks,
            log: messages,
            branch,
        };
    }

    private async ensureDirectory(path: string): Promise<void> {
        const segments = path.split("/").filter(function present(segment: string): boolean {
            return segment.length > 0;
        });
        let current = "";
        for (const segment of segments) {
            current += `/${segment}`;
            try {
                await this.fs.promises.mkdir(current);
            } catch {
                // Directory already exists; LightningFS has no recursive mkdir.
            }
        }
    }

    private async applyFiles(files: Readonly<Record<string, string>>): Promise<void> {
        for (const [path, content] of Object.entries(files)) {
            await this.writeFile(path, content);
        }
    }

    private async commitAll(message: string, parents: readonly string[]): Promise<string> {
        const matrix = await git.statusMatrix({ fs: this.gitfs, dir: DIR });
        for (const row of matrix) {
            const [path, _head, workdir, _stage] = row;
            if (workdir !== 1 && workdir !== 0) {
                await git.add({ fs: this.gitfs, dir: DIR, filepath: path });
            }
        }
        return await git.commit({
            fs: this.gitfs,
            dir: DIR,
            message,
            author: AUTHOR,
            ...(parents.length === 0 ? {} : { parent: [...parents] }),
        });
    }

    private async status(): Promise<string> {
        const branch = await git.currentBranch({ fs: this.gitfs, dir: DIR, fullname: false });
        const matrix = await git.statusMatrix({ fs: this.gitfs, dir: DIR });
        const lines = [`On branch ${branch ?? "HEAD"}`];
        let changed = 0;
        for (const [path, head, workdir, stage] of matrix) {
            if (head === 1 && workdir === 1 && stage === 1) {
                continue;
            }
            changed += 1;
            if (head === 0 && workdir === 2) {
                lines.push(`\tnew file:   ${path}`);
            } else if (workdir === 0) {
                lines.push(`\tdeleted:    ${path}`);
            } else if (stage === 3) {
                lines.push(`\tboth modified:   ${path}`);
            } else if (stage === 2) {
                lines.push(`\tmodified:   ${path} (staged)`);
            } else {
                lines.push(`\tmodified:   ${path}`);
            }
        }
        if (changed === 0) {
            lines.push("nothing to commit, working tree clean");
        }
        if (this.pendingMerge !== undefined) {
            lines.push("You have unmerged paths. Fix conflicts, git add, then git commit.");
        }
        return lines.join("\n");
    }

    private async log(oneline: boolean): Promise<string> {
        const entries = await git.log({ fs: this.gitfs, dir: DIR, depth: 30 });
        if (oneline) {
            return entries
                .map(function format(entry): string {
                    return `${entry.oid.slice(0, 7)} ${entry.commit.message.trim()}`;
                })
                .join("\n");
        }
        return entries
            .map(function format(entry): string {
                return `commit ${entry.oid}\n    ${entry.commit.message.trim()}`;
            })
            .join("\n\n");
    }

    private async branches(): Promise<string> {
        const names = await git.listBranches({ fs: this.gitfs, dir: DIR });
        const current = await git.currentBranch({ fs: this.gitfs, dir: DIR, fullname: false });
        return names
            .sort()
            .map(function format(name: string): string {
                return `${name === current ? "*" : " "} ${name}`;
            })
            .join("\n");
    }

    private async resolveRevision(revision: string): Promise<string> {
        if (revision === "HEAD") {
            return await git.resolveRef({ fs: this.gitfs, dir: DIR, ref: "HEAD" });
        }
        const parentMatch = /^HEAD~(\d+)$/.exec(revision);
        if (parentMatch !== null) {
            const depth = Number(parentMatch[1]);
            const entries = await git.log({ fs: this.gitfs, dir: DIR, depth: depth + 2 });
            const target = entries[depth];
            if (target === undefined) {
                throw new Error(`unknown revision ${revision}`);
            }
            return target.oid;
        }
        try {
            return await git.resolveRef({ fs: this.gitfs, dir: DIR, ref: revision });
        } catch {
            const entries = await git.log({ fs: this.gitfs, dir: DIR, depth: 30 });
            const match = entries.find(function matches(entry): boolean {
                return entry.commit.message.trim() === revision;
            });
            if (match !== undefined) {
                return match.oid;
            }
            throw new Error(`unknown revision ${revision}`);
        }
    }

    private async checkout(args: readonly string[]): Promise<string> {
        if (args[0] === "-b") {
            const name = args[1];
            if (name === undefined) {
                return "fatal: branch name required";
            }
            await git.branch({ fs: this.gitfs, dir: DIR, ref: name });
            await git.checkout({ fs: this.gitfs, dir: DIR, ref: name });
            return `Switched to a new branch '${name}'`;
        }

        const separator = args.indexOf("--");
        if (separator >= 0) {
            const revision = args[0] ?? "HEAD";
            const filepaths = args.slice(separator + 1);
            if (filepaths.length === 0) {
                return "fatal: file path required";
            }
            const oid = await this.resolveRevision(revision);
            await git.checkout({ fs: this.gitfs, dir: DIR, ref: oid, filepaths, force: true });
            return `Restored ${filepaths.join(", ")} from ${revision}.`;
        }

        const ref = args[0];
        if (ref === undefined) {
            return "fatal: branch name required";
        }
        await git.checkout({ fs: this.gitfs, dir: DIR, ref });
        return `Switched to branch '${ref}'`;
    }

    private async add(args: readonly string[]): Promise<string> {
        const target = args[0];
        if (target === undefined) {
            return "Nothing specified, nothing added.";
        }
        if (target === ".") {
            const matrix = await git.statusMatrix({ fs: this.gitfs, dir: DIR });
            for (const row of matrix) {
                if (row[2] !== 1 || row[3] !== 1) {
                    await git.add({ fs: this.gitfs, dir: DIR, filepath: row[0] });
                }
            }
            return "Staged all changes.";
        }
        await git.add({ fs: this.gitfs, dir: DIR, filepath: target });
        return `Staged ${target}.`;
    }

    private async commit(args: readonly string[]): Promise<string> {
        const messageIndex = args.indexOf("-m");
        const message = messageIndex >= 0 ? args.slice(messageIndex + 1).join(" ").replace(/^["']|["']$/g, "") : "";
        if (message.length === 0) {
            return "fatal: commit message required with -m";
        }
        const parents: string[] = [];
        if (this.pendingMerge !== undefined) {
            parents.push(this.pendingMerge.ours, this.pendingMerge.theirs);
        }
        const oid = await git.commit({
            fs: this.gitfs,
            dir: DIR,
            message,
            author: AUTHOR,
            ...(parents.length === 0 ? {} : { parent: parents }),
        });
        this.pendingMerge = undefined;
        return `[${await git.currentBranch({ fs: this.gitfs, dir: DIR, fullname: false })} ${oid.slice(0, 7)}] ${message}`;
    }

    private async merge(args: readonly string[]): Promise<string> {
        const target = args[0];
        if (target === undefined) {
            return "fatal: branch name required";
        }
        const current = (await git.currentBranch({ fs: this.gitfs, dir: DIR, fullname: false })) ?? undefined;
        if (current === undefined) {
            return "fatal: not on a branch";
        }
        const ours = await git.resolveRef({ fs: this.gitfs, dir: DIR, ref: current });
        const theirs = await git.resolveRef({ fs: this.gitfs, dir: DIR, ref: target });

        try {
            const result = await git.merge({
                fs: this.gitfs,
                dir: DIR,
                ours: current,
                theirs: target,
                author: AUTHOR,
                message: `Merge ${target} into ${current}`,
                abortOnConflict: false,
            });
            return result.alreadyMerged
                ? "Already up to date."
                : `Merge made by the 'recursive' strategy. ${result.oid === undefined ? "unknown" : result.oid.slice(0, 7)}`;
        } catch (error) {
            if (error instanceof Errors.MergeConflictError) {
                this.pendingMerge = { ours, theirs };
                const matrix = await git.statusMatrix({ fs: this.gitfs, dir: DIR });
                const conflicted = matrix
                    .filter(function conflictedRow(row): boolean {
                        return row[3] === 3;
                    })
                    .map(function pathOf(row): string {
                        return row[0];
                    });
                return [
                    `Auto-merging ${target} into ${current}`,
                    ...conflicted.map(function line(path: string): string {
                        return `CONFLICT (content): Merge conflict in ${path}`;
                    }),
                    "Fix the conflicts, stage the resolved files, then commit the merge.",
                ].join("\n");
            }
            throw error;
        }
    }

    private async diff(): Promise<string> {
        const matrix = await git.statusMatrix({ fs: this.gitfs, dir: DIR });
        const changed = matrix.filter(function changedRow(row): boolean {
            return !(row[1] === 1 && row[2] === 1 && row[3] === 1);
        });
        if (changed.length === 0) {
            return "No changes.";
        }
        return changed
            .map(function line(row): string {
                return `changed: ${row[0]}`;
            })
            .join("\n");
    }
}

