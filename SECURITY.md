# Security

Praxbit handles learner accounts, progress, club membership, and untrusted learner code. The security model assumes the browser is hostile, learner code is hostile, and the network is not trusted. It does not assume the production host is isolated from other services; it is not.

## Trust boundaries

```text
Learner browser
  ├── application code (trusted, but exposed)
  ├── learner code in a worker or sandboxed iframe (untrusted)
  └── local IndexedDB / Cache Storage (user-controlled)

        HTTPS / reverse proxy
                 |
        Hono API (trusted server boundary)
          ├── PostgreSQL (trusted, private)
          ├── content files (trusted after validation)
          └── optional AI provider (external, receives bounded context)

Local companion
  └── user's machine and installed toolchains (user-controlled; no remote attestation)
```

- **Browser:** all input is untrusted. The client may be modified, replayed, or automated. Client-side checks are for feedback, not authorization.
- **API:** authenticates the session, authorizes the resource, validates the body and query, enforces limits, and owns durable state. Never trust a client-supplied user id, role, score, mastery value, completion time, or world version without checking it.
- **PostgreSQL:** reachable only from the API host or a private network. The application role owns only the Praxbit database. Do not expose port 5432 publicly.
- **Content:** authored JSON is trusted only after schema and graph validation. It must not contain executable code, HTML injection, solution leakage, or unsafe paths.
- **AI provider:** external. It receives only the bounded hint context described below. It is not an authorization boundary and its output is not authoritative.
- **Companion:** runs on the learner's machine. It can execute local project code only after consent. It cannot prove what happened and must never be treated as a ranked-competition attestation.

## Guest mode

Guest play is the default privacy-preserving path.

- Guest progress, world state, drafts, projects, attempts, completions, preferences, and the sync outbox are stored in IndexedDB on the device. No account is required.
- Guest data is not sent to the server until the learner signs in and the outbox is flushed. Local state is authoritative for the guest session and is not a verified record.
- Clearing site data deletes guest progress. The UI must say this before destructive clearing.
- A guest can read cached lessons offline. Writes queue locally and sync when an account is available.
- Guest mode must not collect a real name, email, precise location, school, or public profile. The app does not ask for them.

## Accounts, sessions, and CSRF

The following describes the implemented service and middleware design. The HTTP routes are implemented, and the integration/security suites pass against a temporary PostgreSQL cluster on this working copy. Real proxy behavior and a production deployment remain unverified.

### Passwords

- Registration requires 10–200 characters; login accepts 1–200 and compares against the stored hash.
- Passwords are hashed with Node `scrypt`: N=16384, r=8, p=1, 64-byte key, 16-byte random salt, `maxmem` 64 MiB. The stored format is `scrypt$N$r$p$salt$key`.
- Verification uses `timingSafeEqual`. A missing account still performs a scrypt hash to reduce the timing difference between “unknown handle” and “wrong password”.
- There is no password reset, email verification, OAuth, or account recovery channel. Do not claim those features.

### Sessions

