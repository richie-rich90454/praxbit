# Monitoring and health

Praxbit exposes a Prometheus text endpoint at `/metrics`, two health endpoints, and structured JSON logs. There is no hosted observability integration in this repository. Scrape the endpoint with your own Prometheus-compatible collector or read it during an incident.

## Endpoints

| Endpoint | Purpose | Failure meaning |
| --- | --- | --- |
| `GET /healthz` | Process liveness | The Node process is not accepting requests |
| `GET /readyz` | Database readiness (`SELECT 1`) and required web build | The process is up but cannot serve real traffic |
| `GET /metrics` | Prometheus metrics | The process is down or metrics access is blocked |

`/healthz` and `/readyz` are outside `/api/v1` and require no authentication. `/metrics` is also outside the API and has its own access rule. None of these endpoints expose database names, connection strings, user data, request bodies, cookies, or authorization headers.

Use `/readyz` for deploy and proxy readiness. Use `/healthz` for a simple process watchdog. A `200` from `/healthz` does not prove the database works.

## Metrics access

Behavior by environment:

| Environment | Access |
| --- | --- |
| `development`, `test` | Open to any caller |
| `production` | Direct loopback request with no `x-forwarded-for` or `x-real-ip`, or `Authorization: Bearer $PRAXBIT_METRICS_TOKEN`, or an admin session bearer token |

A request that arrives through the reverse proxy has a forwarded header, so it does not count as a direct loopback request even when the proxy connects from `127.0.0.1`. Unauthorized production requests receive `404` and a normal JSON error envelope, the same as an unknown route.

Recommended production setup:

1. Generate a dedicated token and store it outside the repository:

    ```bash
    openssl rand -base64 32
    ```

2. Put it in the service environment as `PRAXBIT_METRICS_TOKEN`. Do not reuse an admin session token for scraping.
3. Scrape `http://127.0.0.1:8787/metrics` from the host, or allow the token through the proxy for a private metrics collector.
4. If `/metrics` is not needed through the public proxy, block it there. The repository proxy examples forward all traffic, so add an explicit deny rule.

Caddy, before `reverse_proxy`:

```caddyfile
@metrics path /metrics
respond @metrics 404
```

Nginx, inside the server block:

```nginx
location = /metrics {
    return 404;
}
```

Verify the public rule:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://praxbit.bisz.dev/metrics
# Expected: 404
```

Host-local scrape:

```bash
curl -fsS http://127.0.0.1:8787/metrics | head -n 20
```

Authorized remote scrape, only when the proxy is intentionally configured to allow it:

```bash
curl -fsS -H "Authorization: Bearer $PRAXBIT_METRICS_TOKEN" \
  https://praxbit.bisz.dev/metrics
```

Prometheus scrape example:

```yaml
scrape_configs:
    - job_name: praxbit
      metrics_path: /metrics
      authorization:
          credentials_file: /etc/prometheus/praxbit-metrics-token
      static_configs:
          - targets: ["127.0.0.1:8787"]
```

If Prometheus runs in a container, `127.0.0.1` is the container, not the host. Use host networking, a private address, or an explicit token-protected proxy route. Do not publish `/metrics` to the internet without the token.

## Metric reference

| Metric | Type | Meaning |
| --- | --- | --- |
| `process_uptime_seconds` | gauge | Node process uptime |
| `process_resident_memory_bytes` | gauge | Resident set size (RSS) |
| `nodejs_heap_used_bytes` | gauge | V8 heap used |
| `nodejs_heap_total_bytes` | gauge | V8 heap total |
| `nodejs_external_memory_bytes` | gauge | V8 external memory |
| `nodejs_event_loop_lag_seconds{quantile="0.5"}` | gauge | Median event-loop delay since the previous scrape |
| `nodejs_event_loop_lag_seconds{quantile="0.99"}` | gauge | p99 event-loop delay since the previous scrape |
| `nodejs_event_loop_lag_max_seconds` | gauge | Maximum event-loop delay since the previous scrape |
| `praxbit_db_pool_total` | gauge | Total PostgreSQL pool clients (idle and active) |
| `praxbit_db_pool_idle` | gauge | Idle pool clients |
| `praxbit_db_pool_waiting` | gauge | Requests waiting for a pool client |
| `praxbit_db_ready` | gauge | `1` when `SELECT 1` succeeds during the scrape, `0` otherwise |
| `praxbit_ready` | gauge | `1` when the database is ready and the required web build is present |
| `praxbit_http_requests_total{method,status}` | counter | HTTP requests by method and status |
| `praxbit_http_request_duration_seconds` | histogram | Request duration in seconds by method and route |

The `route` label is the registered route template, such as `/api/v1/missions/:id`, not the raw request path. Unmatched and static requests share the `static` label. This keeps cardinality bounded and avoids recording learner identifiers.

The request counters and histogram start at zero when the process starts. A restart resets them; use `rate()` and `increase()`, not raw totals.

## Alert thresholds

Starting points for a club-scale deployment. Adjust after measuring your host.

| Signal | Threshold | For | Action |
| --- | --- | --- | --- |
| Readiness | `praxbit_ready == 0` | 2 minutes | Check the database and the required web build |
| Database readiness | `praxbit_db_ready == 0` | 2 minutes | Check PostgreSQL, pool, disk |
| API 5xx ratio | `> 1%` | 5 minutes | Read request ids and the process log |
| API p95 | `> 1 s` | 5 minutes | Check DB queries, pool waits, host CPU |
| API p99 | `> 2 s` | 5 minutes | Same, plus event-loop lag |
| Error rate | `> 5%` | 2 minutes | Treat as a user-visible incident |
| RSS | `> 300 MB` | 10 minutes | Inspect heap/RSS, restart if leaking |
| Event-loop p99 | `> 100 ms` | 5 minutes | Look for synchronous work, GC, CPU starvation |
| Pool waiting | `> 0` | 5 minutes | Slow queries or pool exhaustion |
| Disk free | `< 10%` | 5 minutes | Clean old builds, backups, logs; never the active checkout |
| Backup age | `> 26 hours` | once | Run the backup and investigate the schedule |
| AI error rate | `> 20%` | 10 minutes | Check provider status, quota, timeout; AI is optional |
| Login failures | sudden spike | 10 minutes | Check rate limits and credential-stuffing patterns |

PromQL examples:

```promql
# Readiness
praxbit_ready == 0

