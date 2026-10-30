# Load testing

`scripts/load-test.mjs` is a dependency-free HTTP load test for a running Praxbit server. It does not fabricate results: unreachable endpoints, missing authentication, unavailable metrics, and failed probes are reported as such. It exits nonzero when a configured threshold is exceeded.

## Safety

- Do not run a load test against production without explicit operational authorization.
- Watch the existing services on the shared VPS. Stop the test if another service degrades.
- Use a dedicated load-test account and database. Do not use a real learner's token.
- Do not print or commit `PRAXBIT_LOAD_TOKEN` or `PRAXBIT_METRICS_TOKEN`.
- Every simulated learner sends a synthetic `X-Forwarded-For` address so the global rate limiter sees distinct clients. This is a measurement technique, not an authorization bypass. Do not use it to evade limits against a host you do not operate.
- A load test is not a penetration test. Do not use it to exhaust quotas or attack the host.

## Default run

Start the API with PostgreSQL and the environment file, then:

```bash
pnpm test:perf --duration 20
```

The default run has two sequential phases:

1. 20 concurrent learners.
2. 40 concurrent learners.

Each learner cycles through the discovered scenarios, waits 250 ms between requests, and repeats until the phase duration ends. The report includes requests, elapsed time, throughput, error rate, p50, p95, p99, status counts, per-scenario p95, and the first errors.

Default scenarios are real endpoints, not only health checks:

| Scenario | Request | Requires |
| --- | --- | --- |
| `guest-catalog` | `GET /api/v1/catalog` | nothing |
| `guest-mission` | `GET /api/v1/missions/{id}` | nothing |
| `guest-skill` | `GET /api/v1/skills/{id}` | nothing |
| `guest-mission-page` | `GET /missions/{id}` (SPA shell) | a built web app |
| `capabilities` | `GET /api/v1/capabilities` | nothing |
| `health` | `GET /healthz` | nothing |
| `static-shell` | `GET /` | a built web app |
| `static-asset` | the first hashed `/assets/...` reference in the shell | a built web app |
| `account-me` | `GET /api/v1/me` | `PRAXBIT_LOAD_TOKEN` |
| `world-read` | `GET /api/v1/worlds/campus` | `PRAXBIT_LOAD_TOKEN` |
| `sync-empty` | `POST /api/v1/sync` with `{"operations":[]}` | `PRAXBIT_LOAD_TOKEN` |

Guest mission completion happens on the device, not on the server. The closest server load is the content read path above: catalog, mission, skill, and the mission page shell. The authenticated `sync-empty` scenario exercises the server-side sync path.

Missing scenarios are skipped with a note. The run fails before the phases if `GET /api/v1/catalog` is not `200`.

## Thresholds

Defaults:

| Threshold          | Default | Meaning                            |
| ------------------ | ------- | ---------------------------------- |
| `--max-p95-ms`     | 750     | Phase p95 limit                    |
| `--max-p99-ms`     | 1500    | Phase p99 limit                    |
| `--max-error-rate` | 0.01    | Fraction of requests that may fail |
| `--max-rss-mb`     | 300     | Maximum sampled server RSS         |

A phase fails when its request count is zero, its error rate exceeds the limit, its p95 exceeds the limit, or its p99 exceeds the limit. The run fails when any phase fails, the sampled RSS exceeds the limit, or an opt-in database probe fails.

Examples:

```bash
# Tighten the budget for a launch check.
node scripts/load-test.mjs --max-p95-ms 500 --max-p99-ms 1000 --max-error-rate 0.005 --max-rss-mb 250

# A single 40-learner phase, no authenticated probes.
node scripts/load-test.mjs --concurrency 40 --duration 30 --skip-extra
```

RSS and heap are read from `/metrics` before the phases and after each phase. The script prefers `PRAXBIT_METRICS_TOKEN`:

```bash
export PRAXBIT_METRICS_TOKEN="…"
node scripts/load-test.mjs --duration 20
```

When `/metrics` is unavailable, the report says so and the RSS limit cannot be evaluated. Set the token, or run the script on the same host so the production loopback rule applies. See [monitoring.md](monitoring.md).

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--url` | `PRAXBIT_LOAD_URL` or `http://127.0.0.1:8787` | Server origin |
| `--concurrency` | 20 and 40 | Run one phase with this concurrency instead |
| `--duration` | 20 | Seconds per phase |
| `--think-time` | 250 | Milliseconds between requests per learner |
| `--max-p95-ms` | 750 | Fail a phase above this p95 |
| `--max-p99-ms` | 1500 | Fail a phase above this p99 |
| `--max-error-rate` | 0.01 | Fail a phase above this error rate |
| `--max-rss-mb` | 300 | Fail above this sampled server RSS |
| `--mission` | `before-code.make-it-respond` | Mission used by the guest and completion probes |
| `--db-outage-probe` | off | Run the opt-in database stop/start probe |
| `--skip-extra` | off | Skip authenticated duplicate/world probes |

Environment:

