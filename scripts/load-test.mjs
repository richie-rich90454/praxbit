#!/usr/bin/env node
// Dependency-free load test for a running Praxbit server.
// Default scenarios exercise the guest content path (catalog, mission, skills,
// SPA shell, capability probe) and readiness-relevant endpoints. Authenticated
// scenarios and duplicate/world probes run only when PRAXBIT_LOAD_TOKEN is set.
// Thresholds are enforced: p95, p99, error rate, and server RSS from /metrics.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const DEFAULTS = {
    url: process.env.PRAXBIT_LOAD_URL ?? "http://127.0.0.1:8787",
    durationSeconds: 20,
    thinkTimeMs: 250,
    maxP95Ms: 750,
    maxP99Ms: 1500,
    maxErrorRate: 0.01,
    maxRssMb: 300,
    missionId: process.env.PRAXBIT_LOAD_MISSION_ID ?? "before-code.make-it-respond",
    missionVersion: 1,
    requestTimeoutMs: 10_000,
};

function printHelp() {
    console.log(`Usage: node scripts/load-test.mjs [options]

Options:
  --url <origin>              Server origin (default ${DEFAULTS.url})
  --concurrency <n>           Run one phase with n learners instead of 20 and 40
  --duration <seconds>        Duration of each phase (default ${DEFAULTS.durationSeconds})
  --think-time <ms>           Pause between requests per learner (default ${DEFAULTS.thinkTimeMs})
  --max-p95-ms <ms>           Fail a phase when p95 exceeds this (default ${DEFAULTS.maxP95Ms})
  --max-p99-ms <ms>           Fail a phase when p99 exceeds this (default ${DEFAULTS.maxP99Ms})
  --max-error-rate <ratio>    Fail a phase above this error rate (default ${DEFAULTS.maxErrorRate})
  --max-rss-mb <mb>           Fail when sampled server RSS exceeds this (default ${DEFAULTS.maxRssMb})
  --mission <id>              Mission used by the guest and completion probes
  --db-outage-probe           Stop and restart PostgreSQL using the commands below
  --skip-extra                Skip authenticated duplicate/world probes
  --help                      Show this help

Environment:
  PRAXBIT_LOAD_TOKEN          Bearer token for authenticated probes; never printed
  PRAXBIT_METRICS_TOKEN       Bearer token for /metrics when it is protected
  PRAXBIT_LOAD_MISSION_VERSION Mission version (default 1)
  PRAXBIT_LOAD_DB_STOP_CMD    Command that stops the disposable database
  PRAXBIT_LOAD_DB_START_CMD   Command that starts the disposable database
  PRAXBIT_LOAD_ALLOW_DB_CONTROL=yes
                              Required before the database commands are executed
  PRAXBIT_LOAD_ALLOW_REMOTE_DB_CONTROL=yes
                              Allow the database probe against a non-loopback URL

Every scenario uses a synthetic X-Forwarded-For value per learner so the global
rate limiter sees distinct clients. The database probe is opt-in and must point
at a disposable database, never the production instance.
`);
}