- Session tokens are 32 random bytes encoded as base64url. Only a SHA-256 hash is stored in `auth_sessions`; the raw token is returned once.
- Sessions expire after 30 days. Logout revokes one session. “Sign out everywhere” revokes all sessions for the user.
- The browser cookie is `praxbit_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `COOKIE_SECURE=1` or `NODE_ENV=production`, 30-day max age.
- Native clients may request a bearer token by sending `x-praxbit-client: native` on login or registration. The raw token is returned in the response and must be stored in native secure storage. Do not put it in `localStorage` or a web-accessible bundle.
- Bearer authentication is accepted from the `Authorization: Bearer …` header. A malformed or expired token is a `401 invalid_token`.
- Authorization is checked per resource: attempts belong to the user, worlds belong to the user, projects belong to the user, club details require membership or an admin role, and admin routes require `role = admin`.

### CSRF

- Cookie-authenticated mutations use a double-submit token. `GET /api/v1/auth/csrf` sets a readable `praxbit_csrf` cookie and returns the same token.
- The client sends `x-csrf-token` on every mutation. The server compares it to the cookie in constant time. Missing or mismatched tokens return `403 csrf_invalid`.
- Safe methods (`GET`, `HEAD`, `OPTIONS`) do not require CSRF. Bearer-authenticated requests are not cookie-authenticated and therefore bypass the double-submit check.
- `SameSite=Lax` is a second layer, not a substitute for the token check.
- The current middleware does not explicitly validate the `Origin` header. If the app is served from multiple origins, add an origin allowlist at the proxy or in middleware and test it.

### Rate limits

Default in-process limits:

| Scope                     | Limit                              |
| ------------------------- | ---------------------------------- |
| Global per client address | 300 requests/minute                |
| Registration              | 20/hour per address + handle       |
| Login                     | 15/15 minutes per address + handle |
| AI hints                  | 10/hour per user                   |

These limits are per Node.js process and reset on restart. They are not a distributed quota. If more than one API process is introduced, move the counters to a shared store or enforce them at the proxy. `TRUST_PROXY=1` must only be set when a trusted proxy overwrites `X-Forwarded-For`; otherwise a client can spoof the address used for rate limiting.

### Account data

- Display name defaults to the handle. Handles are 3–24 lowercase letters, numbers, or underscores.
- No email address, real name, phone number, birth date, precise location, or school is collected by the account schema.
- The audit log records actions such as registration, login, deletion, and club changes with a request id. It does not store passwords or session tokens.
- Account deletion deletes the user row and cascades to identities, sessions, preferences, progress, evidence, completions, worlds, projects, and membership rows. An audit entry is retained with no actor or target id. Verify the cascade against your migration before claiming complete erasure.

### Verification status

Verified locally: password hashing, token generation/hash comparison, session middleware, CSRF middleware, rate limiter, role checks, and the server integration suite (23 tests across auth, sync, clubs, and catalog). Pending: proxy cookie behavior, CSRF on every mutation route under the real proxy, club/admin authorization at scale, and account deletion cascade under the production database. The integration and security suites remain the gate.

## Untrusted learner code

Praxbit does not execute learner code on the production server. The Node process never imports learner source, never runs `eval`, and never treats `node:vm` as a sandbox.

### JavaScript worker

- Learner JavaScript runs in a dedicated Web Worker created from `javascript.worker.ts`, with a short timeout (default 4 seconds) and an output cap (default 20 KB). The worker is terminated on completion, timeout, or abort.
- The worker overwrites `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, and `navigator.sendBeacon` with throwing functions. This is best-effort blocking.
- A same-origin worker is not a security boundary. It can still reach browser APIs that are not explicitly blocked, including same-origin storage and potentially other worker capabilities. Do not place authentication tokens or long-lived secrets in web-accessible storage. The browser session cookie is `HttpOnly`; the CSRF token is readable by design.
- Do not present the worker as a hardened sandbox or as proof that learner code is safe.

### HTML and CSS preview

