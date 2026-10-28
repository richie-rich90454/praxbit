export function firstLine(value: string): string {
    const lines = value.replace(/\r/g, "").split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }
    return "";
}

export function limitText(
    value: string,
    maximumCharacters: number,
): { readonly text: string; readonly truncated: boolean } {
    if (value.length <= maximumCharacters) {
        return { text: value, truncated: false };
    }
    return {
        text: `${value.slice(0, maximumCharacters)}\n[output truncated after ${maximumCharacters} characters]`,
        truncated: true,
    };
}

export function formatTimestamp(date: Date): string {
    return date.toISOString().replace(/[:.]/g, "-");
}
