import type { User } from "@praxbit/contracts";

export type AuthenticationMethod = "cookie" | "bearer";

export interface AuthenticatedSession {
    readonly user: User;
    readonly sessionId: string;
    readonly tokenHash: string;
    readonly method: AuthenticationMethod;
}

export interface AppVariables {
    readonly requestId: string;
    readonly session: AuthenticatedSession | null;
}

export interface AppEnvironment {
    Variables: {
        requestId: string;
        session: AuthenticatedSession | null;
    };
}
