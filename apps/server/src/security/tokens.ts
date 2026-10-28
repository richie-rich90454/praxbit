import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createOpaqueToken(): string {
    return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function createInviteCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(8);
    let code = "";
    for (const byte of bytes) {
        const index = byte % alphabet.length;
        code += alphabet[index] ?? "A";
    }
    return code;
}

export function constantTimeEquals(left: string, right: string): boolean {
    const leftHash = createHash("sha256").update(left).digest();
    const rightHash = createHash("sha256").update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
}

export function sha256Hex(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}
