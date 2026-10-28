# Error codes

Every error uses the envelope in [README.md](README.md#error-envelope). Codes are stable; messages may be improved.

## Request and auth

| Code | Status | Meaning | What the client should do |
| --- | --- | --- | --- |
| `validation_error` | 400 | Body, query, or path failed schema validation | Show field issues from `details.issues`; do not retry unchanged |
| `invalid_json` | 400 | Body is not valid JSON | Fix the request |
| `not_found` | 404 | No route matches | Check the path and version |
| `unauthorized` | 401 | No session | Sign in or continue as guest |
| `invalid_token` | 401 | Bearer token is malformed, expired, or revoked | Clear the token and sign in again |
| `csrf_invalid` | 403 | CSRF cookie/header missing or mismatched | Fetch `/auth/csrf` and retry once |
| `payload_too_large` | 413 | Body exceeds `BODY_LIMIT_BYTES` | Reduce the body; do not retry unchanged |
| `rate_limited` | 429 | Global, login, or registration limit | Honor `retry-after` |
| `admin_required` | 403 | Account is not an admin | Do not show admin controls |
| `internal_error` | 500 | Unexpected server failure | Report the request id; retry only if safe |
| `user_not_found` | 404 | Account disappeared or does not exist | Clear local auth state |

## Learning

| Code | Status | Meaning |
| --- | --- | --- |
| `mission_not_found` | 404 | Unknown mission id |
| `step_not_found` | 404 | Unknown step id in an AI hint request |
| `unknown_mission` | 404 | Evidence or completion references an unknown mission/project |
| `mission_version_mismatch` | 400 | Client used an outdated mission version; refresh content |
| `attempt_not_found` | 404 | Attempt does not exist or belongs to another user |
| `attempt_mismatch` | 400 | Evidence `attemptId` does not match the path |
| `invalid_completion_time` | 400 | Completion time is more than five minutes in the future |
| `already_completed` | inside 200 sync result | Mission already completed for this version; no new XP |

`already_completed` is a `duplicate` sync result, not an HTTP error.

## Sync conflicts

| Code | Sync status | Meaning |
| --- | --- | --- |
| `world_version_conflict` | `conflict` | World changed on another device; refresh and reapply deliberately |
| `project_revision_conflict` | `conflict` | Project changed on another device; keep the local draft and show the server revision |
| Other `AppError` codes | `rejected` | Operation is invalid; fix the cause before retrying |

A sync HTTP response is `200` when the batch was processed, even if individual operations conflict or are rejected. Inspect `results`.

## World and projects

| Code                        | Status | Meaning                                                   |
| --------------------------- | ------ | --------------------------------------------------------- |
| `world_not_found`           | 404    | Only the `campus` world exists                            |
| `project_not_found`         | 404    | Unknown project id                                        |
| `project_revision_conflict` | 409    | `baseRevision` does not match `details.currentRevision`   |
| `world_version_conflict`    | 409    | `expectedVersion` does not match `details.currentVersion` |

## Clubs and events

| Code                    | Status | Meaning                                                |
| ----------------------- | ------ | ------------------------------------------------------ |
| `club_not_found`        | 404    | Unknown club or invite code                            |
| `club_forbidden`        | 403    | Not a member and not an admin                          |
| `club_required`         | 403    | Event submission requires at least one club membership |
| `invalid_invite_code`   | 403    | Code does not belong to the specified club             |
| `event_not_found`       | 404    | Unknown weekly event                                   |
| `report_not_found`      | 404    | Report is not open or does not exist                   |
| `invite_code_exhausted` | 503    | Could not allocate a unique code after retries         |

## AI

| Code                | Status | Meaning                                                    |
| ------------------- | ------ | ---------------------------------------------------------- |
| `ai_unavailable`    | 503    | Provider is not configured on this server                  |
| `ai_disabled`       | 403    | Learner has not enabled AI tutoring                        |
| `ai_quota_exceeded` | 429    | Hourly per-user limit reached; `details.retryAfterSeconds` |
| `ai_upstream_error` | 502    | Provider rejected or returned an unreadable response       |
| `ai_empty_response` | 502    | Provider returned no text                                  |
| `ai_timeout`        | 504    | Provider did not answer before the configured timeout      |

## Handling rules

- Do not display a raw `message` from an unexpected `500`; show a short apology and the request id.
- Do not retry `400`, `403`, `404`, `409`, or `413` unchanged. Retry `429` after the indicated delay. Retry `500` only for idempotent reads.
- A `401` during sync must not discard the outbox. Keep local work and prompt sign-in.
- A `409` is a user-visible state change, not a crash. Refresh and explain.
- Log the request id, status, and code. Do not log the request body, tokens, or learner code.
