#!/usr/bin/env node
// Dependency-free load test for a running Praxbit server.
// Default: two phases, 20 and 40 concurrent learners, against /healthz.
// Authenticated duplicate-completion and competing-world probes run only when
// PRAXBIT_LOAD_TOKEN is set. Missing prerequisites are reported as skipped.

import { randomUUID } from "node:crypto";

const DEFAULTS = {
    url: process.env.PRAXBIT_LOAD_URL ?? "http://127.0.0.1:8787",
    path: process.env.PRAXBIT_LOAD_PATH ?? "/healthz",
    durationSeconds: 20,
    thinkTimeMs: 250,
    maxErrorRate: 0.01,
    requestTimeoutMs: 10_000,
};

function printHelp() {
    console.log(`Usage: node scripts/load-test.mjs [options]

Options:
  --url <origin>              Server origin (default ${DEFAULTS.url})
  --path <path>               Request path (default ${DEFAULTS.path})
  --concurrency <n>           Run one phase with n learners instead of 20 and 40
  --duration <seconds>        Duration of each phase (default ${DEFAULTS.durationSeconds})
  --think-time <ms>           Pause between requests per learner (default ${DEFAULTS.thinkTimeMs})
  --max-error-rate <ratio>    Fail when the basic phase error rate exceeds this (default ${DEFAULTS.maxErrorRate})
  --skip-extra                Skip authenticated duplicate/world probes
  --help                      Show this help

Environment:
  PRAXBIT_LOAD_TOKEN          Bearer token for authenticated probes; never printed
  PRAXBIT_LOAD_MISSION_ID     Mission used by the duplicate-completion probe
  PRAXBIT_LOAD_MISSION_VERSION Mission version (default 1)

The test does not fabricate results. Endpoints that are absent or unauthorized
are reported by status code.
`);
}

function parseArguments(argv) {
    const options = {
        url: DEFAULTS.url,
        path: DEFAULTS.path,
        concurrency: undefined,
        durationSeconds: DEFAULTS.durationSeconds,
        thinkTimeMs: DEFAULTS.thinkTimeMs,
        maxErrorRate: DEFAULTS.maxErrorRate,
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
        const value = argv[index + 1];
        if (value === undefined) {
            throw new Error(`Option ${argument} requires a value.`);
        }
        if (argument === "--url") {
            options.url = value;
        } else if (argument === "--path") {
            options.path = value;
        } else if (argument === "--concurrency") {
            options.concurrency = parseInteger(value, "--concurrency", 1, 500);
        } else if (argument === "--duration") {
            options.durationSeconds = parseInteger(value, "--duration", 1, 600);
        } else if (argument === "--think-time") {
            options.thinkTimeMs = parseInteger(value, "--think-time", 0, 60_000);
        } else if (argument === "--max-error-rate") {
            options.maxErrorRate = parseRatio(value);
        } else {
            throw new Error(`Unknown option: ${argument}`);
        }
        index += 2;
    }
    if (!options.url.startsWith("http://") && !options.url.startsWith("https://")) {
        throw new Error("--url must be an absolute http or https origin.");
    }
    if (!options.path.startsWith("/")) {
        throw new Error("--path must begin with /.");
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

function parseRatio(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error("--max-error-rate must be between 0 and 1.");
    }
    return parsed;
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

function authHeaders(token) {
    const headers = { accept: "application/json" };
    if (token !== undefined && token.length > 0) {
        headers.authorization = `Bearer ${token}`;
    }
    return headers;
}

async function basicRequest(config, metrics) {
    const started = performance.now();
    let status = 0;
    try {
        const response = await fetch(`${config.url}${config.path}`, {
            method: "GET",
            headers: authHeaders(config.token),
            signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
        });
        status = response.status;
        await response.arrayBuffer();
        if (!response.ok) {
            metrics.errors.push(`HTTP ${response.status}`);
        }
    } catch (error) {
        metrics.errors.push(error instanceof Error ? error.message : String(error));
    }
    const elapsed = performance.now() - started;
    metrics.latencies.push(elapsed);
    metrics.statuses.set(status, (metrics.statuses.get(status) ?? 0) + 1);
    if (status === 0 || status >= 400) {
        metrics.failures += 1;
    }
    metrics.total += 1;
}

async function learnerWorker(config, metrics, deadline) {
    while (performance.now() < deadline) {
        await basicRequest(config, metrics);
        if (config.thinkTimeMs > 0) {
            await sleep(config.thinkTimeMs);
        }
    }
}

async function runPhase(config, concurrency) {
    const metrics = {
        latencies: [],
        statuses: new Map(),
        errors: [],
        failures: 0,
        total: 0,
    };
    const started = performance.now();
    const deadline = started + config.durationSeconds * 1000;
    const workers = [];
    for (let index = 0; index < concurrency; index += 1) {
        workers.push(learnerWorker(config, metrics, deadline));
    }
    await Promise.all(workers);
    const elapsedSeconds = (performance.now() - started) / 1000;
    const sorted = [...metrics.latencies].sort(function ascending(left, right) {
        return left - right;
    });
    const errorRate = metrics.total === 0 ? 1 : metrics.failures / metrics.total;

    console.log("");
    console.log(`Phase: ${concurrency} concurrent learners, ${config.path}`);
    console.log(`  Requests: ${metrics.total}`);
    console.log(`  Elapsed: ${elapsedSeconds.toFixed(2)} s`);
    console.log(`  Throughput: ${(metrics.total / elapsedSeconds).toFixed(1)} req/s`);
    console.log(`  Error rate: ${(errorRate * 100).toFixed(2)}%`);
    console.log(`  p50: ${percentile(sorted, 0.5).toFixed(1)} ms`);
    console.log(`  p95: ${percentile(sorted, 0.95).toFixed(1)} ms`);
    console.log(`  p99: ${percentile(sorted, 0.99).toFixed(1)} ms`);
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
        for (const message of metrics.errors.slice(0, 5)) {
            console.log(`    ${message}`);
        }
    }

    return {
        concurrency,
        total: metrics.total,
        errorRate,
        failed: metrics.total === 0 || errorRate > config.maxErrorRate,
    };
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (text.length === 0) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return { unparsed: text.slice(0, 300) };
    }
}