| Variable                       | Meaning                                             |
| ------------------------------ | --------------------------------------------------- |
| `PRAXBIT_LOAD_TOKEN`           | Bearer token for authenticated scenarios and probes |
| `PRAXBIT_METRICS_TOKEN`        | Bearer token for `/metrics`                         |
| `PRAXBIT_LOAD_MISSION_VERSION` | Mission version, default `1`                        |

## Authenticated probes

Set a bearer token for a dedicated account:

```bash
export PRAXBIT_LOAD_TOKEN="…"
node scripts/load-test.mjs --duration 20
```

The token is never printed. Obtain it through the normal native login flow with `x-praxbit-client: native`, or from your test harness. Do not put it in a repository file or shell history on a shared host. An invalid token is skipped with a note rather than turned into a misleading capacity result.

### Duplicate mission completion

The script:

1. Starts an attempt for the configured mission.
2. Sends a `mission-completion` sync operation.
3. Sends the exact same operation id again.

Expected result: the first is `accepted`; the retry is `duplicate`. The script prints the HTTP status and per-operation statuses.

### Competing world updates

The script:

1. Reads `GET /api/v1/worlds/campus`.
2. Sends two `restart-service` actions with the same `expectedVersion` concurrently.

Expected result: one `200`, one `409 world_version_conflict`. The probe changes the test account's world; use a disposable account.

## Database outage probe

The probe stops a disposable PostgreSQL instance, verifies the API degrades and recovers, then restarts it. It is opt-in and refuses to run without explicit control flags.

Required environment:

```bash
export PRAXBIT_LOAD_ALLOW_DB_CONTROL=yes
export PRAXBIT_LOAD_DB_STOP_CMD='pg_ctl -D /srv/praxbit-drill/pgdata -m fast stop'
export PRAXBIT_LOAD_DB_START_CMD='pg_ctl -D /srv/praxbit-drill/pgdata -l /tmp/praxbit-drill.log start'
```

Run against a disposable API and database:

```bash
node scripts/load-test.mjs \
  --url http://127.0.0.1:8787 \
  --concurrency 20 \
  --duration 10 \
  --db-outage-probe \
  --skip-extra
```

Checks:

1. `/readyz` is `200` before the probe.
2. The stop command succeeds.
3. `/readyz` stops returning `200` within 30 seconds.
4. `/healthz` stays `200`; the process is alive.
5. `/api/v1/catalog` stays `200`; content is served from memory.
6. With a token, `/api/v1/me` returns a server error while the database is down.
7. The start command runs in a `finally` block so a failed probe still attempts recovery.
8. `/readyz` returns `200` within 90 seconds.
9. With a token, `/api/v1/me` and an empty sync return `200` after recovery.

The probe refuses a non-loopback target unless `PRAXBIT_LOAD_ALLOW_REMOTE_DB_CONTROL=yes` is also set. Never point the commands at the production database. The shell commands are trusted operator input; do not paste them from an untrusted source.

On Windows PowerShell:

```powershell
$env:PRAXBIT_LOAD_ALLOW_DB_CONTROL = "yes"
$env:PRAXBIT_LOAD_DB_STOP_CMD = '& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\praxbit-drill\pgdata" -m fast stop'
$env:PRAXBIT_LOAD_DB_START_CMD = '& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\praxbit-drill\pgdata" -l "C:\praxbit-drill\server.log" start'
node scripts/load-test.mjs --db-outage-probe --skip-extra --concurrency 20 --duration 10
```

## Reading the report

- **Throughput** is requests per second across all scenarios.
- **p50/p95/p99** are nearest-rank latencies for completed requests. They do not include requests that never started.
- **Error rate** counts network failures and unexpected HTTP statuses. A `429` means the rate limiter engaged; investigate whether the synthetic client addresses reached the limiter as separate clients or whether another limit applies.
- **Status counts** show exactly what happened. A `404` means the scenario path is wrong, not that the server is fast.
- **Per-scenario p95** shows whether one endpoint dominates.
- **RSS** is the server's resident memory at the sample point, not the load generator's memory.
- Run long enough to pass warm-up. A 20-second phase is a smoke test, not a capacity proof.

## Resource observation

Run these in another terminal during the test:

```bash
ps -o pid,rss,%cpu,etime,cmd -C node
psql "$DATABASE_URL" -c "SELECT count(*), state FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;"
free -m
```

On Windows, use `Get-Process node` and Task Manager in place of `ps` and `free`.

Record:

- Host CPU and memory before, during, and after.
- Praxbit cgroup memory and CPU.
- PostgreSQL connections and slow queries.
- p50/p95/p99, error rate, and RSS for each phase.
- Health of the other services on the host.
- Any restart, timeout, rate limit, or failed scenario.

## Acceptance

The product plan asks for 20 and 40 concurrent learners plus synchronization bursts, duplicate submissions, competing world updates, database downtime, reconnection, and unexpected restart. This repository provides the HTTP load test, the duplicate/world probes, and the opt-in database outage probe. It does not provide a recorded production result. Do not state that a target was met without the measurement from your host.
