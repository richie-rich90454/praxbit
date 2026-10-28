import type { TerminalCheck } from "@praxbit/contracts";

export interface SimulatedFile {
    path: string;
    content: string;
    mode: string;
}

export interface SimulatedService {
    id: string;
    name: string;
    status: "running" | "failed";
    logs: string[];
}

export interface SimulatedSymlink {
    path: string;
    target: string;
}

export interface SimulatedProcess {
    pid: number;
    command: string;
}

export interface TerminalSnapshot {
    cwd: string;
    files: SimulatedFile[];
    services: SimulatedService[];
    symlinks: SimulatedSymlink[];
    processes: SimulatedProcess[];
    transcript: { command: string; output: string }[];
}

export interface TerminalInitialState {
    readonly cwd: string;
    readonly files: readonly SimulatedFile[];
    readonly services: readonly SimulatedService[];
    readonly symlinks: readonly SimulatedSymlink[];
    readonly processes?: readonly SimulatedProcess[] | undefined;
}

export interface CommandResult {
    readonly state: TerminalSnapshot;
    readonly output: string;
}

function normalizePath(path: string): string {
    const segments = path.split("/");
    const result: string[] = [];
    for (const segment of segments) {
        if (segment === "" || segment === ".") {
            continue;
        }
        if (segment === "..") {
            result.pop();
        } else {
            result.push(segment);
        }
    }
    return `/${result.join("/")}`;
}

function joinPath(base: string, child: string): string {
    return normalizePath(`${base}/${child}`);
}

function parentPath(path: string): string {
    const index = path.lastIndexOf("/");
    return index <= 0 ? "/" : path.slice(0, index);
}

function baseName(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}

function normalizeMode(mode: string): string {
    return mode.replace(/^0+/, "") || "0";
}

export class TerminalSimulator {
    private state: TerminalSnapshot;

    public constructor(initial: TerminalInitialState) {
        this.state = {
            cwd: normalizePath(initial.cwd),
            files: initial.files.map(function normalizeFile(file): SimulatedFile {
                return { ...file, path: normalizePath(file.path) };
            }),
            services: initial.services.map(function copyService(service): SimulatedService {
                return { ...service, logs: [...service.logs] };
            }),
            symlinks: initial.symlinks.map(function normalizeLink(link): SimulatedSymlink {
                return { ...link, path: normalizePath(link.path) };
            }),
            processes: (initial.processes ?? []).map(
                function copyProcess(process): SimulatedProcess {
                    return Object.assign({}, process);
                },
            ),
            transcript: [],
        };
    }

    public snapshot(): TerminalSnapshot {
        return {
            cwd: this.state.cwd,
            files: this.state.files.map(function copyFile(file): SimulatedFile {
                return { ...file };
            }),
            services: this.state.services.map(function copyService(service): SimulatedService {
                return { ...service, logs: [...service.logs] };
            }),
            symlinks: this.state.symlinks.map(function copyLink(link): SimulatedSymlink {
                return { ...link };
            }),
            processes: this.state.processes.map(function copyProcess(process): SimulatedProcess {
                return { ...process };
            }),
            transcript: this.state.transcript.map(function copyEntry(entry): {
                command: string;
                output: string;
            } {
                return { ...entry };
            }),
        };
    }

    public execute(rawCommand: string): CommandResult {
        const command = rawCommand.trim();
        const output = command.length === 0 ? "" : this.dispatch(command);
        if (command.length > 0) {
            this.state.transcript.push({ command, output });
            if (this.state.transcript.length > 300) {
                this.state.transcript.splice(0, this.state.transcript.length - 300);
            }
        }
        return { state: this.snapshot(), output };
    }

    private dispatch(command: string): string {
        const parts = command.split(/\s+/);
        const name = parts[0] ?? "";
        const args = parts.slice(1);

        switch (name) {
            case "help":
                return "Commands: pwd, ls [-l] [path], cd [path], cat <file>, chmod <mode> <file>, ps, kill <pid>, systemctl <status|start|stop|restart> <service>, journalctl -u <service>, curl <url>, readlink <path>, ln -s <target> <link>, grep <pattern> <file>, whoami, id, echo <text>";
            case "pwd":
                return this.state.cwd;
            case "whoami":
                return "campus";
            case "id":
                return "uid=1000(campus) gid=1000(campus) groups=1000(campus)";
            case "ls":
                return this.list(args);
            case "cd":
                return this.changeDirectory(args[0] ?? "/");
            case "cat":
                return this.cat(args[0]);
            case "echo":
                return args.join(" ");
            case "chmod":
                return this.chmod(args[0], args[1]);
            case "ps":
                return this.processList();
            case "kill":
                return this.kill(args[0]);
            case "systemctl":
                return this.systemctl(args);
            case "journalctl":
                return this.journalctl(args);
            case "curl":
                return this.curl(args[0]);
            case "readlink":
                return this.readlink(args[0]);
            case "ln":
                return this.link(args);
            case "grep":
                return this.grep(args[0], args[1]);
            case "sudo":
                return "sudo: this simulation has no privilege escalation. Use the permissions available to the campus user.";
            default:
                return `${name}: command not found`;
        }
    }

