# G5.4 verification

Implemented on `main` at `6687238`. Verified and released on November 25, 2026.

| Check | Result | Output |
| --- | --- | --- |
| `npm test` | Exit 0. `Test Files  10 passed (10)` and `Tests  152 passed (152)`. | [Vitest](npm-test.txt) |
| `npx tsc --noEmit` | Exit 0 with no output. | [TypeScript](typecheck.txt) |
| `VITE_APPCHECK_DEBUG_TOKEN="" npm run build` | Exit 0. Vite built the production bundle and Workbox generated the service worker. | [Build](build.txt) |
| Debug token scan | Exit 0. Across 9 files in `dist/`, zero occurrences of `VITE_APPCHECK_DEBUG_TOKEN` and zero occurrences of the configured debug token value. | [Scan](dist-token-scan.txt) |
| `npm run test:e2e` | Exit 0. `9 passed (7.2s)`. | [Playwright](test-e2e.txt) |
| `firebase deploy --only hosting --project pantryrelay-c3246` | Exit 0. `Deploy complete!` Firebase CLI 15.37.0 was run through `npm exec --offline`. | [Deploy](deploy.txt) |
| Hosted asset comparison | Exit 0. All 9 public responses matched the corresponding tested build files byte for byte. | [Hosted assets](hosted-assets.txt) |

The [reducer and quantity baseline](regression-before.txt) failed five tests, covering the missing cancel action and invalid quantities still reaching review. The [UI baseline](ui-before.txt) failed six tests for stale Capture feedback, technical error copy, and final discrepancy styling during pending review. Both sets passed after implementation.

The regression replays the recorded G5.1 `1e-15` juice movement, verifies the separate all-zero evidence condition, and checks the inclusive `0.01` threshold. It preserves the 89 other previously accepted movements across the three recorded G5.1 runs and all positive expected movements in the benchmark corpus, including `0.75 kg`.

Playwright drives the duplicate warning, dismiss and retry controls, and a manually resolved stall through the Firebase SDK integration using a stubbed browser model. It checks that cancellation aborts the signal, unlocks Capture, and leaves the entered manual quantity intact when the model returns late. The browser tests also check that editing or changing samples clears stale feedback and that finishing review removes the provisional label from Reconcile and the Handoff list.
