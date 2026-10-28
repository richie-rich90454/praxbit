import fs from "node:fs";
import path from "node:path";
import type { ApprovedCommand } from "../security/commands.ts";

export type ProjectKind =
    | "node"
    | "python"
    | "go"
    | "rust"
    | "dotnet"
    | "java-maven"
    | "java-gradle"
    | "make"
    | "unknown";

export interface DetectedProject {
    readonly kind: ProjectKind;
    readonly label: string;
    readonly commands: readonly ApprovedCommand[];
    readonly notes: readonly string[];
}

function exists(directory: string, name: string): boolean {
    return fs.existsSync(path.join(directory, name));
}

function readText(filePath: string): string {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (error) {
        if (error instanceof Error) {
            return "";
        }
        return "";
    }
}

function packageHasTestScript(directory: string): boolean {
    const packagePath = path.join(directory, "package.json");
    const text = readText(packagePath);
    if (text.length === 0) {
        return false;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) {
            return false;
        }
        const scripts = parsed.scripts;
        return (
            typeof scripts === "object" &&
            scripts !== null &&
            "test" in scripts &&
            typeof scripts.test === "string"
        );
    } catch (error) {
        if (error instanceof Error) {
            return false;
        }
        return false;
    }
}

function pythonUsesPytest(directory: string): boolean {
    const candidates = ["pyproject.toml", "pytest.ini", "tox.ini", "setup.cfg", "requirements.txt"];
    for (const candidate of candidates) {
        const text = readText(path.join(directory, candidate));
        if (text.toLowerCase().includes("pytest")) {
            return true;
        }
    }
    return false;
}

function hasPythonFiles(directory: string): boolean {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".py")) {
            return true;
        }
        if (entry.isDirectory() && entry.name === "tests") {
            return true;
        }
    }
    return false;
}

function makefileHasTestTarget(directory: string): boolean {
    const text = readText(path.join(directory, "Makefile"));
    return /^test\s*:/m.test(text);
}

function windowsScript(name: string): string {
    return process.platform === "win32" ? `${name}.cmd` : name;
}

function windowsBatch(name: string): string {
    return process.platform === "win32" ? `${name}.bat` : name;
}

export function detectProject(directory: string): DetectedProject {
    const notes: string[] = [
        "Only the commands shown are run. No package is downloaded and no remote script is executed.",
        "The commands run code from this directory. Review the project before consenting.",
    ];

    if (exists(directory, "pnpm-lock.yaml")) {
        if (!packageHasTestScript(directory)) {
            return {
                kind: "node",
                label: "Node.js with pnpm",
                commands: [],
                notes: [...notes, "package.json has no test script."],
            };
        }
        return {
            kind: "node",
            label: "Node.js with pnpm",
            commands: [{ label: "Node test script", command: "pnpm", args: ["test"] }],
            notes,
        };
    }
    if (exists(directory, "yarn.lock")) {
        if (!packageHasTestScript(directory)) {
            return {
                kind: "node",
                label: "Node.js with Yarn",
                commands: [],
                notes: [...notes, "package.json has no test script."],
            };
        }
        return {
            kind: "node",
            label: "Node.js with Yarn",
            commands: [{ label: "Node test script", command: "yarn", args: ["test"] }],
            notes,
        };
    }
    if (exists(directory, "package.json")) {
        if (!packageHasTestScript(directory)) {
            return {
                kind: "node",
                label: "Node.js",
                commands: [],
                notes: [...notes, "package.json has no test script."],
            };
        }
        return {
            kind: "node",
            label: "Node.js",
            commands: [{ label: "Node test script", command: "npm", args: ["test"] }],
            notes,
        };
    }

    if (exists(directory, "go.mod")) {
        return {
            kind: "go",
            label: "Go module",
            commands: [{ label: "Go tests", command: "go", args: ["test", "./..."] }],
            notes,
        };
    }

    if (exists(directory, "Cargo.toml")) {
        return {
            kind: "rust",
            label: "Rust crate",
            commands: [{ label: "Cargo tests", command: "cargo", args: ["test"] }],
            notes,
        };
    }

    if (
        exists(directory, "pyproject.toml") ||
        exists(directory, "requirements.txt") ||
        hasPythonFiles(directory)
    ) {
        const command: ApprovedCommand = pythonUsesPytest(directory)
            ? { label: "Python pytest", command: "python", args: ["-m", "pytest", "-q"] }
            : {
                  label: "Python unittest",
                  command: "python",
                  args: ["-m", "unittest", "discover", "-v"],
              };
        return { kind: "python", label: "Python project", commands: [command], notes };
    }

    if (exists(directory, "pom.xml")) {
        const wrapper = process.platform === "win32" ? "mvnw.cmd" : "mvnw";
        const command = exists(directory, wrapper) ? wrapper : windowsScript("mvn");
        return {
            kind: "java-maven",
            label: "Maven project",
            commands: [{ label: "Maven tests", command, args: ["-q", "test"] }],
            notes,
        };
    }

    if (exists(directory, "build.gradle") || exists(directory, "build.gradle.kts")) {
        const wrapper = process.platform === "win32" ? "gradlew.bat" : "gradlew";
        const command = exists(directory, wrapper) ? wrapper : windowsBatch("gradle");
        return {
            kind: "java-gradle",
            label: "Gradle project",
            commands: [{ label: "Gradle tests", command, args: ["test"] }],
            notes,
        };
    }

    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith(".sln") || entry.name.endsWith(".csproj"))) {
            return {
                kind: "dotnet",
                label: ".NET project",
                commands: [{ label: ".NET tests", command: "dotnet", args: ["test"] }],
                notes,
            };
        }
    }

    if (exists(directory, "Makefile") && makefileHasTestTarget(directory)) {
        return {
            kind: "make",
            label: "Make project",
            commands: [{ label: "Make test target", command: "make", args: ["test"] }],
            notes,
        };
    }

    return {
        kind: "unknown",
        label: "Unrecognized project",
        commands: [],
        notes: [...notes, "No approved test command was detected for this directory."],
    };
}
