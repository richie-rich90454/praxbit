const SIMPLE_ROUTES = new Set(["/learn", "/club", "/settings", "/practice"]);
const RESOURCE_ROUTES = new Set(["missions", "projects"]);
const ALLOWED_PROTOCOLS = new Set(["praxbit:", "https:", "http:"]);

export function parseDeepLink(input: string): string | undefined {
    let url: URL;
    try {
        url = new URL(input, "https://praxbit.invalid");
    } catch {
        return undefined;
    }
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
        return undefined;
    }
    const rawSegments =
        url.protocol === "praxbit:"
            ? [url.host, ...url.pathname.split("/")]
            : url.pathname.split("/");
    const segments = rawSegments.filter(function present(segment): boolean {
        return segment.length > 0;
    });
    if (segments.length === 1) {
        const route = `/${segments[0] ?? ""}`;
        return SIMPLE_ROUTES.has(route) ? route : undefined;
    }
    if (segments.length === 2) {
        const section = segments[0];
        const encodedId = segments[1];
        if (section === undefined || encodedId === undefined || !RESOURCE_ROUTES.has(section)) {
            return undefined;
        }
        let id: string;
        try {
            id = decodeURIComponent(encodedId);
        } catch {
            return undefined;
        }
        if (id.length === 0 || id.includes("/") || id.includes("?") || id.includes("#")) {
            return undefined;
        }
        return `/${section}/${encodeURIComponent(id)}`;
    }
    return undefined;
}
