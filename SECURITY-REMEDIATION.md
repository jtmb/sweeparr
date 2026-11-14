# Security remediation record — 2026-11-13

## Provenance and scope

Repository: `https://github.com/jtmb/sweeparr.git`, default branch `main`.
Fetched HEAD and scanned baseline both equal
`50089c8183b0129117862ee091fe710b9e4d287c`; the initial checkout was clean and
`git diff 50089c8183b0129117862ee091fe710b9e4d287c..HEAD` was empty.
This record describes the remediation developed and verified on that baseline,
now prepared for review in the accompanying pull request.
All 15 findings were present in the baseline; none was already fixed upstream.

The supplied ZIP was extracted to `/tmp/opencode/sweeparr-handoff`; all nine
entries in `SHA256SUMS.txt` passed. The handoff, original finding evidence,
manifest, report and bundled artifact inventory were consulted. The bundle
contains scan checkpoints/SARIF, not a runnable reproduction suite.

GitHub's Actions permissions API returned `enabled: false` (reconfirmed on
2026-11-14 before PR publication). No workflow was enabled or manually triggered.
The user subsequently authorized publishing the branch and pull request; no image
was published and no change was merged or deployed. Tests used synthetic
credentials, disposable SQLite databases and loopback HTTP mocks. No production
media service, database, credential or schedule was used or modified.

## Finding ledger

“Fixed + tested” means the listed regression checks passed against this working
tree. It does not assert that every deployment-specific acceptance item from the
handoff was exercised; exact remaining evidence gaps follow the table.

| Stable finding ID | Disposition and implementation | Runtime evidence |
|---|---|---|
| `csf_e0728dff71bccb85f65eec88` | Fixed + tested. Route-local `guardApi` before work in all 43 privileged HTTP exports; only login and liveness are public. Enabled authentication cannot be bypassed by demo cookies. Pages are dynamically rendered. | Route inventory invokes every privileged export with absent, invalid and genuinely expired signed cookies: all 401, no settings/report changes. Authorized settings changes and intentional auth-disabled administration pass. |
| `csf_a9d91c172aefd8d90838d856` | Fixed + tested. Image requests accept only paths under the configured service origin. Connection tests use saved credentials only with the exact saved URL. Service clients reject userinfo/non-HTTP(S) URLs and do not follow redirects. | Public/private/loopback/link-local/userinfo/alternate-authority image inputs rejected; relative configured-loopback images work; all three connection-test services refuse replacement destinations without supplied credentials; redirect rejected without following it. |
| `csf_12a4ec047bd64f5d4f2ed6f7` | Fixed + tested. Decode only JPEG/PNG/WebP, enforce pixel limits, re-encode as WebP; fixed MIME, `nosniff`, sandbox CSP, private/no-store response. | Valid PNG/JPEG/WebP accepted; HTML and active SVG disguised as PNG rejected. No upstream content type is reflected. |
| `csf_527f87acdf3b9db1e02e389e` | Fixed + tested. No retained image cache (zero cache-byte budget); 5 MiB streamed input cap, 10-second network deadline, 16M input pixels, 3-second decode timeout, 1600px output; two concurrent requests per worker and shared 120/minute admission budget. | Oversized declared and chunked bodies rejected; two endless responses terminate at the deadline; concurrent third request gets 429. |
| `csf_a1ea76899d6db5a4b3af8914` | Fixed + tested. Shared `htmlJson` encoding escapes every `<`, U+2028 and U+2029 for both export paths. | Raw-text delimiter variants round-trip safely. Actual server and client generators opened in Chromium: one JSON data element, no injected image or script execution. |
| `csf_c9fbd709ace1182ee1aa465b` | Fixed + tested. SQLite-backed single-account/global budget permits five attempts per minute before bcrypt, independent of arbitrary username/source headers. Bounded login body and field lengths. | Five failures then 429 even for the correct password; username case does not split the budget; reset/cool-down budget permits legitimate login. |
| `csf_3646b8689904a69321542f17` | Fixed + tested. Auth changes and logout rotate the persisted signing key. Logout explicitly logs out **all** administrators. New sessions last one day; every privileged request reads the current key. | Old/copy tokens fail after password change and logout; authorized flow remains functional. SQLite key persistence used by checks. |
| `csf_b670c9c48937c7586430d6fd` | Fixed + tested. Persist direct-Plex approval on execution acquisition; omitted/false defaults deny it; resume retains original approval. Scheduled calls omit it. No automatic Arr-to-Plex fallback, even on 404. | Unmanaged false/omitted/true cases; Arr 404 with approval still causes no Plex delete; resume cannot change saved approval. |
| `csf_3b3f8eea8d63397c3587464f` | Fixed + tested. Generation omits permanent exclusions; a short transaction checks exclusions again immediately before claiming each effect. Library direct deletion also uses this executor. | Manual and scheduled generation omit exclusions; adding an exclusion after creation prevents deletion; a failed exclusion lookup causes zero DELETE calls. |
| `csf_b353b324a0484730467416a4` | Fixed + tested. Rule snapshot retained; fresh metadata, sessions and on-deck queried for each item; episode→series mapping required. Always protect playback/in-progress state, including explicit library deletion. Query/mapping failure skips safely. | Playback after report creation, episode/series mapping and failed live query cause zero DELETE calls. All executions use live checks rather than trusting cache age. |
| `csf_9507af69233dbc39eb98a8bb` | Fixed + tested. Match Plex GUID TMDB/TVDB IDs, reject duplicate stable IDs. Persist Plex GUID/server identity and connection digest; verify live Plex identity and current Arr stable ID before DELETE. | Colliding title/year picks the correct stable object; duplicate stable IDs rejected; changed destination or reused Arr ID prevents deletion. |
| `csf_ef9f8968898afd0c2ce5ecee` | Fixed + tested. Transactional report creation; READY-only conditional acquisition; durable global execution fence; conditional resume/pause/stop; protect active and unresolved audit rows from DELETE. `deleting`/`unknown` effects are never reset by retry. | DRAFT rejected; concurrent acquisition has exactly one winner; active and unresolved report deletion returns 409; fence prevents takeover; failed external effect makes one call, records unknown, never falls back/retries. |
| `csf_d87e140dac298ce52230cc47` | Fixed + tested. Explicit demo capability at routes, server-derived demo mode, removed debug/history route, real connection-config factory denies demo. Scheduled real work and notifications also check demo state. | Entire API export inventory in demo with real-service sentinels configured: no outbound fetch/Axios requests, no sentinel disclosure or production report/cache mutation. |
| `csf_16b043cc26b15ab29427a75e` | Fixed + tested. Bounded exclusion JSON/schema; 500 exclusions/10 reports/1 MiB per session, 100 sessions globally; shared allocation/mutation budgets; absolute four-hour TTL purged periodically and on writes; atomic rename + cross-process directory lock + optimistic revision. | Item/string/byte/session caps reject without partial writes; expiry without report generation; stale concurrent writes rejected; durable mutation budget enforced. |
| `csf_32e296942a1e70eba644ac0f` | Fixed + unit tested; spreadsheet-application verification remains open. Shared CSV cell function prefixes dangerous text and consistently quotes all text columns. | `= + - @`, tab/CR/LF and whitespace-prefixed formulas neutralized; commas/quotes/newlines preserved. Excel/LibreOffice execution was not available. |

