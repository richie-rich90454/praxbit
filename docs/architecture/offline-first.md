# Offline-first behavior

Praxbit is designed to keep a useful session working when the network is slow or absent. Offline support is not a claim that every feature works without a server.

## What is stored locally

IndexedDB database `praxbit-local` (Dexie) stores:

| Table         | Contents                                         |
| ------------- | ------------------------------------------------ |
| `progress`    | XP, level, streak, placement skips, achievements |
| `evidence`    | Local evidence records                           |
| `mastery`     | Per-skill estimates                              |
| `reviews`     | Review schedule                                  |
| `world`       | Campus state                                     |
| `drafts`      | Code editor drafts by mission step               |
| `preferences` | Accessibility, interests, challenge, AI consent  |
| `outbox`      | Queued sync operations                           |
| `projects`    | Local project files and revision                 |
| `attempts`    | Mission attempts                                 |
| `completions` | Local completion records                         |
| `meta`        | Small local flags                                |

Guest mode uses the same tables. No account is required to read cached content, practice, or keep progress on the device.

## What is cached by the service worker

The Vite PWA plugin precaches build output matching:

```text
**/*.{js,css,html,svg,woff2}
```

It ignores `pyodide/**/*`, cleans outdated caches, and uses `index.html` as the navigation fallback. The maximum precache file size is 12 MB.

Consequences:

- The application shell, CSS, fonts, icons, and bundled mission JSON are available offline after the service worker installs.
- CodeMirror and other JS chunks are precached if they are part of the build and under the size limit.
- Pyodide is not precached. The first Python exercise needs a network connection to fetch the runtime; after that it may be served from the browser HTTP cache, but that is not guaranteed.
- The SQLite WebAssembly file is not included in the precache glob. The first SQL exercise may require the network.
- The service worker uses `registerType: "autoUpdate"`. A new build may activate a new worker; the app does not force a reload in the middle of an exercise.

## Offline behavior by feature

| Feature | Offline behavior |
| --- | --- |
| Learn map, lesson text, mission steps | Available after the app and content bundle are cached |
| JavaScript, HTML/CSS exercises | Available; execution is local |
| Python exercises | Available after Pyodide has been fetched and cached by the browser; not guaranteed on first offline use |
| SQL exercises | Available if the SQLite WASM file is cached; not guaranteed on first offline use |
| Git exercises | Available; repository is local |
| Terminal simulation | Available; it is deterministic and local |
| Practice and review scheduling | Available with local mastery and review data |
| World actions | Applied locally and queued; server sync waits |
| Projects | Local drafts and checks work; server revisions require sync |
| Accounts, login, clubs, leaderboards, AI hints | Require the API |
| Export and deletion | Require the API |

## Reconnection

The web app listens for `online` and `offline` events. On reconnect it flushes the outbox, requests a fresh snapshot, and displays a quiet status strip when sync is pending, conflicted, or failed. It does not discard local progress because a request failed.

A sync conflict keeps the local operation and shows the server state. The learner is told what changed. The client does not silently overwrite the server or pretend the local write was accepted.

## Refresh and storage durability

Local state survives a page refresh because it is in IndexedDB, not memory. It does not survive clearing site data, using a private window that discards storage, or browser storage eviction.

The app does not currently call `navigator.storage.persist()`. On browsers that evict storage under pressure, local progress can be lost. Signed-in users have a server copy; guests do not. The UI should not promise permanent guest storage.

## Security and privacy

- Local data is protected by the browser profile, not by an application-level encryption key.
- Do not store bearer tokens in IndexedDB or `localStorage`. Browser sessions use an `HttpOnly` cookie. Native tokens belong in native secure storage.
- The service worker caches static assets, not API responses. Authenticated API data is stored in IndexedDB by the application, not in the HTTP cache.
- Clearing site data is the only complete local deletion. Server deletion does not reach the device.
- The outbox may contain learner work. Treat an exported device profile as sensitive.

## Limits

- There is no background sync guarantee. iOS and some browsers may suspend or discard a background task.
- There is no CRDT merge. Conflicts are surfaced, not automatically reconciled field by field.
- There is no offline AI. The AI gateway requires the server and provider.
- There is no offline account creation or login.
- The first install must be online.
- The PWA is installable but not store-published. Native offline behavior requires device testing through Capacitor.