    private relativePath(input: string): string {
        if (input.startsWith("/")) {
            return normalizePath(input);
        }
        return joinPath(this.state.cwd, input);
    }

    private resolveSymlinks(path: string): string {
        let current = normalizePath(path);
        const seen = new Set<string>();
        for (let depth = 0; depth < 5; depth += 1) {
            const link = this.state.symlinks.find(function match(item: SimulatedSymlink): boolean {
                return item.path === current;
            });
            if (link === undefined) {
                return current;
            }
            if (seen.has(current)) {
                return current;
            }
            seen.add(current);
            const target = link.target.startsWith("/")
                ? normalizePath(link.target)
                : joinPath(parentPath(link.path), link.target);
            current = target;
        }
        return current;
    }

    private allDirectories(): Set<string> {
        const directories = new Set<string>(["/"]);
        const addParents = function addParents(path: string): void {
            let cursor = parentPath(path);
            while (cursor !== "/") {
                directories.add(cursor);
                cursor = parentPath(cursor);
            }
        };
        for (const file of this.state.files) {
            const segments = file.path.split("/").filter(function present(
                segment: string,
            ): boolean {
                return segment.length > 0;
            });
            let cursor = "";
            for (let index = 0; index < segments.length - 1; index += 1) {
                cursor += `/${segments[index]}`;
                directories.add(cursor);
            }
            addParents(file.path);
        }
        for (const link of this.state.symlinks) {
            addParents(link.path);
        }
        return directories;
    }

    private isDirectory(path: string): boolean {
        const resolved = this.resolveSymlinks(path);
        if (resolved === "/") {
            return true;
        }
        return (
            this.allDirectories().has(resolved) ||
            this.state.symlinks.some(function link(item): boolean {
                return item.path === resolved;
            })
        );
    }

    private list(args: readonly string[]): string {
        const long = args.includes("-l");
        const positional = args.find(function notFlag(arg: string): boolean {
            return !arg.startsWith("-");
        });
        const target = positional === undefined ? this.state.cwd : this.relativePath(positional);
        const resolved = this.resolveSymlinks(target);
        if (!this.isDirectory(target)) {
            return `ls: cannot access '${positional ?? target}': Not a directory`;
        }

        const entries = new Map<string, "file" | "directory" | "link">();
        for (const directory of this.allDirectories()) {
            if (directory !== "/" && parentPath(directory) === resolved) {
                entries.set(baseName(directory), "directory");
            }
        }
        for (const file of this.state.files) {
            if (parentPath(file.path) === resolved) {
                entries.set(baseName(file.path), "file");
            }
        }
        for (const link of this.state.symlinks) {
            if (parentPath(link.path) === resolved) {
                entries.set(baseName(link.path), "link");
            }
        }

        const names = [...entries.keys()].sort();
        if (names.length === 0) {
            return "";
        }
        if (!long) {
            return names.join("\n");
        }

        const files = this.state.files;
        const symlinks = this.state.symlinks;
        return names
            .map(function format(name: string): string {
                const kind = entries.get(name);
                if (kind === "link") {
                    const link = symlinks.find(function match(item): boolean {
                        return item.path === joinPath(resolved, name);
                    });
                    return `lrwxrwxrwx 1 campus campus 0 ${name} -> ${link?.target ?? ""}`;
                }
                if (kind === "directory") {
                    return `drwxr-xr-x 2 campus campus 4096 ${name}`;
                }
                const file = files.find(function match(item): boolean {
                    return item.path === joinPath(resolved, name);
                });
                const mode = file === undefined ? "644" : normalizeMode(file.mode);
                return `-rw-r--r-- 1 campus campus ${file?.content.length ?? 0} ${mode} ${name}`;
            })
            .join("\n");
    }

    private changeDirectory(target: string): string {
        const path = this.relativePath(target);
        if (!this.isDirectory(path)) {
            return `cd: ${target}: No such file or directory`;
        }
        this.state.cwd = this.resolveSymlinks(path);
        return "";
    }

    private cat(target: string | undefined): string {
        if (target === undefined) {
            return "cat: missing file operand";
        }
        const path = this.resolveSymlinks(this.relativePath(target));
        const file = this.state.files.find(function match(item): boolean {
            return item.path === path;
        });
        if (file === undefined) {
            return `cat: ${target}: No such file or directory`;
        }
        return file.content;
    }

