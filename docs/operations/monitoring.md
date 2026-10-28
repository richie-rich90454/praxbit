# Monitoring and health

Praxbit has no Prometheus endpoint and no hosted observability integration. Monitoring is the Node process, PostgreSQL, the optional proxy, and a small set of shell or platform checks. Do not claim a metrics pipeline that does not exist.

## Health endpoints

| Endpoint | Purpose | Failure meaning |
| --- | --- | --- |
| `GET /healthz` | Process liveness | The Node process is not accepting requests |
| `GET /readyz` | Database readiness (`SELECT 1`) | The process is up but PostgreSQL is unreachable |

Both are outside `/api/v1` and require no authentication. The proxy should pass them through only on the loopback interface or an internal network; do not expose detailed infrastructure status publicly.

Use `/readyz` for deploy and proxy readiness. Use `/healthz` for a simple process watchdog. A `200` from `/healthz` does not prove the database works.

## Process checks

Use the process supervisor or platform tools:

```bash
# Linux or macOS
ps -o pid,ppid,rss,vsz,%cpu,etime,cmd -C node

# Windows PowerShell
Get-Process node | Select-Object Id, ProcessName, WorkingSet64, CPU
```

Read the process output. A process that restarts repeatedly is not healthy. The server writes structured JSON to standard output; retain it through the supervisor.

## Resource checks

```bash
free -m        # Linux
df -h          # Linux or macOS
du -sh apps/web/dist content
```

On Windows, use Task Manager or `Get-PSDrive`. On macOS, use Activity Monitor.

Budgets to compare against:

| Metric | Preferred | Investigate | Act |
| --- | --- | --- | --- |
| Hono idle RSS | 100–150 MB | 150–200 MB | above 200 MB |
| Hono active RSS | under 200 MB | 200–300 MB | above 300 MB |
| CPU | well below one core at club scale | sustained 50–80% | sustained above 80% |
| PostgreSQL connections | 2–4 from the app | more than pool size | connection leak or pool misconfiguration |
| Disk | more than 20% free | 10–20% free | below 10% free |
| Process log | bounded by supervisor | growing quickly | configure rotation |

These are starting points, not production guarantees. Record the actual values on your host.

## Database checks

```bash
psql "$DATABASE_URL" -c "SELECT count(*), state FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;"
psql "$DATABASE_URL" -c "SELECT pid, now() - query_start AS age, state, left(query, 120) FROM pg_stat_activity WHERE state <> 'idle' ORDER BY age DESC LIMIT 10;"
psql "$DATABASE_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"
psql "$DATABASE_URL" -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

- A long-running query can hold a lock or exhaust the pool. The server sets a 5-second statement/query timeout, but migrations and ad-hoc queries may not.
- Do not cancel a query unless you understand its transaction.
- `pg_stat_activity` can show query text; do not paste learner content into a public ticket.
- Check backup completion separately; a healthy database is not a backup.

## Proxy checks

- The proxy returns `502` or `504` when the API is down or slow. Check the API before changing proxy timeouts.
- Confirm `/api/*` is not cached and `Cache-Control: no-store` is present on API responses.
- Confirm static assets return long-lived cache headers and `index.html` is not cached indefinitely.
- Confirm TLS certificates renew. An expired certificate looks like a total outage to learners.
- Do not expose PostgreSQL or the Node port publicly. The API should bind `127.0.0.1`.

## Logs and alerts

The server logs structured JSON for requests and unhandled errors. A request log includes request id, method, path, status, and duration. It does not include bodies, cookies, or authorization headers.

Alert candidates:

| Signal | Threshold | Action |
| --- | --- | --- |
| `/readyz` failing | 2 consecutive checks | Check PostgreSQL, pool, disk |
| `healthz` failing | 3 consecutive checks | Check the process, log output, memory |
| API 5xx rate | above 1% for 5 minutes | Read request ids and the process log |
| p95 latency | above 1 second for 5 minutes | Check DB queries, load, host CPU |
| Memory current | above 80% of the supervisor limit | Inspect heap/RSS, restart if leaking |
| Disk free | below 10% | Clean old builds, backups, logs; do not delete the active checkout |
| Backup age | older than 26 hours | Run backup and investigate the schedule |
| AI error rate | above 20% for 10 minutes | Check provider status, quota, timeout; AI is optional |
| Login failures | sudden spike | Check rate limits and credential-stuffing patterns |

Do not page on a single failed health check. Use consecutive failures and a short window. Do not page on AI failure unless the product promise depends on it; learning must continue.

## External uptime

If the host provider or an external monitor is available, check:

- `https://praxbit.example/` every minute from outside.
- `http://127.0.0.1:8787/readyz` every five minutes from a host-local monitor.
- TLS expiry.

The public proxy examples do not forward `/healthz` or `/readyz`; keep readiness checks on loopback or an internal-only route. This repository does not provision an external monitor. Document the monitor URL and ownership before launch.

## Incident diagnostics

When something is wrong, collect in this order:

1. Check the process is running and read its last 200 log lines.
2. `/healthz` and `/readyz` with timings.
3. Resident memory, CPU, and disk.
4. PostgreSQL connectivity, pool count, long queries, and locks.
5. Proxy error log for the same time window.
6. Recent deploys, migrations, and configuration changes.
7. Existing services on the host: are they also affected?

Do not restart blindly before capturing the evidence. A restart may clear the symptom and destroy the diagnostic state.

## Capacity

Club-scale launch should be measured with [load testing](load-testing.md) at 20 and 40 concurrent learners, while watching the existing services. Do not add a second Node process or a connection pool above 4 without a measured reason and an updated resource plan.
