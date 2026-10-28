import type { Context } from "hono";
import { ZodError, type ZodType } from "zod";
import { invalidJson, validationError } from "./app-error.ts";
import type { AppEnvironment } from "../types.ts";

export type ValidationIssue = {
    readonly path: string;
    readonly message: string;
};

export function describeZodError(error: ZodError): readonly ValidationIssue[] {
    return error.issues.map(function toIssue(issue): ValidationIssue {
        return {
            path: issue.path.map(String).join("."),
            message: issue.message,
        };
    });
}

export async function parseRequestBody<T>(
    context: Context<AppEnvironment>,
    schema: ZodType<T>,
): Promise<T> {
    let value: unknown;
    try {
        value = await context.req.json();
    } catch {
        throw invalidJson();
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw validationError("The request body is invalid.", {
            issues: describeZodError(parsed.error),
        });
    }
    return parsed.data;
}

export function parseQuery<T>(context: Context<AppEnvironment>, schema: ZodType<T>): T {
    const entries: Record<string, string> = {};
    for (const [key, value] of new URL(context.req.url).searchParams.entries()) {
        entries[key] = value;
    }
    const parsed = schema.safeParse(entries);
    if (!parsed.success) {
        throw validationError("The query parameters are invalid.", {
            issues: describeZodError(parsed.error),
        });
    }
    return parsed.data;
}
