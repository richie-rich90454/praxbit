import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export function projectRoot(): string {
    return resolve(SERVER_DIRECTORY, "../../..");
}

export function loadProjectEnvironment(): string | undefined {
    const configuredPath = process.env["PRAXBIT_ENV_FILE"];
    const environmentPath =
        configuredPath === undefined || configuredPath.trim() === ""
            ? resolve(projectRoot(), ".env")
            : resolve(configuredPath);
    if (!existsSync(environmentPath)) {
        return undefined;
    }
    process.loadEnvFile(environmentPath);
    return environmentPath;
}
