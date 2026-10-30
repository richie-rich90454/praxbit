#!/usr/bin/env node
// Verify a running Praxbit deployment without starting or changing anything.
// The default base is loopback; Host headers emulate `curl --resolve` so both
// public hostnames can be checked against one local or remote listener.

import http from "node:http";
import https from "node:https";

const DEFAULT_BASE = process.env.PRAXBIT_VERIFY_BASE ?? "http://127.0.0.1:8787";
const DEFAULT_HOSTS = ["praxbit.biszweb.club", "praxbit.bisz.dev"];
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const USAGE = `Usage: node scripts/verify-hosting.mjs [options]

Options:
  --base <url>       Listener to connect to. Default: ${DEFAULT_BASE}
  --host <name>      Host header to send. Repeat or comma-separate. Default: both
                     praxbit.biszweb.club and praxbit.bisz.dev.
  --timeout <ms>     Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help             Show this message.

The script starts nothing. Start the built server first, then run:
  pnpm verify:hosting -- --base http://127.0.0.1:8787
For a public deployment:
  pnpm verify:hosting -- --base https://praxbit.bisz.dev`;

function failUsage(message) {
    console.error(`verify-hosting: ${message}`);
    console.error(USAGE);
    process.exit(2);
}

function parseArguments(argv) {
    const options = {
        base: DEFAULT_BASE,
        hosts: [...DEFAULT_HOSTS],
        timeoutMs: DEFAULT_TIMEOUT_MS,
    };
    let hostsProvided = false;

    for (let index = 0; index < argv.length; index += 1) {
        const raw = argv[index];
        if (raw === "--help" || raw === "-h") {
            console.log(USAGE);
            process.exit(0);
        }
        const separator = raw.indexOf("=");
        const name = separator === -1 ? raw : raw.slice(0, separator);
        const inlineValue = separator === -1 ? undefined : raw.slice(separator + 1);

        if (name !== "--base" && name !== "--host" && name !== "--timeout") {
            failUsage(`unknown argument ${raw}`);
        }
        const value = inlineValue ?? argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
            failUsage(`${name} requires a value`);
        }
        if (inlineValue === undefined) {
            index += 1;
        }

        if (name === "--base") {
            options.base = value;
        } else if (name === "--timeout") {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed < 500 || parsed > 120000) {
                failUsage("--timeout must be an integer between 500 and 120000");
            }
            options.timeoutMs = parsed;
        } else {
            const names = value
                .split(",")
                .map((host) => host.trim().toLowerCase())
                .filter((host) => host.length > 0);
            if (names.length === 0) {
                failUsage("--host requires at least one hostname");
            }
            if (!hostsProvided) {
                options.hosts = [];
                hostsProvided = true;
            }
            options.hosts.push(...names);
        }
    }

    const uniqueHosts = [...new Set(options.hosts)];
    for (const host of uniqueHosts) {
        if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith(".") || host.endsWith(".")) {
            failUsage(`invalid hostname ${host}; pass a bare DNS name, not a URL`);
        }
    }
    if (uniqueHosts.length === 0) {
        failUsage("no hostnames to check");
    }
    options.hosts = uniqueHosts;

    let base;
    try {
        base = new URL(options.base);
    } catch {
        failUsage(`--base is not a valid URL: ${options.base}`);
    }
    if (base.protocol !== "http:" && base.protocol !== "https:") {
        failUsage("--base must use http:// or https://");
    }
    if (base.pathname !== "/" || base.search !== "" || base.hash !== "") {
        failUsage("--base must be an origin without a path, query, or fragment");
    }
    options.baseUrl = base;
    return options;
}

function headerValues(rawHeaders, name) {
    const values = [];
    for (let index = 0; index < rawHeaders.length; index += 2) {
        if (rawHeaders[index].toLowerCase() === name) {
            values.push(rawHeaders[index + 1]);
        }
    }
    return values;
}

function requestOnce(base, host, path, timeoutMs, readBody) {
    return new Promise((resolve) => {
        const transport = base.protocol === "https:" ? https : http;
        const request = transport.request(
            {
                protocol: base.protocol,
                hostname: base.hostname,
                port: base.port === "" ? undefined : base.port,
                method: "GET",
                path,
                headers: {
                    host,
                    accept: "*/*",
                    "accept-encoding": "identity",
                    connection: "close",
                    "user-agent": "praxbit-verify-hosting/1.0",
                },
                servername: base.protocol === "https:" ? host : undefined,
                timeout: timeoutMs,
            },
            (response) => {
                const chunks = [];
                let size = 0;
                response.on("data", (chunk) => {
                    size += chunk.length;
                    if (readBody && size <= MAX_BODY_BYTES) {
                        chunks.push(chunk);
                    }
                });
                response.on("end", () => {
                    resolve({
                        status: response.statusCode ?? 0,
                        headers: response.headers,
                        rawHeaders: response.rawHeaders,
                        body: readBody ? Buffer.concat(chunks).toString("utf8") : "",
                    });
                });
                response.on("error", (error) => {
                    resolve({ error });
                });
            },
        );
        request.on("timeout", () => {
            request.destroy(new Error(`timed out after ${timeoutMs} ms`));
        });
        request.on("error", (error) => {
            resolve({ error });
        });
        request.end();
    });
}