function parseArguments(argv) {
    const options = {
        url: DEFAULTS.url,
        concurrency: undefined,
        durationSeconds: DEFAULTS.durationSeconds,
        thinkTimeMs: DEFAULTS.thinkTimeMs,
        maxP95Ms: DEFAULTS.maxP95Ms,
        maxP99Ms: DEFAULTS.maxP99Ms,
        maxErrorRate: DEFAULTS.maxErrorRate,
        maxRssMb: DEFAULTS.maxRssMb,
        missionId: DEFAULTS.missionId,
        dbOutageProbe: false,
        skipExtra: false,
        help: false,
    };
    let index = 0;
    while (index < argv.length) {
        const argument = argv[index];
        if (argument === "--help" || argument === "-h") {
            options.help = true;
            index += 1;
            continue;
        }
        if (argument === "--skip-extra") {
            options.skipExtra = true;
            index += 1;
            continue;
        }
        if (argument === "--db-outage-probe") {
            options.dbOutageProbe = true;
            index += 1;
            continue;
        }
        const value = argv[index + 1];
        if (value === undefined) {
            throw new Error(`Option ${argument} requires a value.`);
        }
        if (argument === "--url") {
            options.url = value;
        } else if (argument === "--concurrency") {
            options.concurrency = parseInteger(value, "--concurrency", 1, 500);
        } else if (argument === "--duration") {
            options.durationSeconds = parseInteger(value, "--duration", 1, 600);
        } else if (argument === "--think-time") {
            options.thinkTimeMs = parseInteger(value, "--think-time", 0, 60_000);
        } else if (argument === "--max-p95-ms") {
            options.maxP95Ms = parseNumber(value, "--max-p95-ms", 1);
        } else if (argument === "--max-p99-ms") {
            options.maxP99Ms = parseNumber(value, "--max-p99-ms", 1);
        } else if (argument === "--max-error-rate") {
            options.maxErrorRate = parseRatio(value);
        } else if (argument === "--max-rss-mb") {
            options.maxRssMb = parseInteger(value, "--max-rss-mb", 1, 65_536);
        } else if (argument === "--mission") {
            options.missionId = value;
        } else {
            throw new Error(`Unknown option: ${argument}`);
        }
        index += 2;
    }
    if (!options.url.startsWith("http://") && !options.url.startsWith("https://")) {
        throw new Error("--url must be an absolute http or https origin.");
    }
    options.url = options.url.replace(/\/+$/, "");
    return options;
}

function parseInteger(value, name, minimum, maximum) {
    if (!/^[0-9]+$/.test(value)) {
        throw new Error(`${name} must be a whole number.`);
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
}

function parseNumber(value, name, minimum) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum) {
        throw new Error(`${name} must be a number of at least ${minimum}.`);
    }
    return parsed;
}

function parseRatio(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error("--max-error-rate must be between 0 and 1.");
    }
    return parsed;
}

function parseMissionVersion(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULTS.missionVersion;
}

function sleep(milliseconds) {
    return new Promise(function resolveLater(resolve) {
        setTimeout(resolve, milliseconds);
    });
}

function percentile(sorted, fraction) {
    if (sorted.length === 0) {
        return 0;
    }
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
    return sorted[index];
}

function syntheticAddress(workerId) {
    return `198.18.${Math.floor(workerId / 250)}.${(workerId % 250) + 1}`;
}

function isLoopbackOrigin(value) {
    const parsed = new URL(value);
    return (
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "::1" ||
        parsed.hostname === "[::1]"
    );
}

function authHeaders(token) {
    const headers = { accept: "application/json" };
    if (token !== undefined && token.length > 0) {
        headers.authorization = `Bearer ${token}`;
    }
    return headers;
}