    private chmod(mode: string | undefined, target: string | undefined): string {
        if (mode === undefined || target === undefined) {
            return "chmod: usage: chmod <mode> <file>";
        }
        if (!/^[0-7]{3,4}$/.test(mode)) {
            return `chmod: invalid mode: '${mode}'`;
        }
        const path = this.resolveSymlinks(this.relativePath(target));
        const file = this.state.files.find(function match(item): boolean {
            return item.path === path;
        });
        if (file === undefined) {
            return `chmod: cannot access '${target}': No such file or directory`;
        }
        file.mode = normalizeMode(mode);
        return "";
    }

    private processList(): string {
        if (this.state.processes.length === 0) {
            return "PID COMMAND";
        }
        return [
            "PID COMMAND",
            ...this.state.processes.map(function format(process): string {
                return `${process.pid} ${process.command}`;
            }),
        ].join("\n");
    }

    private kill(pidText: string | undefined): string {
        const pid = Number(pidText);
        if (!Number.isInteger(pid)) {
            return `kill: usage: kill <pid>`;
        }
        const index = this.state.processes.findIndex(function match(process): boolean {
            return process.pid === pid;
        });
        if (index < 0) {
            return `kill: (${pid}) - No such process`;
        }
        this.state.processes.splice(index, 1);
        return `Process ${pid} terminated.`;
    }

    private systemctl(args: readonly string[]): string {
        const action = args[0];
        const serviceId = args[1];
        if (action === undefined || serviceId === undefined) {
            return "systemctl: usage: systemctl <status|start|stop|restart> <service>";
        }
        const service = this.state.services.find(function match(item): boolean {
            return item.id === serviceId;
        });
        if (service === undefined) {
            return `Unit ${serviceId}.service could not be found.`;
        }

        if (action === "status") {
            return `${service.name}.service - ${service.status === "running" ? "active (running)" : "failed"}`;
        }
        if (action === "stop") {
            service.status = "failed";
            service.logs.push("[info] service stopped by operator");
            return "";
        }
        if (action === "start" || action === "restart") {
            const failure = this.startupFailure(service);
            if (failure !== undefined) {
                service.status = "failed";
                service.logs.push(`[error] ${failure}`);
                return `Job for ${service.name}.service failed: ${failure}`;
            }
            service.status = "running";
            service.logs.push("[info] service started");
            return "";
        }
        return `systemctl: unknown action '${action}'`;
    }

    private startupFailure(service: SimulatedService): string | undefined {
        if (service.id !== "orders-api") {
            return undefined;
        }
        const portConflict = this.state.processes.find(function conflict(process): boolean {
            return process.command.includes("--port 8080");
        });
        if (portConflict !== undefined) {
            return "listen EADDRINUSE: address already in use :8080";
        }
        const config = this.state.files.find(function match(file): boolean {
            return file.path === "/srv/campus/app/config.json";
        });
        if (config !== undefined && normalizeMode(config.mode) === "0") {
            return "EACCES: permission denied, open '/srv/campus/app/config.json'";
        }
        const database = this.state.services.find(function match(item): boolean {
            return item.id === "inventory-db";
        });
        if (database !== undefined && database.status !== "running") {
            return "connect ECONNREFUSED inventory-db:5432";
        }
        const current = this.state.symlinks.find(function match(link): boolean {
            return link.path === "/srv/campus/current";
        });
        if (current !== undefined) {
            const target = current.target.startsWith("/")
                ? normalizePath(current.target)
                : joinPath(parentPath(current.path), current.target);
            const server = this.state.files.find(function match(file): boolean {
                return file.path === `${target}/app/server.js`;
            });
            if (server === undefined) {
                return "ENOENT: no such file or directory, open '/srv/campus/current/app/server.js'";
            }
        }
        return undefined;
    }

    private journalctl(args: readonly string[]): string {
        const index = args.indexOf("-u");
        const serviceId = index >= 0 ? args[index + 1] : undefined;
        if (serviceId === undefined) {
            return "journalctl: specify a unit with -u <service>";
        }
        const service = this.state.services.find(function match(item): boolean {
            return item.id === serviceId;
        });
        if (service === undefined) {
            return `-- No entries for ${serviceId} --`;
        }
        return service.logs.join("\n");
    }