## Capability matrix

- **Public:** `POST /api/auth/login` (bounded), `GET /api/health` (liveness only).
- **Ordinary deployment:** all other handlers require a current signed session
  when authentication is enabled. Auth-disabled/initial setup retains the
  existing intentional open-administration mode.
- **Demo-safe:** reports and exclusions use visitor session data; rules, settings,
  libraries, stats and activity use fixtures/isolated demo DB or reject mutations.
  Connection tests return fixtures. Each permitted handler explicitly passes
  `guardApi('demo')`; this never grants access to real integrations.
- **Demo-denied:** image proxy, item detail, scans, Plex authentication/termination,
  direct deletion, poster backfill, real jobs/logs and real auth settings mutations.
- **Demo administration:** system toggle/reset and logout require an actual
  administrator token, using the separate `system` capability. Enabling demo
  requires authentication first. Existing auth-disabled demo deployments need
  local operator configuration to leave demo mode; anonymous visitors cannot
  turn it off. Caller-supplied demo-marker cookies confer no capability.

## Changed-file summary

- `src/lib/auth/{guard,rate-limit,session}.ts`, API route handlers,
  `src/app/layout.tsx`, `src/proxy.ts`: authorization, revocation, runtime state,
  rate limits and server-derived demo allocation; replaces `src/middleware.ts`.
- `src/app/api/images/[service]/route.ts`, `src/lib/security/`,
  `src/lib/{plex,radarr,sonarr}/client.ts`: destination binding, redirect refusal,
  body/resource limits and validated image responses.
