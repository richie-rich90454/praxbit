import type { ContentfulStatusCode } from "hono/utils/http-status";

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };

export interface ApiErrorBody {
    readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details?: JsonValue;
        readonly requestId: string;
    };
}

export class AppError extends Error {
    public readonly status: ContentfulStatusCode;
    public readonly code: string;
    public readonly details: JsonValue | undefined;
    public readonly retryAfterSeconds: number | undefined;

    public constructor(
        status: ContentfulStatusCode,
        code: string,
        message: string,
        details?: JsonValue,
        retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.code = code;
        this.details = details;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export function errorBody(
    code: string,
    message: string,
    requestId: string,
    details?: JsonValue,
): ApiErrorBody {
    if (details === undefined) {
        return { error: { code, message, requestId } };
    }
    return { error: { code, message, details, requestId } };
}

export function unauthorized(message = "Sign in to continue."): AppError {
    return new AppError(401, "unauthorized", message);
}

export function forbidden(code: string, message: string): AppError {
    return new AppError(403, code, message);
}

export function notFound(code: string, message: string): AppError {
    return new AppError(404, code, message);
}

export function conflict(code: string, message: string, details?: JsonValue): AppError {
    return new AppError(409, code, message, details);
}

export function validationError(message: string, details: JsonValue): AppError {
    return new AppError(400, "validation_error", message, details);
}

export function invalidJson(): AppError {
    return new AppError(400, "invalid_json", "The request body is not valid JSON.");
}
