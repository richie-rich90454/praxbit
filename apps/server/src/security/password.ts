import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const MAXIMUM_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise(function executor(
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    ): void {
        scrypt(
            password,
            salt,
            KEY_LENGTH,
            {
                N: SCRYPT_COST,
                r: SCRYPT_BLOCK_SIZE,
                p: SCRYPT_PARALLELIZATION,
                maxmem: MAXIMUM_MEMORY,
            },
            function completed(error: Error | null, key: Buffer): void {
                if (error !== null) {
                    reject(error);
                    return;
                }
                resolve(key);
            },
        );
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt);
    return [
        "scrypt",
        String(SCRYPT_COST),
        String(SCRYPT_BLOCK_SIZE),
        String(SCRYPT_PARALLELIZATION),
        salt.toString("base64"),
        key.toString("base64"),
    ].join("$");
}

function decodeSegment(value: string | undefined): Buffer | undefined {
    if (value === undefined) {
        return undefined;
    }
    try {
        return Buffer.from(value, "base64");
    } catch {
        return undefined;
    }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") {
        return false;
    }
    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);
    const salt = decodeSegment(parts[4]);
    const expected = decodeSegment(parts[5]);
    if (
        salt === undefined ||
        expected === undefined ||
        cost !== SCRYPT_COST ||
        blockSize !== SCRYPT_BLOCK_SIZE ||
        parallelization !== SCRYPT_PARALLELIZATION
    ) {
        return false;
    }

    const actual = await new Promise<Buffer | undefined>(function executor(
        resolve: (value: Buffer | undefined) => void,
        reject: (reason: Error) => void,
    ): void {
        scrypt(
            password,
            salt,
            expected.length,
            { N: cost, r: blockSize, p: parallelization, maxmem: MAXIMUM_MEMORY },
            function completed(error: Error | null, key: Buffer): void {
                if (error !== null) {
                    reject(error);
                    return;
                }
                resolve(key);
            },
        );
    });

    if (actual === undefined || actual.length !== expected.length) {
        return false;
    }
    return timingSafeEqual(actual, expected);
}
