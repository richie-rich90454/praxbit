# API reference

The Praxbit HTTP API is versioned under `/api/v1`. The schemas live in `packages/contracts/src/api/index.ts` and are the source of truth. The server publishes an OpenAPI 3.1 document at:

```text
GET /api/v1/openapi.json
```

The API is a JSON API. Requests with a body use `content-type: application/json`. Responses are JSON except `204 No Content`.

## Versioning and compatibility

- The base path is `/api/v1`. A breaking change requires a new path version or a documented compatibility period.
- Additive fields are allowed within v1, but clients must use the strict contract schemas and tolerate only what the schema allows. Most schemas are `strictObject`, so an unknown field is a validation error.
- The client validates responses before applying them. A server response that does not match the contract is a client error (`invalid_response`), not silently accepted data.
- The OpenAPI document is a convenience mirror. If it and `packages/contracts` disagree, the contract wins and the document must be fixed.

## Authentication

Two authentication methods are supported for the same account:

### Browser session cookie

- `POST /api/v1/auth/login` or `/register` sets `praxbit_session`.
- The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when production HTTPS is configured.
- Browser requests must use `credentials: "include"`.
- Session lifetime is 30 days. Logout revokes the current session. `DELETE /api/v1/auth/sessions` revokes all sessions.

### Native bearer token

- Send `x-praxbit-client: native` on login or registration.
- The response includes `nativeToken` in addition to the user and preferences.
- Store it in native secure storage, not `localStorage`.
- Send `authorization: Bearer <token>` on subsequent requests.
- A malformed or expired token returns `401 invalid_token`.

## CSRF

Cookie-authenticated mutations require a double-submit token:

1. `GET /api/v1/auth/csrf` sets a readable `praxbit_csrf` cookie and returns `{ "csrfToken": "…" }`.
2. Send `x-csrf-token: <token>` on every `POST`, `PUT`, `PATCH`, or `DELETE`.
3. The server compares the header and cookie in constant time.

A missing or mismatched token returns `403 csrf_invalid`. Safe methods (`GET`, `HEAD`, `OPTIONS`) do not require CSRF. Bearer-authenticated requests do not use the cookie and bypass the double-submit check. Registration and login also require CSRF because they are mutations under `/api/*`; the client obtains the token first.

## Common headers

| Header                  | Direction | Meaning                                          |
| ----------------------- | --------- | ------------------------------------------------ |
| `x-request-id`          | response  | Request identifier, also present in error bodies |
| `x-csrf-token`          | request   | Double-submit token for cookie mutations         |
| `authorization`         | request   | `Bearer <token>` for native clients              |
| `retry-after`           | response  | Seconds to wait after a rate limit               |
| `x-ratelimit-remaining` | response  | Remaining global requests in the current window  |
| `cache-control`         | response  | `no-store` for `/api/*`                          |

## Error envelope

Every API error uses:

```json
{
    "error": {
        "code": "world_version_conflict",
        "message": "This world changed on another device.",
        "details": { "currentVersion": 4 },
        "requestId": "…"
    }
}
```

- `code` is stable and machine-readable.
- `message` is safe to show to a learner after review; it is not a stack trace.
- `details` is optional JSON with structured context.
- `requestId` matches the `x-request-id` response header.

### Status codes

| Status | Meaning | Examples |
| --- | --- | --- |
| 200 | Success | Reads, sync, world action, AI hint |
| 201 | Created | Registration, attempt start, club create, report |
| 204 | No content | Logout, revoke sessions, account deletion, report resolve |
| 400 | Invalid request | `validation_error`, `invalid_json`, `mission_version_mismatch`, `attempt_mismatch` |
| 401 | Not authenticated | `unauthorized`, `invalid_token` |
| 403 | Not allowed | `csrf_invalid`, `admin_required`, `club_forbidden`, `club_required`, `invalid_invite_code`, `ai_disabled` |
| 404 | Not found | `mission_not_found`, `project_not_found`, `club_not_found`, `event_not_found` |
| 409 | Conflict | `handle_taken`, `world_version_conflict`, `project_revision_conflict` |
| 413 | Body too large | `payload_too_large` |
| 429 | Rate limited | `rate_limited`, `ai_quota_exceeded` |
| 500 | Unexpected server error | `internal_error` |
| 502 | AI upstream failure | `ai_upstream_error`, `ai_empty_response` |
| 503 | Unavailable | `ai_unavailable`, readiness failure |
| 504 | AI timeout | `ai_timeout` |

See [errors.md](errors.md) for the full code list.

## Pagination

The cursor pagination contract is used by the admin audit endpoint:

```text
?limit=20&cursor=123
```

- `limit` is an integer from 1 to 50; default 20.
- `cursor` is an opaque string from the previous page, maximum 200 characters.
- The response is `{ items, nextCursor, limit }`.
- `nextCursor` is `null` when there are no more rows.
- Cursors are not offsets. Do not construct them by hand.

Other list endpoints return bounded arrays (projects, clubs, events, catalog). They are not paginated yet. Do not assume they will remain small forever; add pagination before the data can grow without bound.

## Rate limits

These are defaults per Node.js process. They reset on restart and are not distributed.

| Scope                     | Limit                              | Response                |
| ------------------------- | ---------------------------------- | ----------------------- |
| Global per client address | 300/minute                         | `429 rate_limited`      |
| Registration              | 20/hour per address + handle       | `429 rate_limited`      |
| Login                     | 15/15 minutes per address + handle | `429 rate_limited`      |
| AI hints                  | 10/hour per user                   | `429 ai_quota_exceeded` |

`TRUST_PROXY=1` makes the server read the first `X-Forwarded-For` value. Set it only behind a trusted proxy that overwrites the header. Otherwise a client can spoof the rate-limit key.

## Health and operations

These routes are outside `/api/v1`:

| Route | Auth | Response |
| --- | --- | --- |
| `GET /healthz` | none | `{ status: "ok", uptimeSeconds }` |
| `GET /readyz` | none | `{ status: "ready" }` or `503 { status: "not_ready" }` after a database check |

`/healthz` is a process liveness check. `/readyz` checks `SELECT 1` against PostgreSQL. Use `/readyz` for a proxy or systemd readiness check; do not use either as a user-facing status widget.

## Endpoint index

- [auth](endpoints.md#auth)
- [me and account](endpoints.md#me-and-account)
- [attempts and evidence](endpoints.md#attempts-and-evidence)
- [sync](endpoints.md#sync)
- [world](endpoints.md#world)
- [projects](endpoints.md#projects)
- [clubs and events](endpoints.md#clubs-and-events)
- [AI](endpoints.md#ai)
- [catalog](endpoints.md#catalog)
- [admin](endpoints.md#admin)

## Client guidance

- Obtain a CSRF token before the first cookie-authenticated mutation.
- Treat `409` as a normal conflict, not a crash. Refresh the world or project and show the server version.
- Treat `duplicate` sync results as success; the operation already took effect.
- Do not retry a `rejected` sync operation blindly. Read the code and fix the cause.
- Do not send the whole project to the AI endpoint. The contract caps the question and code sizes.
- Never log the `authorization` header, the session cookie, or the CSRF token.
