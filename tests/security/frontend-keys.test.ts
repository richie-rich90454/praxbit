import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_SOURCE = fileURLToPath(new URL("../../apps/web/src", import.meta.url));

const KEY_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: "OpenAI-style secret", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
    { name: "Anthropic secret", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
    { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
    {
        name: "literal OpenAI environment value",
        pattern: /VITE_OPENAI[A-Z_]*\s*[:=]\s*["'][^"']{8,}["']/,
    },
    {
        name: "literal Anthropic environment value",
        pattern: /VITE_ANTHROPIC[A-Z_]*\s*[:=]\s*["'][^"']{8,}["']/,
    },
    { name: "direct OpenAI host", pattern: /api\.openai\.com/ },
    { name: "direct Anthropic host", pattern: /api\.anthropic\.com/ },
];

async function listSourceFiles(directory: string): Promise<readonly string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listSourceFiles(fullPath)));
        } else if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}

describe("frontend secret boundary", function frontendSecrets(): void {
    it("contains no provider API keys or direct provider endpoints", async function noKeys(): Promise<void> {
        const files = await listSourceFiles(WEB_SOURCE);
        expect(files.length).toBeGreaterThan(10);
        const findings: string[] = [];
        for (const filePath of files) {
            const text = await readFile(filePath, "utf8");
            for (const candidate of KEY_PATTERNS) {
                if (candidate.pattern.test(text)) {
                    findings.push(`${path.relative(WEB_SOURCE, filePath)}: ${candidate.name}`);
                }
            }
        }
        expect(findings).toEqual([]);
    });
});
