# Incident response

This runbook is for the operator of a deployed Praxbit instance. It assumes the topology in [deployment.md](deployment.md). It does not replace the hosting provider's incident process.

## First five minutes

1. **Assess impact.** Is the site down, slow, returning errors, exposing data, or only failing an optional feature?
2. **Check the obvious.** Process status, `/healthz`, `/readyz`, disk, memory, and the proxy.
3. **Preserve evidence.** Capture the process log window, request ids, proxy errors, and resource graphs before restarting.
4. **Stop the bleeding.** Roll back a bad release, revoke a compromised session, or disable AI. Do not make multiple unrelated changes at once.
5. **Communicate.** Tell the operator or team what is known, what is not known, and when the next update will be. Do not speculate publicly.

## Severity

| Severity | Examples | Response |
| --- | --- | --- |
| Critical | Site down, database lost, confirmed data exposure, auth bypass | Immediate, all hands, rollback or disable |
| High | Login broken, sync corrupts progress, disk nearly full, repeated crashes | Immediate investigation, customer-visible |
| Medium | One feature broken, AI unavailable, slow non-critical page | Fix during the working day |
| Low | Cosmetic regression, one mission content error | Normal backlog |

## Service is down

1. Confirm the Node process is running and read its recent log lines.
2. `curl -i http://127.0.0.1:8787/healthz` and `/readyz`.
3. Check memory, CPU, and disk. A full disk or OOM kill is common.
4. Check the proxy: is it returning its own `502`, or is the request reaching the API?
5. If the last deploy is the likely cause, check out the previous revision, rebuild, and restart.
6. If the database is unreachable, fix connectivity before restarting the API repeatedly.
7. Verify `/readyz`, the web page, login, and sync after recovery.

Do not delete the active checkout or the database to "start clean".

## Database unavailable

1. Confirm from the host: `psql "$DATABASE_URL" -c "SELECT 1"`.
2. Check PostgreSQL service status, disk, connections, and logs. If it is a shared or external database, involve its owner.
3. `/readyz` returns `503`; `/healthz` may still return `200`. That is expected.
4. The API should return structured `500` errors, not crash. Do not restart it repeatedly while the database is down.
5. After recovery, verify sync idempotency and that the outbox drains without duplicate rewards.
6. If data is lost, follow [backups.md](backups.md) and obtain explicit authorization before restoring over production.

## High memory or CPU

1. Capture resident memory, CPU, and the process start time from the platform tools.
2. Check for a traffic spike, a load test, a runaway query, or a release regression.
3. If the process is near its memory limit and restarting is safe, restart the single process. Preserve the log first.
4. If the host is under pressure and other services are affected, stop Praxbit rather than letting the kernel OOM-kill unrelated services.
5. Do not raise a supervisor memory limit without checking free memory and the other workloads.
6. If a query is the cause, inspect `pg_stat_activity` and locks. Do not cancel a query unless you understand its transaction.

## Disk full

1. `df -h`, plus the backup and log directories for the host.
2. Remove old builds only outside the retention window and never the active checkout.
3. Rotate or reduce logs according to the process supervisor's retention policy.
4. Do not delete the newest backup. Copy it off-box first if space allows.
5. Investigate the growth: logs, builds, database WAL, or a backup loop.

## Suspected account compromise

1. Revoke the account's sessions: `DELETE /api/v1/auth/sessions` from an authenticated admin session, or a targeted database update.
2. If the password may be known, disable the account or reset the credential through an authorized procedure.
3. Review audit events and request ids for the account. Do not expose learner content in a public ticket.
4. Check for club ownership changes, reports, and unusual event submissions.
5. Notify the account owner through a verified channel. There is no email system in the current product; use the operator's support process.

## Secret exposure

1. Rotate the exposed credential immediately. See [secrets.md](secrets.md).
2. Revoke sessions if a session token or database credential was exposed.
3. Check logs and provider dashboards for use of the old credential.
4. Preserve evidence before rotating logs.
5. Do not paste the secret into the incident record.

## Data exposure or loss

1. Contain: revoke access, disable the affected endpoint, or take the service down if necessary.
2. Preserve logs and database snapshots. Do not overwrite the evidence.
3. Determine the data categories, time window, and affected accounts.
4. Follow the applicable legal and contractual notification requirements. This repository does not provide legal advice.
5. Restore from a verified backup only after authorization; verify with a scratch database first when possible.
6. Write a post-incident report with the timeline, cause, impact, and preventive actions.

## Bad release

1. Stop further deploys.
2. Use the automatic rollback or switch the symlink to the previous release.
3. Restart only `praxbit`.
4. Verify `/readyz` and the login/sync path.
5. If a migration is incompatible with the previous code, do not roll back blindly. Roll forward with a fix or restore the pre-migration backup.
6. Record the release id, commit, migration, and failure mode.

## AI provider incident

1. AI is optional. If the provider is down, the rest of the product must keep working.
2. Check `/api/v1/ai/hints` behavior: `502`, `504`, or quota `429`.
3. If cost or abuse is a concern, unset `AI_*` in the environment and restart. The endpoint returns `503 ai_unavailable`.
4. Do not log prompts or learner code while investigating.
5. Notify the operator; do not page on AI alone unless the product promise depends on it.

## Abuse or denial of service

1. Check the global rate limit and proxy logs.
2. If a single address or account is responsible, block it at the proxy or revoke its sessions.
3. Do not add a broad IP block that affects a school or shared network without evidence.
4. If the host is saturated, protect the other services first. Stop Praxbit if necessary.
5. Preserve a bounded log sample; do not export learner data.

## Post-incident

Write a short report:

- What happened, in plain language.
- When it started and when it was detected.
- Who was affected and what data or functionality was involved.
- The root cause, if known, and the contributing conditions.
- What stopped it.
- What will prevent recurrence, with an owner and a date.
- What remains uncertain.

Do not mark an incident resolved because the site is back up. Verify the data, the security boundary, and the user-facing promise.
