const NATIVE_API_BASE = "https://praxbit.bisz.dev/api/v1";

export function resolveApiBaseUrl(native: boolean, configured?: string): string {
    const value = configured?.trim();
    if (value !== undefined && value.length > 0) {
        return value.replace(/\/+$/u, "");
    }
    return native ? NATIVE_API_BASE : "/api/v1";
}