# Database readiness
praxbit_db_ready == 0

# 5xx ratio
sum(rate(praxbit_http_requests_total{status=~"5.."}[5m]))
  / sum(rate(praxbit_http_requests_total[5m])) > 0.01

# p95 latency
histogram_quantile(
  0.95,
  sum by (le) (rate(praxbit_http_request_duration_seconds_bucket[5m]))
) > 1

# RSS
process_resident_memory_bytes > 300 * 1024 * 1024

# Pool waits
praxbit_db_pool_waiting > 0

# Event-loop p99
nodejs_event_loop_lag_seconds{quantile="0.99"} > 0.1
```

Do not page on a single failed sample. Use consecutive failures or a short `for:` window. Do not page on AI failure unless the product promise depends on it; learning must continue.

## Process checks

Use the process supervisor or platform tools:

```bash
# Linux or macOS
ps -o pid,ppid,rss,vsz,%cpu,etime,cmd -C node

# Windows PowerShell
Get-Process node | Select-Object Id, ProcessName, WorkingSet64, CPU
```

A process that restarts repeatedly is not healthy. The server writes structured JSON to standard output; retain it through the supervisor.

## Resource checks

```bash
free -m        # Linux
df -h          # Linux or macOS
du -sh apps/web/dist content
```

On Windows, use Task Manager or `Get-PSDrive`. On macOS, use Activity Monitor.

Budget starting points:

| Metric | Preferred | Investigate | Act |
| --- | --- | --- | --- |
| Idle RSS | 100–150 MB | 150–200 MB | above 200 MB |
| Active RSS | under 200 MB | 200–300 MB | above 300 MB |
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
- Confirm `/metrics` is blocked publicly or token-protected.
- Confirm static assets return long-lived cache headers and `index.html` is not cached indefinitely.
- Confirm CSP and the application security headers reach the browser exactly once. The proxy should not add a second policy or duplicate header.
- Confirm HSTS appears only on HTTPS responses. An HTTP listener should redirect, not send HSTS.
- Confirm TLS certificates renew for both `praxbit.biszweb.club` and `praxbit.bisz.dev`. An expired certificate looks like a total outage to learners.
- Do not expose PostgreSQL or the Node port publicly. The API should bind `127.0.0.1`.

Run the deployment checks against the public proxy:

```bash
pnpm verify:hosting -- --base https://praxbit.bisz.dev
```

## Logs

The server logs structured JSON for requests, unhandled errors, pool errors, startup, and shutdown. A request log includes request id, method, path, status, and duration. It does not include bodies, cookies, or authorization headers.

Useful commands:

```bash
# Follow the supervisor log
journalctl -u praxbit -f

# Extract one request id
journalctl -u praxbit --since "1 hour ago" | grep '"requestId":"<id>"'

# Count 5xx responses in the current log file
grep '"status":5' /var/log/praxbit.log | wc -l
```

Do not log or paste tokens, cookies, database URLs, learner code, or evidence.

## External uptime

If the host provider or an external monitor is available, check:

- `https://praxbit.bisz.dev/healthz` and `https://praxbit.biszweb.club/healthz` every minute from outside.
- `http://127.0.0.1:8787/readyz` every five minutes from a host-local monitor.
- TLS expiry for both hostnames.

The proxy configurations forward `/healthz` and `/readyz` because they forward all traffic. That is intentional for external availability checks; both endpoints expose only status and uptime. If you restrict them at the proxy, keep readiness checks on loopback and update the external monitor. This repository does not provision an external monitor. Document the monitor URL and ownership before launch.

## Incident diagnostics

When something is wrong, collect in this order:

1. Check the process is running and read its last 200 log lines.
2. `/healthz` and `/readyz` with timings.
3. `/metrics`: readiness, RSS, heap, event-loop lag, pool total/idle/waiting, and 5xx counters.
4. Resident memory, CPU, and disk.
5. PostgreSQL connectivity, pool count, long queries, and locks.
6. Proxy error log for the same time window.
7. Recent deploys, migrations, and configuration changes.
8. Existing services on the host: are they also affected?

Exact diagnostics:

```bash
curl -sS -o /dev/null -w "health %{http_code} %{time_total}s\n" http://127.0.0.1:8787/healthz
curl -sS -o /dev/null -w "ready %{http_code} %{time_total}s\n" http://127.0.0.1:8787/readyz
curl -fsS http://127.0.0.1:8787/metrics | grep -E 'praxbit_db_|process_resident|event_loop_lag'
```

Do not restart blindly before capturing the evidence. A restart may clear the symptom and destroy the diagnostic state.

## Capacity

Club-scale launch should be measured with [load testing](load-testing.md) at 20 and 40 concurrent learners, while watching the existing services. Do not add a second Node process or a connection pool above 4 without a measured reason and an updated resource plan.