- Preview documents render in an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`. This gives the frame an opaque origin and blocks same-origin DOM access, cookies for the app origin, forms, popups, and top-level navigation.
- The harness runs inside the frame to check DOM structure and computed styles. A frame that times out is reported as a failure, not a pass.
- Do not add `allow-same-origin` to this iframe. Doing so would let learner markup escape the intended isolation.

### Python, SQL, and Git

- Python runs through Pyodide WebAssembly in a worker. The outer runner terminates the worker on timeout (default 30 seconds). The current worker does not block Python-level network helpers; rely on the browser origin policy and do not expose secrets to the page. If Python network access becomes a requirement, add an explicit block and test it.
- SQL runs in SQLite compiled to WebAssembly (`sql.js`). It is not connected to PostgreSQL. Do not describe SQLite behavior as PostgreSQL behavior.
- Git runs against an in-browser repository with `isomorphic-git`. Commits and merges are real within that repository. A remote URL supplied by content is not fetched automatically; do not add one without a network policy.
- The deterministic Linux terminal is a simulator. It does not run real processes, touch the host filesystem, or prove Linux competence. Label it as simulated.

### Remote execution

There is no remote learner-code runner. A future runner must be separate infrastructure with enforced CPU, memory, filesystem, network, and time limits, and must not be deployed on the shared 2 vCPU / 2 GB VPS. Do not enable arbitrary remote execution as a shortcut.

## AI gateway

- Provider keys live only in server environment variables: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and optional `AI_TIMEOUT_MS`. They are never sent to the browser, included in a bundle, or logged.
- AI is disabled unless all three required variables are set. The endpoint returns `503 ai_unavailable` when it is off.
- The learner must enable AI tutoring in preferences. If disabled, the endpoint returns `403 ai_disabled`.
- The gateway sends a bounded context: mission title, step title, step prompt, an optional learner code snippet, and the learner question. It does not send the whole project, account data, other learners' data, or the full mission history.
- The request uses `temperature: 0.2`, `max_tokens: 500`, a server-side timeout (default 12 seconds), and a per-user hourly quota. Output is truncated to 4,000 characters including a privacy notice.
- Provider failures are mapped to `502 ai_upstream_error` or `504 ai_timeout`; the provider body is not reflected to the learner.
- The AI is not the authoritative grader. It may explain or hint. Deterministic evaluators, tests, simulation invariants, and rubrics decide correctness and mastery.
- Do not log prompts, learner code, or model output by default. If you add diagnostics, redact content and record only metadata, latency, and token counts.
- `AI_BASE_URL` is trusted configuration, not user input. Do not allow a learner or club owner to set it.

## Privacy

Data minimization is a product requirement.

| Data | Where | Why |
| --- | --- | --- |
| Handle, display name, password hash | PostgreSQL | Account identity |
| Preferences | PostgreSQL and local IndexedDB | Accessibility, interests, AI consent |
| Progress, mastery, reviews, evidence, completions | PostgreSQL and local IndexedDB | Learning continuity |
| World state | PostgreSQL and local IndexedDB | Persistent campus |
| Project files and revisions | PostgreSQL and local IndexedDB | Authenticated project work |
| Club membership, submissions, leaderboard | PostgreSQL | Invitation-based social features |
| Audit entries | PostgreSQL | Security and operational accountability |
| AI hint context | Transient request to provider | Optional tutoring |

- No email, real name, phone, precise location, school name, or public profile is required.
- Guest mode keeps learning data on the device.
- Export is available to an authenticated user through `POST /api/v1/me/export`, returning a JSON bundle of the account, preferences, progress, mastery, reviews, evidence, completions, worlds, and achievements.
- Deletion is available through `DELETE /api/v1/me`. It removes the account and cascading rows. Local device data must also be cleared by the learner; the server cannot delete IndexedDB on the device.
- Request logs include method, path, status, duration, and request id. Proxy access logs may include IP addresses. Configure retention at the proxy and journal; do not keep logs indefinitely.
- There is no automated server-side retention job for evidence, completions, or audit rows. Define a retention policy before a large public launch.
- Do not add analytics, advertising pixels, session recording, or third-party tracking without an explicit privacy review and consent design.

## Children and student privacy

Praxbit may be used by younger learners. The current account system is handle-only and avoids unnecessary personal information, but it has no age gate, parental consent flow, email verification, or school data-processing agreement.

- Do not launch account creation for children below the applicable age of digital consent without the required parental consent and legal review.
- Keep affected learners in anonymous guest mode. Guest mode is the safe default: progress stays on the device and no account data is sent.
- Do not collect school names, class rosters, real names, or precise locations.
- Do not add public profiles, unrestricted chat, direct messaging, or user-uploaded images without moderation, reporting, and a child-safety review.
- A privacy policy alone does not establish compliance. Do not claim COPPA, GDPR-K, FERPA, or equivalent compliance unless the operational and legal controls actually exist.

## Reporting a vulnerability

Do not open a public issue containing exploit details or learner data.

- Use the repository host's private security advisory feature if it is enabled.
- If no private channel is configured, contact the operator through the private operational channel documented for the deployment. The repository does not contain a monitored security email address; add one before public launch.
- Include the affected version/commit, a minimal reproduction, the impact, and whether learner data or production infrastructure is involved.
- Expect acknowledgment, triage, a fix plan, and coordinated disclosure. Do not test against production accounts or data you do not own.
- For a live incident, follow [docs/operations/incident-response.md](docs/operations/incident-response.md): contain, revoke sessions, rotate secrets, preserve logs, notify the operator, and document the timeline.

## Security review checklist

- [ ] Every protected route calls the session middleware and checks resource ownership.
- [ ] Every mutation validates its body with a schema and checks CSRF for cookie auth.
- [ ] SQL uses parameters, never string interpolation.
- [ ] Rendered learner or content text is escaped; no unsanitized `innerHTML`.
- [ ] File paths from content or users are relative, normalized, and confined.
- [ ] Session tokens are hashed at rest and never logged.
- [ ] AI keys are server-only and absent from build output.
- [ ] Rate limits cover login, registration, AI, and expensive reads.
- [ ] Account export and deletion work, including cascades.
- [ ] Backups are encrypted or stored on a trusted volume, checksummed, and restoration-tested.
- [ ] Dependencies are audited and lockfiles are frozen in CI.
- [ ] Proxy sets HTTPS, HSTS, and trusted forwarding headers correctly.
- [ ] No learner code executes in the production Node process.
- [ ] The app does not claim verification or compliance it has not earned.
