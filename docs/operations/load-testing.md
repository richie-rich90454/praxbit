# Load testing

`scripts/load-test.mjs` is a dependency-free HTTP load test for a running Praxbit server. It does not fabricate results: unreachable endpoints, missing authentication, and failed probes are reported as such.

## Safety

- Do not run a load test against production without explicit operational authorization.
- Watch the existing services on the shared VPS. Stop the test if another service degrades.
- Use a dedicated load-test account and database. Do not use a real learner's token.
- Do not print or commit `PRAXBIT_LOAD_TOKEN`.
- A load test is not a penetration test. Do not use it to exhaust quotas or attack the host.

## Basic run

Start the API with PostgreSQL and the environment file, then:

```bash
pnpm test:perf --url http://127.0.0.1:8787 --duration 20
```

The default run has two sequential phases:

1. 20 concurrent learners.
2. 40 concurrent learners.

Each learner repeats a request to `/healthz`, waits 250 ms, and repeats until the phase duration ends. The report includes requests, elapsed time, throughput, error rate, p50, p95, p99, status counts, and the first few errors.

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--url` | `PRAXBIT_LOAD_URL` or `http://127.0.0.1:8787` | Server origin |
| `--path` | `PRAXBIT_LOAD_PATH` or `/healthz` | Request path |
| `--concurrency` | 20 and 40 | Run one phase with this concurrency instead |
| `--duration` | 20 | Seconds per phase |
| `--think-time` | 250 | Milliseconds between requests per learner |
| `--max-error-rate` | 0.01 | Fail the basic phase above 1% errors |
| `--skip-extra` | off | Skip authenticated probes |

Examples:

```bash
# Database readiness path: each request runs SELECT 1.
node scripts/load-test.mjs --path /readyz --concurrency 20 --duration 30

# A single 40-learner phase, no authenticated probes.
node scripts/load-test.mjs --concurrency 40 --duration 30 --skip-extra
```

## Authenticated probes

Set a bearer token for a dedicated account:

```bash
export PRAXBIT_LOAD_TOKEN="…"
node scripts/load-test.mjs --duration 20
```

The token is never printed. Obtain it through the normal native login flow with `x-praxbit-client: native`, or from your test harness. Do not put it in a repository file or shell history on a shared host.

### Duplicate mission completion

The script:

1. Starts an attempt for `PRAXBIT_LOAD_MISSION_ID` (default `before-code.make-it-respond`) at `PRAXBIT_LOAD_MISSION_VERSION` (default 1).
2. Sends a `mission-completion` sync operation.
3. Sends the exact same operation id again.

Expected result: the first is `accepted`; the retry is `duplicate`. The script prints the HTTP status and the per-operation statuses. It does not claim the server passed if the endpoint is missing or the account is unauthorized.

### Competing world updates

The script:

1. Reads `GET /api/v1/worlds/campus`.
2. Sends two `restart-service` actions with the same `expectedVersion` concurrently.

Expected result: one `200`, one `409 world_version_conflict`. If both are `200`, investigate version enforcement. If both fail, check authentication and the action endpoint. The probe changes the test account's world; use a disposable account.

### What is not automated

The script does not simulate:

- PostgreSQL going down.
- Network partitions.
- A server restart during a sync.
- Reconnection with a full outbox.
- A clock change.
- Browser rendering or Pyodide memory pressure.

Test those in a staging environment with a maintenance window and a disposable database:

1. Start the API and a test client.
2. Queue local operations.
3. Stop PostgreSQL or the API.
4. Verify `/readyz` fails and the client keeps local state.
5. Restore the database or restart the API.
6. Verify the outbox retries, conflicts are surfaced, and no duplicate reward is granted.

Do not stop a shared PostgreSQL instance on the production host. Use a separate instance or a staging host.

## Reading the report

- **Throughput** is requests per second for the chosen path. `/healthz` is a process check; it does not exercise PostgreSQL.
- **p50/p95/p99** are nearest-rank latencies for the requests that completed. They do not include requests that never started.
- **Error rate** counts network failures and HTTP statuses `>= 400`. A `401` from a missing token is an error in the basic phase; that is why the default path is public.
- **Status counts** show exactly what happened. A `404` means the path is wrong, not that the server is fast.
- **Concurrency** is the number of learners, not the number of OS threads. Node handles requests asynchronously.
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
- p50/p95 and error rate for each phase.
- Health of the other services on the host.
- Any restart, timeout, or rate limit.

## Acceptance

The product plan asks for 20 and 40 concurrent learners plus synchronization bursts, duplicate submissions, competing world updates, database downtime, reconnection, and unexpected restart. This repository provides the HTTP load test and the duplicate/world probes. It does not provide a recorded production result. Do not state that a target was met without the measurement from your host.
