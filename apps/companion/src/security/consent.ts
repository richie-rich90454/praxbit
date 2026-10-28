import readline from "node:readline/promises";

export function parseConsent(answer: string): boolean {
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
}

export function parseBooleanFlag(value: string | undefined): boolean {
    if (value === undefined) {
        return false;
    }
    return parseConsent(value) || value === "true" || value === "1";
}

export async function askConsent(question: string): Promise<boolean> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return false;
    }
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        const answer = await readlineInterface.question(`${question} Type yes to continue: `);
        return parseConsent(answer);
    } finally {
        readlineInterface.close();
    }
}

export async function requireConsent(question: string, preApproved: boolean): Promise<void> {
    if (preApproved) {
        return;
    }
    const approved = await askConsent(question);
    if (!approved) {
        throw new Error("Consent was not given. Nothing was written or executed.");
    }
}