- `src/lib/cleanup/{engine,executor,safety}.ts`, report/direct-delete routes,
  `src/types/index.ts`, `prisma/schema.prisma` and the new migration: stable
  identity, playback/exclusions, execution state/fence and durable audit policy.
- `src/lib/demo/`, `src/instrumentation.ts`, scheduler/notification modules:
  isolated demo state, bounded atomic storage, expiry and real-work restrictions.
- `src/lib/reports/{encoding,html-export}.ts`, report detail page: common safe
  encoding, CSV formula neutralization and unknown-effect visibility.
- `src/app/api/health/route.ts`, `docker-compose.yml`: non-sensitive public
  liveness replaces the authenticated settings endpoint in the healthcheck.
- `tests/`, `vitest.config.ts`, package manifests: direct-handler/SQLite/mock HTTP,
  browser and production HTTP verification; explicit Sharp and Vitest dependencies.
  `.gitignore`/`next.config.ts` support external local build artifacts.

## Behavior and migration

Apply `npm run migrate` with the target deployment's configured `DATABASE_URL`
before starting this code. Only synthetic databases were migrated here.
Migration `20261113000000_cleanup_safety` adds an approval flag, nullable item
safety snapshot, and execution-fence table. It does not delete application data.

Rescan libraries and regenerate old reports: pre-migration cached media lacks
identity evidence and old report items fail closed. Report construction is now
one nested transaction. Legacy DRAFT rows remain unexecutable.

Manual, scheduled, resumed, and explicit library deletions use the same executor.
Direct Plex deletion is permitted only with persisted explicit approval; scheduled
cleanup cannot opt into it in this patch. An Arr lookup/delete failure does not
fall back to another service. Playback protection is intentionally unconditional
at execution, even for a rule that disabled scan-time protection. Reports retain
the matched rule and identity snapshot. Safety refusal is stored as `skipped`
with its reason; external ambiguity is `unknown`, visible in the report.

Automatic retry now returns 409 with reconciliation instructions. Unknown or
in-flight effects block new attempts for the same Plex key and prevent removal
of the containing report. Successful completion records actual freed-item sizes.

### Crash recovery

The execution fence deliberately **does not expire**. A timeout cannot prove that
an external media service stopped deleting. After a process crash, execution
stays blocked until the operator confirms that the owning worker is gone and
reconciles each `deleting`/`unknown` item against the external services. Only then
may the operator mark each item accurately, mark the report FAILED/COMPLETED,
and remove the corresponding `CleanupExecutionLock` row by its recorded owner.
Do this in a short database transaction during controlled maintenance. Never
clear the fence on a timer or reset uncertain items to pending. No automatic
recovery/lease-takeover endpoint is supplied.

A demo writer crash may leave `.write-lock`; after confirming no writer remains,
the operator can remove that lock and leftover `.tmp` file. This fails closed
rather than allowing overlapping writes.

### Rollback

Take a SQLite-consistent backup before migration. The migration is additive;
preserve audit rows, unknown statuses and fences when changing application code.
Do not restore a pre-execution database and blindly retry external deletions.
Reverting these code changes reintroduces the original findings. No deployment
or rollback was performed in this workspace.

## Verification

Artifacts: `/tmp/opencode/sweeparr-artifacts/`. Dependencies, npm cache, generated
Prisma client, Next build output, temporary databases and browser exports are
outside the checkout; local ignored symlinks provide the normal tool paths.

Commands run:

```sh
sha256sum -c SHA256SUMS.txt             # in extracted handoff: all 9 OK
git fetch origin
git show 50089c8183b0129117862ee091fe710b9e4d287c
git diff 50089c8183b0129117862ee091fe710b9e4d287c..HEAD
npm run generate
npm test -- --reporter=verbose          # 28 passed; exit 0
npm run typecheck                      # exit 0
git diff --check                       # exit 0
DATABASE_URL=file:/tmp/opencode/sweeparr-artifacts/migration.db npm run migrate
                                      # all migrations deployed; exit 0
DATABASE_URL=file:/tmp/opencode/sweeparr-artifacts/build.db \
DEMO_DATABASE_PATH=/tmp/opencode/sweeparr-artifacts/build-demo.db \
SWEEPARR_DISABLE_BACKGROUND=1 NEXT_TELEMETRY_DISABLED=1 \
NODE_OPTIONS=--max-old-space-size=1536 npm run build -- --webpack
                                      # production build passed; exit 0
node tests/http-smoke.mjs              # production HTTP smoke passed; exit 0
```

