const INVALID_PATH_CHARACTERS = /[\\:]/;

function hasControlCharacters(value: string): boolean {
    for (const character of value) {
        const code = character.codePointAt(0) ?? 0;
        if (code <= 0x1f) {
            return true;
        }
    }
    return false;
}

export function isSafeRelativePath(value: string): boolean {
    if (value.length === 0 || value.length > 200) {
        return false;
    }
    if (value.startsWith("/") || value.startsWith("\\")) {
        return false;
    }
    if (INVALID_PATH_CHARACTERS.test(value) || hasControlCharacters(value)) {
        return false;
    }
    const segments = value.split("/");
    for (const segment of segments) {
        if (segment.length === 0 || segment === "." || segment === "..") {
            return false;
        }
    }
    return true;
}
