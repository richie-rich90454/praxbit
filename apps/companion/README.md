# Praxbit companion

A local TypeScript CLI for learners who want a real terminal, editor, and installed toolchain alongside the browser curriculum.

The companion is optional. It does not run on the production server, it does not download toolchains, and it cannot attest a ranked competition result.

## Build and run

```bash
pnpm --filter @praxbit/companion typecheck
pnpm --filter @praxbit/companion build
node apps/companion/dist/main.js doctor
```

During development:

```bash
pnpm --filter @praxbit/companion start -- doctor
```

`scripts/build-companion.mjs` bundles the CLI to `apps/companion/dist/main.js` with a Node shebang.

## Commands

### `praxbit doctor`

Detects Node.js, pnpm, Python, Java, Go, Rust, .NET, GCC, and G++ with fixed version commands.

```bash
praxbit doctor
```

It prints a version only when the tool reports one. A missing tool is reported as missing. Detection does not mean a particular project can build; use `test` to inspect the commands for a directory.

### `praxbit open <mission-or-project-id> [--dir <path>] [--yes]`

Reads a validated content manifest or project from the repository and writes its starter files into a confined directory.

```bash
praxbit open campus.page-with-no-identity --dir ./work/campus-page
praxbit open projects.inventory-service --dir ./work/inventory --yes
```

Behavior:

- Resolves the repository by walking up from the current directory and the bundled module location until it finds `content/tracks.json`.
- Accepts a mission id or a project id.
- Prints the title, summary, target directory, files, and any overwrite conflicts.
- Requires interactive consent unless `--yes` is passed.
- Writes only inside the chosen directory. Absolute paths, `..` segments, null bytes, and symlink escapes are rejected.
- Exports code-step files, terminal initial files, and project files. Git seed history is not exported; the message says so.
- Refuses to guess if two steps provide different content for the same path.

The default directory is `./praxbit-<id>` in the current directory.

### `praxbit test [directory] [--yes] [--timeout <ms>] [--out <report.json>]`

Detects a local project, prints the exact commands, and runs them only after information consent.

```bash
praxbit test .
praxbit test ./work/inventory --yes --timeout 60000 --out ./work/report.json
```

Detected project types and approved commands:

| Project                      | Command                          |
| ---------------------------- | -------------------------------- |
| Node with `pnpm-lock.yaml`   | `pnpm test`                      |
| Node with `yarn.lock`        | `yarn test`                      |
| Node with `package.json`     | `npm test`                       |
| Go module                    | `go test ./...`                  |
| Rust crate                   | `cargo test`                     |
| Python with pytest config    | `python -m pytest -q`            |
| Python without pytest config | `python -m unittest discover -v` |
| Maven                        | `mvn -q test` (or `mvnw`)        |
| Gradle                       | `gradle test` (or `gradlew`)     |
| .NET                         | `dotnet test`                    |
| Make with a `test` target    | `make test`                      |
| Unknown                      | No command; nothing is run       |

- A Node project without a `test` script is reported as having no approved command.
- `--timeout` is 1,000–600,000 ms, default 120,000 ms.
- Output is capped at 2 MB captured and 12,000 characters per stream in the report.
- The command runs in the chosen directory with `CI=1` and `NO_COLOR=1`.
- The report is written only when `--out` is provided.
- Exit code is `0` when all commands exit 0, `2` when a command fails or times out, and `1` for a usage or detection error.

The commands run project code. Consent is the gate. The companion does not run `npx`, `pnpm dlx`, installers, curl pipes, or downloaded scripts.

### `praxbit export <results.json> [--dir <path>]`

Wraps a local result file with toolchain versions, a timestamp, the companion version, and an explicit trust flag.

```bash
praxbit export ./work/report.json --dir ./work/results
```

The output is `praxbit-results-<timestamp>.json` with:

```json
{
    "format": "praxbit-companion-export",
    "formatVersion": 1,
    "exportedAt": "…",
    "companion": { "name": "praxbit-companion", "version": "0.1.0" },
    "trustedForRankedCompetition": false,
    "trustNote": "…",
    "toolchains": { "…": "…" },
    "results": { "…": "…" },
    "inputClaimedRankedTrust": false
}
```

If the input claims ranked trust, the export overrides it to `false` and says so. A local process cannot prove what happened on the machine.

## Security and privacy

- Path confinement is implemented in `src/security/paths.ts`.
- Consent parsing is deliberately narrow: `y` or `yes` only, case-insensitive and trimmed.
- The command list is fixed; no arbitrary shell command is accepted from the user.
- `open` refuses to write through an existing symlink at the destination.
- `test` does not read credentials or call the Praxbit API.
- `export` writes with mode `0600` where the platform honors it.
- No command uploads files or results.

The companion is not a sandbox for hostile projects. It runs tests in your user account, with your permissions. Only run it on a project you trust.

## Limitations

- It does not implement account login or sync. Local results are separate from the server account.
- It cannot verify ranked competition results.
- It does not export Git history, only code and terminal starter files.
- Project detection is heuristic and intentionally conservative.
- It requires the toolchain to be installed and on `PATH`.
- This working copy was exercised on Windows; macOS and Linux behavior should be verified on your target.
- It does not provide full TypeScript type checking for a browser mission; it runs the project's own test command.
- It does not replace the in-browser editor, preview, or evaluator.

## Tests

```bash
pnpm exec vitest run apps/companion/test
pnpm --filter @praxbit/companion typecheck
pnpm --filter @praxbit/companion build
```

The root Vitest unit project includes `apps/companion/test/**/*.test.ts`.