    private curl(url: string | undefined): string {
        if (url === undefined) {
            return "curl: try 'curl <url>'";
        }
        if (!url.includes("/health")) {
            return `curl: (6) Could not resolve host for ${url}`;
        }
        const api = this.state.services.find(function match(service): boolean {
            return service.id === "orders-api";
        });
        if (api === undefined || api.status !== "running") {
            return "curl: (7) Failed to connect to localhost port 8080: Connection refused";
        }
        const allRunning = this.state.services.every(function running(service): boolean {
            return service.status === "running";
        });
        return allRunning
            ? '{"status":"healthy","system":"ready"}'
            : '{"status":"healthy","system":"degraded"}';
    }

    private readlink(target: string | undefined): string {
        if (target === undefined) {
            return "readlink: missing operand";
        }
        const path = this.relativePath(target);
        const link = this.state.symlinks.find(function match(item): boolean {
            return item.path === path;
        });
        if (link === undefined) {
            return `readlink: ${target}: No such file or directory`;
        }
        return link.target;
    }

    private link(args: readonly string[]): string {
        const symbolic = args[0] === "-s" || args[0] === "-sf" || args[0] === "-fs";
        const force = args[0] === "-sf" || args[0] === "-fs" || args.includes("-f");
        const positional = args.filter(function notFlag(arg: string): boolean {
            return !arg.startsWith("-s") && !arg.startsWith("-f");
        });
        if (!symbolic || positional.length < 2) {
            return "ln: usage: ln -s <target> <link>";
        }
        const target = positional[0] ?? "";
        const linkInput = positional[1] ?? "";
        const linkPath = this.relativePath(linkInput);
        const existingIndex = this.state.symlinks.findIndex(function match(item): boolean {
            return item.path === linkPath;
        });
        if (existingIndex >= 0 && !force) {
            return `ln: failed to create symbolic link '${linkInput}': File exists`;
        }
        if (existingIndex >= 0) {
            this.state.symlinks.splice(existingIndex, 1);
        }
        this.state.symlinks.push({ path: linkPath, target });
        return "";
    }

    private grep(pattern: string | undefined, target: string | undefined): string {
        if (pattern === undefined || target === undefined) {
            return "grep: usage: grep <pattern> <file>";
        }
        const path = this.resolveSymlinks(this.relativePath(target));
        const file = this.state.files.find(function match(item): boolean {
            return item.path === path;
        });
        if (file === undefined) {
            return `grep: ${target}: No such file or directory`;
        }
        const matches = file.content.split("\n").filter(function matches(line: string): boolean {
            return line.includes(pattern);
        });
        return matches.join("\n");
    }
}

export function evaluateTerminalChecks(
    state: TerminalSnapshot,
    checks: readonly TerminalCheck[],
): readonly string[] {
    const completed: string[] = [];
    const output = state.transcript
        .map(function entry(item): string {
            return item.output;
        })
        .join("\n");

    for (const check of checks) {
        if (check.kind === "command-output") {
            if (output.includes(check.contains)) {
                completed.push(check.contains);
            }
            continue;
        }
        if (check.kind === "service") {
            const service = state.services.find(function match(item): boolean {
                return item.id === check.serviceId;
            });
            if (service?.status === check.status) {
                completed.push(check.serviceId);
            }
            continue;
        }
        if (check.kind === "file-mode") {
            const file = state.files.find(function match(item): boolean {
                return item.path === check.path;
            });
            if (file !== undefined && normalizeMode(file.mode) === normalizeMode(check.mode)) {
                completed.push(check.path);
            }
            continue;
        }
        if (check.kind === "symlink") {
            const link = state.symlinks.find(function match(item): boolean {
                return item.path === check.path;
            });
            if (link !== undefined) {
                const actual = link.target.startsWith("/")
                    ? normalizePath(link.target)
                    : joinPath(parentPath(link.path), link.target);
                const expected = check.target.startsWith("/")
                    ? normalizePath(check.target)
                    : joinPath(parentPath(link.path), check.target);
                if (actual === expected) {
                    completed.push(check.path);
                }
            }
        }
    }

    return completed;
}

export function terminalObjectiveIds(
    state: TerminalSnapshot,
    objectives: readonly { readonly id: string; readonly check: TerminalCheck }[],
): readonly string[] {
    const completedSet = new Set(
        evaluateTerminalChecks(
            state,
            objectives.map(function checkOf(objective): TerminalCheck {
                return objective.check;
            }),
        ),
    );
    const completed: string[] = [];
    for (const objective of objectives) {
        const check = objective.check;
        let satisfied = false;
        if (check.kind === "command-output") {
            satisfied = completedSet.has(check.contains);
        } else if (check.kind === "service") {
            satisfied = completedSet.has(check.serviceId);
        } else if (check.kind === "file-mode") {
            satisfied = completedSet.has(check.path);
        } else if (check.kind === "symlink") {
            satisfied = completedSet.has(check.path);
        }
        if (satisfied) {
            completed.push(objective.id);
        }
    }
    return completed;
}