async function postJson(url, token, body) {
    const headers = authHeaders(token);
    headers["content-type"] = "application/json";
    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
    });
    const payload = await readJsonResponse(response);
    return { status: response.status, payload };
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

async function duplicateCompletionProbe(config) {
    if (config.token === undefined || config.token.length === 0) {
        console.log("");
        console.log("Duplicate mission completion: skipped (PRAXBIT_LOAD_TOKEN is not set).");
        return;
    }
    const missionId = process.env.PRAXBIT_LOAD_MISSION_ID ?? "before-code.make-it-respond";
    const missionVersion = Number.parseInt(process.env.PRAXBIT_LOAD_MISSION_VERSION ?? "1", 10);
    console.log("");
    console.log(`Duplicate mission completion: ${missionId} v${missionVersion}`);

    const attempt = await postJson(`${config.url}/api/v1/attempts`, config.token, {
        missionId,
        missionVersion,
    });
    if (attempt.status !== 200 || typeof attempt.payload !== "object" || attempt.payload === null) {
        console.log(`  Attempt start failed or is unavailable: HTTP ${attempt.status}`);
        console.log(`  Payload: ${JSON.stringify(attempt.payload).slice(0, 300)}`);
        return;
    }
    const attemptId = attempt.payload.attemptId;
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
    const first = await postJson(`${config.url}/api/v1/sync`, config.token, body);
    const second = await postJson(`${config.url}/api/v1/sync`, config.token, body);
    console.log(
        `  First submission: HTTP ${first.status} ${syncStatuses(first.payload).join(" ")}`,
    );
    console.log(
        `  Retry with same operationId: HTTP ${second.status} ${syncStatuses(second.payload).join(" ")}`,
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
    const worldResponse = await fetch(`${config.url}/api/v1/worlds/campus`, {
        headers: authHeaders(config.token),
        signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
    });
    const worldPayload = await readJsonResponse(worldResponse);
    if (worldResponse.status !== 200 || typeof worldPayload !== "object" || worldPayload === null) {
        console.log(`  World read failed or is unavailable: HTTP ${worldResponse.status}`);
        return;
    }
    const world = worldPayload.world;
    if (typeof world !== "object" || world === null || typeof world.version !== "number") {
        console.log("  World response did not include a numeric version; probe stopped.");
        return;
    }
    const body = {
        action: { id: "restart-service", systemId: "api" },
        expectedVersion: world.version,
    };
    const results = await Promise.all([
        postJson(`${config.url}/api/v1/worlds/campus/actions`, config.token, body),
        postJson(`${config.url}/api/v1/worlds/campus/actions`, config.token, body),
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

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return 0;
    }
    const config = {
        ...options,
        token: process.env.PRAXBIT_LOAD_TOKEN,
    };

    console.log("Praxbit load test");
    console.log(`  Target: ${config.url}${config.path}`);
    console.log(`  Duration per phase: ${config.durationSeconds}s`);
    console.log(`  Think time: ${config.thinkTimeMs}ms`);
    if (config.token !== undefined && config.token.length > 0) {
        console.log("  Authenticated probes: enabled (token not printed)");
    } else {
        console.log("  Authenticated probes: unavailable without PRAXBIT_LOAD_TOKEN");
    }

    const concurrencyLevels = options.concurrency === undefined ? [20, 40] : [options.concurrency];
    const phases = [];
    for (const concurrency of concurrencyLevels) {
        phases.push(await runPhase(config, concurrency));
    }

    if (!options.skipExtra) {
        await duplicateCompletionProbe(config);
        await competingWorldProbe(config);
    } else {
        console.log("");
        console.log("Authenticated probes skipped by --skip-extra.");
    }

    const failed = phases.some(function phaseFailed(phase) {
        return phase.failed;
    });
    console.log("");
    console.log(
        failed
            ? "Result: FAILED (basic load phase exceeded the error budget)."
            : "Result: basic load phases within the error budget.",
    );
    console.log(
        "Do not treat this as a capacity guarantee. Measure the host alongside existing services.",
    );
    return failed ? 1 : 0;
}

try {
    const exitCode = await main();
    process.exitCode = exitCode;
} catch (error) {
    console.error(`Load test error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