function parseJson(response) {
    try {
        return JSON.parse(response.body);
    } catch {
        return undefined;
    }
}

function describeError(error, base) {
    if (error?.code === "ECONNREFUSED") {
        return `connection refused by ${base.host}; start the built server with "pnpm start" or point --base at the proxy`;
    }
    if (error?.code === "ENOTFOUND" || error?.code === "EAI_AGAIN") {
        return `DNS lookup failed for ${base.hostname}; check DNS or use --base with the server IP or a local proxy`;
    }
    if (error?.code === "CERT_HAS_EXPIRED" || error?.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
        return `TLS verification failed (${error.code}); the certificate must cover every --host name`;
    }
    return error?.message ?? String(error);
}

function isHtml(response) {
    return (response.headers["content-type"] ?? "").toLowerCase().includes("text/html");
}

function isJson(response) {
    return (response.headers["content-type"] ?? "").toLowerCase().includes("application/json");
}

function isJavaScript(response) {
    const contentType = (response.headers["content-type"] ?? "").toLowerCase();
    return (
        contentType.includes("text/javascript") || contentType.includes("application/javascript")
    );
}

function hasAppShell(response) {
    return (
        isHtml(response) && response.body.includes('id="root"') && response.body.includes("<script")
    );
}

function externalReferences(html, host) {
    const candidates = [];
    const attributePattern = /\b(?:src|href|action|poster)\s*=\s*["']([^"']+)["']/gi;
    for (const match of html.matchAll(attributePattern)) {
        candidates.push(match[1]);
    }
    const srcsetPattern = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
    for (const match of html.matchAll(srcsetPattern)) {
        for (const candidate of match[1].split(",")) {
            candidates.push(candidate.trim().split(/\s+/)[0]);
        }
    }
    const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    for (const match of html.matchAll(cssUrlPattern)) {
        candidates.push(match[1]);
    }

    const external = [];
    for (const candidate of candidates) {
        const value = candidate.trim();
        if (
            value.length === 0 ||
            value.startsWith("#") ||
            value.startsWith("data:") ||
            value.startsWith("blob:") ||
            value.startsWith("mailto:") ||
            value.startsWith("tel:") ||
            value.startsWith("javascript:")
        ) {
            continue;
        }
        let resolved;
        try {
            resolved = new URL(value, `https://${host}/`);
        } catch {
            external.push(value);
            continue;
        }
        if (resolved.host !== host) {
            external.push(value);
        }
    }
    return external;
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    const base = options.baseUrl;
    const results = [];
    const seenErrors = new Set();

    function add(host, name, ok, detail) {
        results.push({ host, name, ok, detail });
    }

    async function get(host, path, readBody = true) {
        const response = await requestOnce(base, host, path, options.timeoutMs, readBody);
        if (response.error !== undefined) {
            const detail = describeError(response.error, base);
            if (!seenErrors.has(detail)) {
                seenErrors.add(detail);
                console.error(`Hint: ${detail}`);
            }
            return { ...response, detail };
        }
        return response;
    }

    function addResponseFailure(host, name, response, expected) {
        if (response.error !== undefined) {
            add(host, name, false, response.detail);
            return true;
        }
        if (response.status !== expected) {
            const location = response.headers.location;
            const redirect =
                location === undefined
                    ? ""
                    : ` Redirected to ${location}; use that origin with --base for TLS checks.`;
            add(
                host,
                name,
                false,
                `Expected ${expected}, got ${response.status}.${redirect} ${expected === 200 ? "Confirm the proxy forwards this path to 127.0.0.1:8787." : "Confirm the app is built and running."}`,
            );
            return true;
        }
        return false;
    }

    async function verifyHost(host) {
        const health = await get(host, "/healthz");
        if (!addResponseFailure(host, "GET /healthz", health, 200)) {
            const body = parseJson(health);
            add(
                host,
                "GET /healthz",
                body?.status === "ok",
                body?.status === "ok"
                    ? ""
                    : "Expected a JSON body with status=ok. The proxy may be serving an error page instead of the app.",
            );
        }

        const ready = await get(host, "/readyz");
        if (ready.error !== undefined) {
            add(host, "GET /readyz", false, ready.detail);
        } else if (ready.status === 503) {
            add(
                host,
                "GET /readyz",
                false,
                "PostgreSQL is not reachable. Check DATABASE_URL and the database service.",
            );
        } else if (ready.status !== 200) {
            add(
                host,
                "GET /readyz",
                false,
                `Expected 200, got ${ready.status}. Confirm the proxy forwards /readyz to 127.0.0.1:8787.`,
            );
        } else {
            const body = parseJson(ready);
            add(
                host,
                "GET /readyz",
                body?.status === "ready",
                body?.status === "ready"
                    ? ""
                    : `Expected status=ready. PostgreSQL may be unreachable; check DATABASE_URL. Body: ${ready.body.slice(0, 160)}`,
            );
        }

        const learn = await get(host, "/learn");
        if (!addResponseFailure(host, "GET /learn", learn, 200)) {
            add(
                host,
                "GET /learn",
                hasAppShell(learn),
                hasAppShell(learn)
                    ? ""
                    : "Expected the built app shell. Run pnpm build, and make sure the proxy has no static root that bypasses the app.",
            );
        }

        const mission = await get(host, "/missions/before-code.make-it-respond");
        if (!addResponseFailure(host, "GET dotted mission route", mission, 200)) {
            add(
                host,
                "GET dotted mission route",
                hasAppShell(mission),
                hasAppShell(mission)
                    ? ""
                    : "Expected the SPA shell for a mission id containing dots. Do not route dotted paths to a static 404 handler.",
            );
        }

        const project = await get(host, "/projects/projects.campus-status-board");
        if (!addResponseFailure(host, "GET dotted project route", project, 200)) {
            add(
                host,
                "GET dotted project route",
                hasAppShell(project),
                hasAppShell(project)
                    ? ""
                    : "Expected the SPA shell for a project id containing dots. Do not route dotted paths to a static 404 handler.",
            );
        }

        const pyodideModule = await get(host, "/pyodide/pyodide.mjs");
        if (!addResponseFailure(host, "GET /pyodide/pyodide.mjs", pyodideModule, 200)) {
            add(
                host,
                "GET /pyodide/pyodide.mjs",
                isJavaScript(pyodideModule),
                isJavaScript(pyodideModule)
                    ? ""
                    : `Expected a JavaScript MIME type, got ${pyodideModule.headers["content-type"] ?? "none"}. Do not override Content-Type in the proxy.`,
            );
        } else if (pyodideModule.status === 404) {
            add(
                host,
                "GET /pyodide/pyodide.mjs",
                false,
                "Run pnpm build; the Vite build copies Pyodide into apps/web/dist/pyodide.",
            );
        }

        const pyodideWasm = await get(host, "/pyodide/pyodide.asm.wasm", false);
        if (!addResponseFailure(host, "GET /pyodide/pyodide.asm.wasm", pyodideWasm, 200)) {
            const contentType = (pyodideWasm.headers["content-type"] ?? "").toLowerCase();
            add(
                host,
                "GET /pyodide/pyodide.asm.wasm",
                contentType.includes("application/wasm"),
                contentType.includes("application/wasm")
                    ? ""
                    : `Expected application/wasm, got ${contentType || "none"}. Hono sets this MIME type; do not rewrite .wasm responses in the proxy.`,
            );
        } else if (pyodideWasm.status === 404) {
            add(
                host,
                "GET /pyodide/pyodide.asm.wasm",
                false,
                "Run pnpm build; the Vite build copies Pyodide into apps/web/dist/pyodide.",
            );
        }

        const apiMissing = await get(host, "/api/__verify_missing__");
        if (!addResponseFailure(host, "GET /api/__verify_missing__", apiMissing, 404)) {
            add(
                host,
                "GET /api/__verify_missing__",
                isJson(apiMissing),
                isJson(apiMissing)
                    ? ""
                    : "Expected application/json for an unknown API route, not HTML.",
            );
            const apiBody = parseJson(apiMissing);
            add(
                host,
                "GET /api 404 separation",
                apiBody?.error?.code === "not_found",
                apiBody?.error?.code === "not_found"
                    ? ""
                    : `Expected error.code=not_found; the proxy may be sending /api to the SPA fallback. Body: ${apiMissing.body.slice(0, 160)}`,
            );
            const apiCsp = headerValues(apiMissing.rawHeaders, "content-security-policy");
            add(
                host,
                "GET /api CSP",
                apiCsp.length === 1 && apiCsp[0].includes("default-src 'none'"),
                apiCsp.length === 1 && apiCsp[0].includes("default-src 'none'")
                    ? ""
                    : "Expected the API CSP with default-src 'none'. Let Hono send CSP; do not set a second policy in the proxy.",
            );
        }

        const root = await get(host, "/");
        if (!addResponseFailure(host, "GET /", root, 200)) {
            const csp = headerValues(root.rawHeaders, "content-security-policy");
            add(
                host,
                "CSP present once",
                csp.length === 1 && csp[0].includes("default-src 'self'"),
                csp.length === 0
                    ? "No Content-Security-Policy on /. The proxy is stripping the app header; do not set a CSP in the proxy."
                    : csp.length > 1
                      ? `Content-Security-Policy appears ${csp.length} times. Remove the proxy policy; Hono owns it.`
                      : "CSP does not include default-src 'self'. Check that the app response is not being rewritten.",
            );

            const securityHeaders = [
                ["x-content-type-options", "nosniff"],
                ["x-frame-options", "DENY"],
                ["referrer-policy", "no-referrer"],
                ["cross-origin-opener-policy", "same-origin"],
                ["permissions-policy", "camera=()"],
            ];
            for (const [name, expected] of securityHeaders) {
                const values = headerValues(root.rawHeaders, name);
                const label = `Header ${name}`;
                add(
                    host,
                    label,
                    values.length === 1 && values[0].toLowerCase().includes(expected.toLowerCase()),
                    values.length === 0
                        ? `Missing ${name}. The proxy may be stripping it, or the app response is not reaching the client.`
                        : values.length > 1
                          ? `${name} appears ${values.length} times. Remove the duplicate from the proxy or use proxy_hide_header before setting it.`
                          : `Expected ${expected}, got ${values[0]}.`,
                );
            }

            const hsts = headerValues(root.rawHeaders, "strict-transport-security");
            if (base.protocol === "https:") {
                add(
                    host,
                    "HSTS on HTTPS",
                    hsts.length === 1 && hsts[0].includes("max-age=31536000"),
                    hsts.length === 0
                        ? "Missing Strict-Transport-Security on HTTPS. Set COOKIE_SECURE=1 or add HSTS in the HTTPS server block."
                        : hsts.length > 1
                          ? `Strict-Transport-Security appears ${hsts.length} times. Keep one value in the app or the proxy, not both.`
                          : `Expected max-age=31536000, got ${hsts[0]}.`,
                );
            } else {
                add(
                    host,
                    "HSTS only over HTTPS",
                    hsts.length === 0,
                    hsts.length === 0
                        ? ""
                        : "HSTS was sent over HTTP. Remove it from the HTTP listener; it is only valid over HTTPS.",
                );
            }

            const external = externalReferences(root.body, host);
            add(
                host,
                "No third-party requests in index.html",
                external.length === 0,
                external.length === 0
                    ? ""
                    : `Found external references: ${external.slice(0, 5).join(", ")}. Bundle the asset or serve it from ${host}.`,
            );
        }

        const serviceWorker = await get(host, "/sw.js");
        if (!addResponseFailure(host, "GET /sw.js", serviceWorker, 200)) {
            const looksLikeWorker =
                serviceWorker.body.includes("precacheAndRoute") ||
                serviceWorker.body.includes("importScripts") ||
                serviceWorker.body.includes("skipWaiting");
            add(
                host,
                "Service worker",
                isJavaScript(serviceWorker) && looksLikeWorker,
                isJavaScript(serviceWorker) && looksLikeWorker
                    ? ""
                    : "Expected a JavaScript service worker. Run pnpm build and do not exclude /sw.js at the proxy.",
            );
        } else if (serviceWorker.status === 404) {
            add(
                host,
                "Service worker",
                false,
                "Missing /sw.js. Run pnpm build and check WEB_DIST.",
            );
        }
    }

    console.log("Praxbit hosting verification");
    console.log(`Base: ${base.origin}`);
    console.log(`Hosts: ${options.hosts.join(", ")}`);
    console.log("");

    (async () => {
        for (const host of options.hosts) {
            await verifyHost(host);
        }

        for (const result of results) {
            const status = result.ok ? "pass" : "fail";
            const detail = result.ok || result.detail.length === 0 ? "" : ` - ${result.detail}`;
            console.log(`[${status}] ${result.host} ${result.name}${detail}`);
        }

        const failed = results.filter((result) => !result.ok).length;
        console.log("");
        if (failed === 0) {
            console.log(
                `All ${results.length} checks passed for ${options.hosts.length} hostname(s).`,
            );
            return;
        }
        console.log(`${failed} of ${results.length} checks failed.`);
        console.log(
            "Start the built app with pnpm build && pnpm start, or run these checks against the proxy with --base.",
        );
        process.exitCode = 1;
    })().catch((error) => {
        console.error(`verify-hosting: unexpected failure: ${error?.stack ?? error}`);
        process.exitCode = 1;
    });
}

main();