Tests use actual SQLite migrations and Prisma operations, local HTTP servers,
and Chromium for generated report files. Next cookie APIs are mocked for direct
handler invocation. `tests/browser.test.ts` uses `/usr/bin/chromium` by default;
set `CHROMIUM_PATH` for another installation. Set `SWEEPARR_TEST_DIR` to redirect
all test artifacts. Its disposable `test.db` is recreated on each test-file run.
No pre-existing test or lint script existed; this patch adds test/typecheck
scripts. No lint result is claimed.

Logs: `tests.log`, `typecheck.log`, `build.log`, `migrate.log`, `http-smoke.log`,
`http-server.log`. The smoke test starts its own loopback Next production server
and verifies health, unauthenticated denial, forged-demo-cookie denial, successful
login, authorized settings read, and password-change revocation over HTTP, then
stops that server. Early verification attempts
included an npm-install timeout (subsequent install succeeded), a generated-client
module-resolution failure from external symlinks (fixed artifact dependency link),
a build-time database read (fixed dynamic rendering), and a killed build worker
when browser tests ran concurrently (subsequent checks run serially).

## Remaining risks and unperformed checks

### Subsequent local container verification

The remediated source was built locally into `sweeparr:security-local` (ARM64),
image ID `sha256:6a8860c3cea5cd2a7b2df6ff3b9ecda8b4d40b8a93860b5a7e7e83fcbdbbc3f4`.
The image runs as `nextjs:nodejs`, UID 1001. Docker/Buildx were installed locally
for this verification; no image was pushed and no GitHub workflow was enabled.

Container fixes made during verification: Node.js 22 dependency-compatible base,
exclude local generated symlinks/databases from build context, webpack build
with background jobs disabled at build time only, copy the Prisma configuration,
fail startup on migration error, and place writable demo state under `/app/data`.

```sh
sudo docker build --network=host --progress=plain -t sweeparr:security-local .
# exit 0; image exported successfully
SWEEPARR_TEST_HOST_NETWORK=1 python3 tests/container-smoke.py
# exit 0; CONTAINER SMOKE: 23 checks passed
```

Evidence is retained in `docker-build.log` and `container-smoke.log` under
`/tmp/opencode/sweeparr-artifacts`. Checks covered all ten fresh migrations,
non-root operation, rendered login/static assets, initial setup, API denial and
valid login, demo DB/session writes and integration isolation, persisted auth
after restart, copied-token revocation, and refusal to start when migrations fail.
The container and disposable volume were removed; the image remains locally.

This host's Docker bridge could not fetch Alpine packages or forward a published
HTTP port. A minimal Node HTTP container reproduced the forwarding problem:
in-container HTTP returned `ok`, while the host-published port timed out. Build
and final runtime verification used host networking; runtime bound only to
`127.0.0.1:3408`. Normal bridge-network operation is therefore not claimed here.

### Remaining limitations

- Plex and Arr provide no atomic “delete only if still idle/unexcluded/same
  identity” primitive. Playback, exclusions, service identity, or settings can
  change in the small interval between final validation and the external effect.
  SQLite transactions are never held across network I/O. No claim eliminates
  that external TOCTOU window.
- The durable execution fence's no-takeover behavior is tested, but forcibly
  crashing independent deployed workers and exercising operator recovery was not
  performed. Independent-process stress remains unverified. Subsequent browser
  testing passed 46 functional scenarios; see `tests/ui/README.md` for coverage
  and limitations. These do not establish exhaustive branch coverage.
- Image concurrency is two per Node worker; the durable 120/minute admission
  budget is shared across workers and includes every caller. No image cache is
  retained. Multi-process heap measurements were not performed.
- The login budget is intentionally global for this single-account application;
  it bounds every source without trusting forwarded-IP headers, but an attacker
  can consume the shared minute budget. No per-source fairness or progressive
  backoff is claimed. A production multi-process soak was not run.
- Configured private/loopback service origins remain valid for self-hosting.
  Caller-selected authorities and redirects are rejected. Compromise/rebinding
  of an operator-configured trusted hostname and deployment egress policy were
  not tested or configured here.
- Browser verification used local Chromium HTML exports and the application's
  browser UI. Other browsers, mail
  clients and spreadsheet applications were not run. CSV application-level
  proof remains specifically open; its serializer-level tests passed.
- No Daybreak rescan or production-service test was run. Dependency installation
  reported npm audit advisories; dependency-advisory remediation beyond the
  supplied 15 source findings was not undertaken.