async function requestOnce(config, path, options = {}) {
    const headers = authHeaders(options.token ?? config.token);
    if (options.body !== undefined) {
        headers["content-type"] = "application/json";
    }
    const response = await fetch(`${config.url}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
    });
    const text = await response.text();
    let body;
    try {
        body = text.length === 0 ? undefined : JSON.parse(text);
    } catch {
        body = undefined;
    }
    return { status: response.status, headers: response.headers, text, body };
}

function createScenario(name, path, options = {}) {
    return {
        name,
        path,
        method: options.method ?? "GET",
        body: options.body,
        auth: options.auth === true,
        accept: options.accept ?? "application/json",
        okStatuses: options.okStatuses ?? [200],
    };
}

async function discoverScenarios(config) {
    const notes = [];
    const catalog = await requestOnce(config, "/api/v1/catalog");
    if (catalog.status !== 200) {
        throw new Error(
            `/api/v1/catalog returned HTTP ${catalog.status}. Start the server and its database first.`,
        );
    }
    const scenarios = [createScenario("guest-catalog", "/api/v1/catalog")];

    const missionId = config.missionId;
    const mission = await requestOnce(config, `/api/v1/missions/${encodeURIComponent(missionId)}`);
    if (mission.status === 200) {
        scenarios.push(
            createScenario("guest-mission", `/api/v1/missions/${encodeURIComponent(missionId)}`),
        );
        const missionRecord = mission.body?.mission;
        const firstSkill =
            missionRecord !== undefined && Array.isArray(missionRecord.skills)
                ? missionRecord.skills[0]
                : undefined;
        if (typeof firstSkill === "string") {
            const skill = await requestOnce(
                config,
                `/api/v1/skills/${encodeURIComponent(firstSkill)}`,
            );
            if (skill.status === 200) {
                scenarios.push(
                    createScenario(
                        "guest-skill",
                        `/api/v1/skills/${encodeURIComponent(firstSkill)}`,
                    ),
                );
            } else {
                notes.push(`guest-skill skipped: HTTP ${skill.status}`);
            }
        }
    } else {
        notes.push(`guest-mission skipped: HTTP ${mission.status}`);
    }

    const capabilities = await requestOnce(config, "/api/v1/capabilities");
    if (capabilities.status === 200) {
        scenarios.push(createScenario("capabilities", "/api/v1/capabilities"));
    } else {
        notes.push(`capabilities skipped: HTTP ${capabilities.status}`);
    }

    const health = await requestOnce(config, "/healthz");
    if (health.status === 200) {
        scenarios.push(createScenario("health", "/healthz"));
    } else {
        notes.push(`health skipped: HTTP ${health.status}`);
    }

    const shell = await requestOnce(config, "/");
    if (shell.status === 200 && shell.headers.get("content-type")?.includes("text/html") === true) {
        scenarios.push(createScenario("static-shell", "/", { accept: "text/html" }));
        const assetMatch = /["'](\/assets\/[^"']+\.(?:js|css|woff2|wasm))["']/.exec(shell.text);
        if (assetMatch !== null && assetMatch[1] !== undefined) {
            scenarios.push(createScenario("static-asset", assetMatch[1], { accept: "*/*" }));
        } else {
            notes.push("static-asset skipped: no hashed asset reference in the shell");
        }
    } else {
        notes.push(`static-shell skipped: HTTP ${shell.status}`);
    }

    const missionPage = await requestOnce(config, `/missions/${encodeURIComponent(missionId)}`, {
        token: undefined,
    });
    if (
        missionPage.status === 200 &&
        missionPage.headers.get("content-type")?.includes("text/html") === true
    ) {
        scenarios.push(
            createScenario("guest-mission-page", `/missions/${encodeURIComponent(missionId)}`, {
                accept: "text/html",
            }),
        );
    } else {
        notes.push(`guest-mission-page skipped: HTTP ${missionPage.status}`);
    }

    if (config.token !== undefined && config.token.length > 0) {
        const me = await requestOnce(config, "/api/v1/me");
        const world = await requestOnce(config, "/api/v1/worlds/campus");
        const sync = await requestOnce(config, "/api/v1/sync", {
            method: "POST",
            body: { operations: [] },
        });
        if (me.status === 200) {
            scenarios.push(createScenario("account-me", "/api/v1/me", { auth: true }));
        } else {
            notes.push(`account-me skipped: HTTP ${me.status}`);
        }
        if (world.status === 200) {
            scenarios.push(createScenario("world-read", "/api/v1/worlds/campus", { auth: true }));
        } else {
            notes.push(`world-read skipped: HTTP ${world.status}`);
        }
        if (sync.status === 200) {
            scenarios.push(
                createScenario("sync-empty", "/api/v1/sync", {
                    method: "POST",
                    auth: true,
                    body: { operations: [] },
                }),
            );
        } else {
            notes.push(`sync-empty skipped: HTTP ${sync.status}`);
        }
    }

    return { scenarios, notes };
}

function createPhaseMetrics() {
    return {
        latencies: [],
        failures: 0,
        total: 0,
        statuses: new Map(),
        errors: [],
        scenarios: new Map(),
    };
}

function scenarioMetrics(metrics, name) {
    let entry = metrics.scenarios.get(name);
    if (entry === undefined) {
        entry = { requests: 0, failures: 0, latencies: [] };
        metrics.scenarios.set(name, entry);
    }
    return entry;
}

async function executeScenario(config, scenario, workerId, metrics) {
    const headers = { accept: scenario.accept };
    headers["x-forwarded-for"] = syntheticAddress(workerId);
    if (scenario.auth) {
        headers.authorization = `Bearer ${config.token}`;
    }
    if (scenario.body !== undefined) {
        headers["content-type"] = "application/json";
    }
    const started = performance.now();
    let status = 0;
    let errorMessage;
    try {
        const response = await fetch(`${config.url}${scenario.path}`, {
            method: scenario.method,
            headers,
            body: scenario.body === undefined ? undefined : JSON.stringify(scenario.body),
            signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
        });
        status = response.status;
        await response.arrayBuffer();
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
    }
    const elapsed = performance.now() - started;
    const success = scenario.okStatuses.includes(status);
    const perScenario = scenarioMetrics(metrics, scenario.name);
    perScenario.requests += 1;
    perScenario.latencies.push(elapsed);
    metrics.latencies.push(elapsed);
    metrics.total += 1;
    metrics.statuses.set(status, (metrics.statuses.get(status) ?? 0) + 1);
    if (!success) {
        metrics.failures += 1;
        perScenario.failures += 1;
        if (metrics.errors.length < 10) {
            metrics.errors.push(
                `${scenario.name}: ${errorMessage === undefined ? `HTTP ${status}` : errorMessage}`,
            );
        }
    }
}

async function learnerWorker(config, scenarios, workerId, metrics, deadline) {
    let cursor = workerId % scenarios.length;
    while (performance.now() < deadline) {
        const scenario = scenarios[cursor % scenarios.length];
        cursor += 1;
        if (scenario !== undefined) {
            await executeScenario(config, scenario, workerId, metrics);
        }
        if (config.thinkTimeMs > 0) {
            await sleep(config.thinkTimeMs);
        }
    }
}

function printScenarioTable(metrics) {
    const rows = [...metrics.scenarios.entries()].sort(function byName(left, right) {
        return left[0].localeCompare(right[0]);
    });
    if (rows.length === 0) {
        return;
    }
    console.log("  Scenario results:");
    for (const [name, entry] of rows) {
        const sorted = [...entry.latencies].sort(function ascending(left, right) {
            return left - right;
        });
        console.log(
            `    ${name.padEnd(22)} ${String(entry.requests).padStart(6)} req  ${String(entry.failures).padStart(4)} err  p95 ${percentile(sorted, 0.95).toFixed(1)} ms`,
        );
    }
}

async function runPhase(config, scenarios, concurrency) {
    const metrics = createPhaseMetrics();
    const started = performance.now();
    const deadline = started + config.durationSeconds * 1000;
    const workers = [];
    for (let index = 0; index < concurrency; index += 1) {
        workers.push(learnerWorker(config, scenarios, index, metrics, deadline));
    }
    await Promise.all(workers);
    const elapsedSeconds = (performance.now() - started) / 1000;
    const sorted = [...metrics.latencies].sort(function ascending(left, right) {
        return left - right;
    });
    const errorRate = metrics.total === 0 ? 1 : metrics.failures / metrics.total;
    const p95 = percentile(sorted, 0.95);
    const p99 = percentile(sorted, 0.99);

    console.log("");
    console.log(`Phase: ${concurrency} concurrent learners`);
    console.log(`  Requests: ${metrics.total}`);
    console.log(`  Elapsed: ${elapsedSeconds.toFixed(2)} s`);
    console.log(`  Throughput: ${(metrics.total / elapsedSeconds).toFixed(1)} req/s`);
    console.log(`  Error rate: ${(errorRate * 100).toFixed(2)}%`);
    console.log(`  p50: ${percentile(sorted, 0.5).toFixed(1)} ms`);
    console.log(`  p95: ${p95.toFixed(1)} ms (limit ${config.maxP95Ms} ms)`);
    console.log(`  p99: ${p99.toFixed(1)} ms (limit ${config.maxP99Ms} ms)`);
    const statusLine = [...metrics.statuses.entries()]
        .sort(function byStatus(left, right) {
            return left[0] - right[0];
        })
        .map(function statusText(entry) {
            return `${entry[0] === 0 ? "network" : entry[0]}: ${entry[1]}`;
        })
        .join(", ");
    console.log(`  Statuses: ${statusLine}`);
    if (metrics.errors.length > 0) {
        console.log("  First errors:");
        for (const message of metrics.errors) {
            console.log(`    ${message}`);
        }
    }
    printScenarioTable(metrics);

    const failures = [];
    if (metrics.total === 0) {
        failures.push("no requests completed");
    }
    if (errorRate > config.maxErrorRate) {
        failures.push(
            `error rate ${(errorRate * 100).toFixed(2)}% exceeds ${(config.maxErrorRate * 100).toFixed(2)}%`,
        );
    }
    if (p95 > config.maxP95Ms) {
        failures.push(`p95 ${p95.toFixed(1)} ms exceeds ${config.maxP95Ms} ms`);
    }
    if (p99 > config.maxP99Ms) {
        failures.push(`p99 ${p99.toFixed(1)} ms exceeds ${config.maxP99Ms} ms`);
    }

    return { concurrency, total: metrics.total, errorRate, p95, p99, failures };
}

function metricValue(text, name) {
    const pattern = new RegExp(`^${name}\\s+([0-9.eE+-]+)$`, "m");
    const match = pattern.exec(text);
    if (match === null || match[1] === undefined) {
        return undefined;
    }
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : undefined;
}

function labeledMetricValue(text, name, label) {
    for (const line of text.split("\n")) {
        if (!line.startsWith(`${name}{`) || !line.includes(label)) {
            continue;
        }
        const parts = line.trim().split(/\s+/);
        const value = Number(parts[parts.length - 1]);
        if (Number.isFinite(value)) {
            return value;
        }
    }
    return undefined;
}

async function sampleServerMetrics(config) {
    const headers = { accept: "text/plain" };
    const token = process.env["PRAXBIT_METRICS_TOKEN"] ?? config.token;
    if (token !== undefined && token.length > 0) {
        headers.authorization = `Bearer ${token}`;
    }
    try {
        const response = await fetch(`${config.url}/metrics`, {
            headers,
            signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
        });
        const text = await response.text();
        if (response.status !== 200) {
            return { available: false, status: response.status };
        }
        return {
            available: true,
            rssBytes: metricValue(text, "process_resident_memory_bytes"),
            heapUsedBytes: metricValue(text, "nodejs_heap_used_bytes"),
            eventLoopLagP99Seconds: labeledMetricValue(
                text,
                "nodejs_event_loop_lag_seconds",
                'quantile="0.99"',
            ),
        };
    } catch (error) {
        return {
            available: false,
            status: 0,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

function printServerSample(sample) {
    if (!sample.available) {
        console.log(
            `  Server metrics: unavailable (HTTP ${sample.status}). Set PRAXBIT_METRICS_TOKEN when /metrics is protected.`,
        );
        return;
    }
    const rssMb =
        sample.rssBytes === undefined ? "unknown" : (sample.rssBytes / 1048576).toFixed(1);
    const heapMb =
        sample.heapUsedBytes === undefined
            ? "unknown"
            : (sample.heapUsedBytes / 1048576).toFixed(1);
    const lag =
        sample.eventLoopLagP99Seconds === undefined
            ? "unknown"
            : (sample.eventLoopLagP99Seconds * 1000).toFixed(1);
    console.log(`  Server RSS: ${rssMb} MB, heap: ${heapMb} MB, event-loop p99: ${lag} ms`);
}

function syncStatuses(payload) {
    if (typeof payload !== "object" || payload === null || !Array.isArray(payload.results)) {
        return [];
    }
    return payload.results.map(function operationStatus(result) {
        if (typeof result !== "object" || result === null) {
            return "unknown";
        }
        return `${String(result.kind)}:${String(result.status)}`;
    });
}

async function postJson(config, path, body) {
    return requestOnce(config, path, { method: "POST", body });
}

async function duplicateCompletionProbe(config) {
    if (config.token === undefined || config.token.length === 0) {
        console.log("");
        console.log("Duplicate mission completion: skipped (PRAXBIT_LOAD_TOKEN is not set).");
        return;
    }
    const missionId = config.missionId;
    const missionVersion = config.missionVersion;
    console.log("");
    console.log(`Duplicate mission completion: ${missionId} v${missionVersion}`);

    const attempt = await postJson(config, "/api/v1/attempts", {
        missionId,
        missionVersion,
    });
    if (attempt.status !== 200 && attempt.status !== 201) {
        console.log(`  Attempt start failed or is unavailable: HTTP ${attempt.status}`);
        return;
    }
    const attemptId =
        typeof attempt.body === "object" && attempt.body !== null
            ? attempt.body.attemptId
            : undefined;
    if (typeof attemptId !== "string") {
        console.log("  Attempt response did not include an attemptId; probe stopped.");
        return;
    }

    const operation = {
        kind: "mission-completion",
        operationId: `load-${randomUUID()}`,
        missionId,
        missionVersion,
        attemptId,
        independent: true,
        completedAt: new Date().toISOString(),
    };
    const body = { operations: [operation] };
    const first = await postJson(config, "/api/v1/sync", body);
    const second = await postJson(config, "/api/v1/sync", body);
    console.log(`  First submission: HTTP ${first.status} ${syncStatuses(first.body).join(" ")}`);
    console.log(
        `  Retry with same operationId: HTTP ${second.status} ${syncStatuses(second.body).join(" ")}`,
    );
    console.log("  Expected: the retry is reported as duplicate, not awarded twice.");
}

async function competingWorldProbe(config) {
    if (config.token === undefined || config.token.length === 0) {
        console.log("");
        console.log("Competing world updates: skipped (PRAXBIT_LOAD_TOKEN is not set).");
        return;
    }
    console.log("");
    console.log("Competing world updates: two actions with the same expectedVersion");
    const worldResponse = await requestOnce(config, "/api/v1/worlds/campus");
    if (
        worldResponse.status !== 200 ||
        typeof worldResponse.body !== "object" ||
        worldResponse.body === null
    ) {
        console.log(`  World read failed or is unavailable: HTTP ${worldResponse.status}`);
        return;
    }
    const world = worldResponse.body.world;
    if (typeof world !== "object" || world === null || typeof world.version !== "number") {
        console.log("  World response did not include a numeric version; probe stopped.");
        return;
    }
    const body = {
        action: { id: "restart-service", systemId: "api" },
        expectedVersion: world.version,
    };
    const results = await Promise.all([
        postJson(config, "/api/v1/worlds/campus/actions", body),
        postJson(config, "/api/v1/worlds/campus/actions", body),
    ]);
    console.log(`  Version used: ${world.version}`);
    console.log(`  First action: HTTP ${results[0].status}`);
    console.log(`  Second action: HTTP ${results[1].status}`);
    const accepted = results.filter(function isAccepted(result) {
        return result.status === 200;
    }).length;
    if (accepted === 2) {
        console.log("  Both writes were accepted. Investigate version enforcement on the server.");
    } else if (accepted === 1) {
        console.log(
            "  One write was accepted and one was rejected, as expected for a version conflict.",
        );
    } else {
        console.log("  Neither write was accepted. Check authentication and the action endpoint.");
    }
}

async function runShellCommand(command, label) {
    return new Promise(function run(resolve, reject) {
        console.log(`  Running ${label}...`);
        const child = spawn(command, { shell: true, stdio: "inherit" });
        child.once("error", reject);
        child.once("exit", function exited(code) {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${label} exited with status ${String(code)}.`));
            }
        });
    });
}

