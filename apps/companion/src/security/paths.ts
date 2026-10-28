import fs from "node:fs";
import path from "node:path";

export class PathConfinementError extends Error {
    public override name = "PathConfinementError";
}

function hasParentSegment(value: string): boolean {
    const segments = value.split(/[\\/]+/);
    for (const segment of segments) {
        if (segment === "..") {
            return true;
        }
    }
    return false;
}

export function resolveConfinedPath(baseDirectory: string, relativePath: string): string {
    if (relativePath.length === 0) {
        throw new PathConfinementError("A file path cannot be empty.");
    }
    if (relativePath.includes("\0")) {
        throw new PathConfinementError("A file path cannot contain a null byte.");
    }
    if (path.isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath)) {
        throw new PathConfinementError(`Absolute paths are not allowed: ${relativePath}`);
    }
    if (hasParentSegment(relativePath)) {
        throw new PathConfinementError(
            `Parent-directory segments are not allowed: ${relativePath}`,
        );
    }

    const base = path.resolve(baseDirectory);
    const target = path.resolve(base, relativePath);
    if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
        throw new PathConfinementError(`Path escapes the target directory: ${relativePath}`);
    }
    return target;
}

function nearestExistingAncestor(target: string): string {
    let current = target;
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current) {
            return current;
        }
        current = parent;
    }
    return current;
}

export function assertRealPathInside(baseDirectory: string, target: string): void {
    const baseReal = fs.realpathSync(baseDirectory);
    const ancestorReal = fs.realpathSync(nearestExistingAncestor(target));
    if (ancestorReal !== baseReal && !ancestorReal.startsWith(`${baseReal}${path.sep}`)) {
        throw new PathConfinementError(`Resolved path leaves the target directory: ${target}`);
    }
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
        throw new PathConfinementError(
            `Refusing to write through an existing symbolic link: ${target}`,
        );
    }
}

export function ensureDirectory(directory: string): void {
    fs.mkdirSync(directory, { recursive: true });
}

export function isDirectory(value: string): boolean {
    try {
        return fs.statSync(value).isDirectory();
    } catch (error) {
        if (error instanceof Error) {
            return false;
        }
        return false;
    }
}
