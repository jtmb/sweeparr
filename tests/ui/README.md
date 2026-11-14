# Browser functional tests

Run from the repository root:

```sh
npm run build
npm run test:ui
npm run test:ui:proof
npx playwright show-report /tmp/opencode/sweeparr-ui/report
```

Requires Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`). The suite starts its own production server on loopback port 3410, migrates a disposable SQLite database, and uses synthetic credentials. `SWEEPARR_UI_DIR` changes the artifact/database directory. Do not point it at an application data directory: `app.db` in that directory is recreated on each run. Run builds, browser tests and typechecking serially on memory-constrained hosts.

Every test retains a Playwright trace and screenshot. The HTML report and `results.json` contain per-test outcomes, duration and attachments. CSV/HTML exports are retained in the corresponding test's results directory. A clean run also writes `evidence.md` and `evidence.json`, including the production build ID, result checksum and test-source checksums. Evidence generation rejects failures, skips and flaky results. Retries are disabled: failures are not concealed by a successful retry. No GitHub Actions workflow is added or enabled.

## Coverage ledger

Verified on 2026-11-14: **46 browser tests passed**, zero failures, skips or flaky results, in 584.3 seconds. Typechecking and all **28 existing regression tests** also passed afterward, serially.

Evidence: `/tmp/opencode/sweeparr-ui/evidence.md`, `evidence.json`, `results.json`, and `report/index.html`. Results JSON SHA-256: `b37b7c490a98adffef72c143796039c5d12d656834c894a69f16637dd63b8623`.

| Area | Functional scenarios | Implementation |
| --- | --- | --- |
| Authentication | Browser login, invalid password, logout/revocation, protected navigation, credential validation, successful credential change and protection toggling | `features.spec.ts`, `settings-controls.spec.ts` — real API/database |
| Navigation | All 13 implemented sidebar destinations, collapsed tooltips, expand, page headings | `features.spec.ts` |
| Appearance | All 22 choices, local storage, applied DOM attributes after reload, reset | `features.spec.ts` |
| Rules | Empty-name validation, cancel, create, all protection switches, enable/disable, edit, confirmed deletion, persistence | `features.spec.ts` — real API/database |
| Connections | Save/reload/reset; Plex popup, polling, server selection, sign-out; service test success/failure | `features.spec.ts` — real settings; mocked integration responses |
| Notifications | All three channels, fields, every switch, save/reload/reset, Gmail defaults, recipient chips, delivery success/error display | `features.spec.ts`, `settings-controls.spec.ts` — real settings, mocked delivery |
| Schedule | All six presets, switches, saved values after reload, reset, both cron helpers/frequencies, run-now success/error | `features.spec.ts`, `settings-controls.spec.ts` — real settings, mocked analysis |
| Logs | Actual browser EventSource receiving synthetic SSE, each tag filter, running job, clear request | `features.spec.ts` — mocked SSE/jobs |
| Demo/system | Enable/disable, seed libraries, reset data | `features.spec.ts` — real demo backend |
| Libraries | Library navigation, search/reset, three grid sizes, list/grid, pagination, sorting, each watch-status/media-type filter, numeric filters, exclusions filters, selection/clear, deletion cancel/confirm, scan polling | Both main specs — demo and API fixtures |
| Media detail | Metadata rendering, maximize/restore, close button and Escape | `interactions.spec.ts` — metadata fixture |
| Exclusions | Add through library, select/clear, cancel/confirm removal, verify reload; search, all filters, list/grid, sizes and sorting | `features.spec.ts`, `exclusions.spec.ts` — real demo backend and API fixtures |
| Reports/cleanup | Rule selection, generation, search, list/grid, execution consent/cancel, demo execution, CSV/HTML downloads, rerun, report deletion | `features.spec.ts` — real demo backend |
| Report controls | Pause/resume/stop, consent payload, retry rejection/uncertain outcome, pagination, sort controls, status/type filters | `report-controls.spec.ts` — stateful API fixtures |
| Activity | Live session display/stop request, tabs, refresh, collapse preference persistence | `interactions.spec.ts` — API fixtures |

## Scope and gaps

This is browser functional coverage, not proof that real Plex, Radarr, Sonarr, SMTP, Discord or Apprise installations interoperate. Integration responses are mocked where indicated. Demo deletions are simulated by the application.

The sidebar currently advertises **Backups**, but `/settings/backups` has no page or API implementation. It cannot truthfully be reported as a passing feature.

Additional assertions cover schedule overlap adjustment, per-user watch expansion/collapse, activity carousel scrolling, and temporary/permanent report exclusions. The ledger does not claim exhaustive coverage of every error branch; failure recovery for several save handlers remains untested. Consult the generated report for individual execution outcomes.