async function runShellCommandWithRetries(command, label, attempts, delayMs) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await runShellCommand(command, label);
            return;
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                console.log(`  ${label} failed; retrying in ${delayMs / 1000} seconds.`);
                await sleep(delayMs);
            }
        }
    }
    throw lastError;
}

async function requestStatus(config, path, options = {}) {
    const headers = authHeaders(options.token);
    if (options.body !== undefined) {
        headers["content-type"] = "application/json";
    }
    try {
        const response = await fetch(`${config.url}${path}`, {
            method: options.method ?? "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
        });
        await response.arrayBuffer();
        return response.status;
    } catch {
        return 0;
    }
}

async function waitForReadiness(config, expectedReady, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const status = await requestStatus(config, "/readyz");
        if ((status === 200) === expectedReady) {
            return true;
        }
        await sleep(500);
    }
    return false;
}

async function runDatabaseOutageProbe(config) {
    console.log("");
    console.log("Database outage, restart, and reconnection probe");
    const stopCommand = process.env["PRAXBIT_LOAD_DB_STOP_CMD"]?.trim();
    const startCommand = process.env["PRAXBIT_LOAD_DB_START_CMD"]?.trim();
    if (
        stopCommand === undefined ||
        stopCommand.length === 0 ||
        startCommand === undefined ||
        startCommand.length === 0
    ) {
        console.log(
            "  Refused: set PRAXBIT_LOAD_DB_STOP_CMD and PRAXBIT_LOAD_DB_START_CMD to disposable-database commands.",
        );
        return false;
    }
    if (process.env["PRAXBIT_LOAD_ALLOW_DB_CONTROL"] !== "yes") {
        console.log(
            "  Refused: set PRAXBIT_LOAD_ALLOW_DB_CONTROL=yes to allow the commands to run.",
        );
        return false;
    }
    if (
        !isLoopbackOrigin(config.url) &&
        process.env["PRAXBIT_LOAD_ALLOW_REMOTE_DB_CONTROL"] !== "yes"
    ) {
        console.log(
            "  Refused: the target is not loopback. Set PRAXBIT_LOAD_ALLOW_REMOTE_DB_CONTROL=yes only for a disposable host.",
        );
        return false;
    }

    const baseline = await requestStatus(config, "/readyz");
    if (baseline !== 200) {
        console.log(`  Failed: /readyz returned HTTP ${baseline} before the probe.`);
        return false;
    }

    let stopped = false;
    let started = false;
    let passed = true;
    try {
        try {
            await runShellCommand(stopCommand, "database stop");
            stopped = true;
        } catch (error) {
            console.log(
                `  Failed to stop the database: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }

        const wentDown = await waitForReadiness(config, false, 30_000);
        console.log(`  /readyz reports not ready: ${wentDown ? "yes" : "no"}`);
        passed = passed && wentDown;

        const health = await requestStatus(config, "/healthz");
        const catalog = await requestStatus(config, "/api/v1/catalog");
        console.log(`  /healthz while the database is down: HTTP ${health}`);
        console.log(`  /api/v1/catalog while the database is down: HTTP ${catalog}`);
        passed = passed && health === 200 && catalog === 200;

        if (config.token !== undefined && config.token.length > 0) {
            const account = await requestStatus(config, "/api/v1/me", { token: config.token });
            console.log(`  /api/v1/me while the database is down: HTTP ${account}`);
            passed = passed && (account === 0 || account >= 500);
        }
    } finally {
        if (stopped) {
            try {
                await runShellCommandWithRetries(startCommand, "database start", 3, 2000);
                started = true;
            } catch (error) {
                console.log(
                    `  Failed to restart the database: ${error instanceof Error ? error.message : String(error)}`,
                );
                passed = false;
            }
        }
    }

    if (!started) {
        console.log("  Failed: the database was not restarted.");
        return false;
    }
    const recovered = await waitForReadiness(config, true, 90_000);
    console.log(`  /readyz recovered: ${recovered ? "yes" : "no"}`);
    passed = passed && recovered;
    if (config.token !== undefined && config.token.length > 0 && recovered) {
        const account = await requestStatus(config, "/api/v1/me", { token: config.token });
        const sync = await requestStatus(config, "/api/v1/sync", {
            method: "POST",
            token: config.token,
            body: { operations: [] },
        });
        console.log(`  /api/v1/me after recovery: HTTP ${account}`);
        console.log(`  /api/v1/sync after recovery: HTTP ${sync}`);
        passed = passed && account === 200 && sync === 200;
    }
    console.log(`  Result: ${passed ? "passed" : "failed"}`);
    return passed;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return 0;
    }
    const config = {
        ...options,
        token: process.env.PRAXBIT_LOAD_TOKEN,
        missionVersion: parseMissionVersion(
            process.env.PRAXBIT_LOAD_MISSION_VERSION ?? String(DEFAULTS.missionVersion),
        ),
        maxRssBytes: options.maxRssMb * 1048576,
    };

    console.log("Praxbit load test");
    console.log(`  Target: ${config.url}`);
    console.log(`  Duration per phase: ${config.durationSeconds}s`);
    console.log(`  Think time: ${config.thinkTimeMs}ms`);
    console.log(
        `  Limits: p95 ${config.maxP95Ms} ms, p99 ${config.maxP99Ms} ms, errors ${(config.maxErrorRate * 100).toFixed(2)}%, RSS ${config.maxRssMb} MB`,
    );
    if (config.token !== undefined && config.token.length > 0) {
        console.log("  Authenticated scenarios: enabled (token not printed)");
    } else {
        console.log("  Authenticated scenarios: unavailable without PRAXBIT_LOAD_TOKEN");
    }

    const discovery = await discoverScenarios(config);
    console.log(
        `  Scenarios: ${discovery.scenarios
            .map(function name(scenario) {
                return scenario.name;
            })
            .join(", ")}`,
    );
    for (const note of discovery.notes) {
        console.log(`  Note: ${note}`);
    }

    const baseline = await sampleServerMetrics(config);
    console.log("");
    console.log("Server baseline");
    printServerSample(baseline);
    let maxRssBytes = baseline.available ? (baseline.rssBytes ?? 0) : 0;

    const concurrencyLevels = options.concurrency === undefined ? [20, 40] : [options.concurrency];
    const phases = [];
    for (const concurrency of concurrencyLevels) {
        phases.push(await runPhase(config, discovery.scenarios, concurrency));
        const sample = await sampleServerMetrics(config);
        console.log("");
        console.log(`Server sample after ${concurrency} learners`);
        printServerSample(sample);
        if (sample.available && sample.rssBytes !== undefined) {
            maxRssBytes = Math.max(maxRssBytes, sample.rssBytes);
        }
    }

    if (!options.skipExtra) {
        await duplicateCompletionProbe(config);
        await competingWorldProbe(config);
    } else {
        console.log("");
        console.log("Authenticated probes skipped by --skip-extra.");
    }

    let dbProbeFailed = false;
    if (options.dbOutageProbe) {
        const passed = await runDatabaseOutageProbe(config);
        dbProbeFailed = !passed;
    }

    const failures = [];
    for (const phase of phases) {
        for (const failure of phase.failures) {
            failures.push(`${phase.concurrency} learners: ${failure}`);
        }
    }
    if (maxRssBytes > config.maxRssBytes) {
        failures.push(`RSS ${(maxRssBytes / 1048576).toFixed(1)} MB exceeds ${config.maxRssMb} MB`);
    }
    if (dbProbeFailed) {
        failures.push("database outage probe failed");
    }

    console.log("");
    if (failures.length > 0) {
        console.log("Result: FAILED");
        for (const failure of failures) {
            console.log(`  - ${failure}`);
        }
        console.log(
            "Do not treat this as a capacity guarantee. Investigate 429s, database waits, host CPU, and RSS together.",
        );
        return 1;
    }
    console.log("Result: PASSED (all configured thresholds and probes passed).");
    console.log(
        "Do not treat this as a capacity guarantee. Measure the host alongside existing services.",
    );
    return 0;
}

try {
    const exitCode = await main();
    process.exitCode = exitCode;
} catch (error) {
    console.error(`Load test error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
