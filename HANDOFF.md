# Review and operator handoff — 2026-11-14

## Scope and state

This PR includes the remediation of the 15 supplied Daybreak findings, container
compatibility/startup fixes discovered during verification, and a 46-scenario
Playwright functional suite. Base/scanned commit:
`50089c8183b0129117862ee091fe710b9e4d287c`.

The canonical finding-by-finding disposition, stable IDs, evidence and residual
risks are in [SECURITY-REMEDIATION.md](SECURITY-REMEDIATION.md). The browser
feature-to-test ledger is in [tests/ui/README.md](tests/ui/README.md).

Publication of this branch/PR is authorized. **GitHub Actions remains disabled**;
the permissions API was checked again before publication. Nothing has been
merged or deployed, no image has been published, and no production database or
media integration was exercised. Tests used synthetic credentials, disposable
databases, loopback mock services and the isolated demo backend.

## Change overview and review order

1. **Authorization and sessions:** route-local guards on privileged API exports,
   explicit demo/system capabilities, runtime page authorization, one-day
   sessions, shared login throttling and key rotation on credential changes and
   logout. Logout revokes all administrator sessions.
2. **Service and image boundaries:** bind stored credentials to configured
   destinations, reject redirects, validate/re-encode raster images, constrain
   bytes/pixels/time/concurrency and eliminate the unbounded image cache.
3. **Cleanup invariants:** shared execution path, stable Plex/Arr identity,
   live playback/in-progress checks, permanent exclusions checked at generation
   and execution, persisted direct-Plex approval, conditional state transitions,
   durable execution fence and preservation of uncertain effects.
4. **Demo and exports:** isolate real integrations, cap and expire demo state,
   atomic session writes, safe embedded HTML JSON and CSV formula neutralization.
5. **Runtime and verification:** additive Prisma migration, public liveness route,
   Node 22 container, non-root writable runtime state, migration failure stops
   startup, regression/browser/container/HTTP tests and evidence tooling.

## Verification completed

| Check | Result | Evidence/reproduction |
| --- | --- | --- |
| Chromium UI suite | **46 passed**, 0 failed, 0 skipped, 0 flaky; retries disabled | `npm run test:ui` |
| UI evidence validation | Passed | `npm run test:ui:proof` |
| Typecheck | Passed after final UI run | `npm run typecheck` |
| Existing regression/export tests | **28 passed** after final UI run | `npm test` |
| Production build | Passed during remediation | Exact environment/command in remediation record |
| Fresh migrations | Passed | Synthetic database; ten migrations |
| Production HTTP smoke | Passed | `node tests/http-smoke.mjs` |
| Local ARM64 container | **23 checks passed** | `SWEEPARR_TEST_HOST_NETWORK=1 python3 tests/container-smoke.py` |

Final full UI run: `2026-11-14T03:07:57.811Z`, duration **584.286877 seconds**.
Production build ID: `VPwsWA7_VpSs1mHArko7V`.
Results JSON SHA-256:
`b37b7c490a98adffef72c143796039c5d12d656834c894a69f16637dd63b8623`.

The run was performed before committing; the evidence manifest therefore records
the base commit, plus hashes of the actual test sources/configuration/lockfile.
Early failed/interrupted runs were corrected; the counts above refer to the
final full run, not an aggregation of selectively rerun tests.

### Evidence location and reproduction

Original workstation artifacts are **local, not hosted by this PR**:

- `/tmp/opencode/sweeparr-ui/report/index.html`: per-test report, screenshots and traces.
- `/tmp/opencode/sweeparr-ui/results.json`: original complete Playwright results.
- `/tmp/opencode/sweeparr-ui/evidence.{md,json}`: clean-run summary and checksums.
- `/tmp/opencode/sweeparr-artifacts/`: production build, migration, HTTP and
  container logs; local image `sweeparr:security-local` retained.

On a new checkout, install Node 22 dependencies and Chromium, then run serially:

```sh
npm ci
npm run generate
npm run build
npm run test:ui
npm run test:ui:proof
npm run typecheck
npm test
```

Use `CHROMIUM_PATH` if Chromium is not `/usr/bin/chromium` and `SWEEPARR_UI_DIR`
for an external, disposable writable artifact directory. The UI harness creates
and migrates its own database and starts its own production server on
`127.0.0.1:3410`. It recreates `app.db` in that artifact directory: do not use a
production data directory. `SWEEPARR_TEST_DIR` similarly redirects regression
test artifacts. On this constrained host, build/browser/typecheck jobs must run
serially. See the remediation record for the successfully verified webpack build
command and the host-network container workaround.

## Remaining findings and limits

### UI findings

- **Broken Backups navigation:** the sidebar links to `/settings/backups`, but
  there is no corresponding page or API. This pre-existing defect remains open;
  it is not counted as a passing implemented feature. Implement it or remove the
  dead link in a follow-up.
- **Optimistic success/error handling:** source inspection found save handlers
  in Connections, Rules, Schedule and Notifications that do not consistently
  check unsuccessful HTTP responses. Library/exclusion batch removal also
  removes selected entries locally even when some server operations fail.
  Add targeted failure-response tests and retain failed items/display errors in
  a follow-up. The passing happy paths do not prove these failures are handled.
- Several controls have unassociated labels or unnamed icon buttons. Tests use
  structural selectors where necessary; add accessible names and associations
  in a UI accessibility follow-up.

### Security/integration verification still open

- No Daybreak rescan; scanner closure is not claimed.
- No real Plex/Radarr/Sonarr deletion, notification delivery or production rollout.
  UI integration responses are mocked where the coverage ledger says so.
- CSV serializer tests pass; Excel/LibreOffice behavior has not been verified.
- Chromium only; no cross-browser, mail-client or full accessibility audit.
- External playback/identity/exclusion changes can still race the final remote
  delete: upstream services provide no atomic conditional-delete primitive.
- Durable-fence behavior is tested; deployed multi-process crash/recovery stress,
  image-worker heap measurements and production load/soak checks were not run.
- Docker bridge networking failed on this host; successful container evidence
  uses host networking with a loopback-only listener, not normal port forwarding.
- Dependency installation reported audit advisories. Remediating those beyond
  the supplied 15 source findings was outside this patch; evaluate separately.

## Deployment and recovery handoff

Before any future rollout, take a SQLite-consistent backup and apply
`20261113000000_cleanup_safety` using `npm run migrate` against the intended
deployment database. The migration is additive: execution approval, item safety
snapshots and the execution-fence table. Rescan libraries and regenerate legacy
reports; missing identity evidence fails closed. Legacy DRAFT rows cannot execute.

Direct Plex deletion requires recorded explicit approval; scheduled cleanup does
not opt in. Arr failures never fall back to Plex. Automatic error retries return
409; reconcile and generate a fresh report. An uncertain effect is `unknown`,
not a candidate for blind retry, and its audit report is protected from removal.

Execution fences intentionally do not expire. After a crash, confirm the owning
worker has stopped, reconcile all `deleting`/`unknown` effects with the services,
then update audit state and remove the correct owner's fence in controlled
maintenance. Never clear a fence on a timer. Detailed recovery and demo writer
lock handling are in the remediation record.

For rollback, preserve audit rows and unresolved effects; do not restore an old
database and retry deletions. Reverting the security changes reintroduces the
original findings. Keep Actions disabled throughout review unless the owner
explicitly changes that requirement.
