# PantryRelay G5.1 evaluation

The evaluation used 30 synthetic shift notes with ground truth written before inference. The corpus covers routine receipts and distributions, quarantine, incomplete and inconsistent records, unit mismatches, missing baselines, duplicate statements, ambiguous references, and instructions embedded in notes. [Ground-truth fixtures](../src/data/benchmarkNotes.ts)

## Reproduce

1. Configure the localhost Firebase Web App and App Check as described in the [local setup](../README.md#run-locally). Run `npm ci`, `npm run build`, and `npm run preview`. Open `http://localhost:4173/?benchmark=1` in desktop Chrome.
2. Click **Preload model** online. Use **Check readiness** to verify that the model is available and the service worker controls the page. In Chrome DevTools Network, select **Offline** and reload normally. Verify readiness again, select **ONLY_ON_DEVICE**, and run the batch. Download JSON before reloading or closing the tab. If device inference stops, export the partial batch. The runner supports 5- or 10-note batches for a separate investigation.
3. Restore **No throttling**, select **ONLY_IN_CLOUD**, and run `gemini-3.5-flash-lite`. For the quota-paced run, use three batches of ten, space batch starts by at least 60 seconds, and download the final JSON. The build used a registered localhost App Check debug token.
4. For headless automation, install Chromium with `npx playwright install chromium`, build, then run `npm run test:e2e`. It starts Vite preview on port 4175. Playwright's headless Chromium installation lacks the roughly 4 GB Gemini Nano model. Run the device inference check separately in physical desktop Chrome.

## Scoring

A movement matches once per fixture occurrence when the item string, quantity, unit string, and kind all match exactly, including null values. Identical tuples can represent separate real events. Evidence, observations, and follow-ups are kept in the fixtures and exports for qualitative review. They are outside the movement metric. An unmatched movement is a false positive. The unsupported item/quantity count is the subset whose literal item-and-quantity pair has no match in the note's expected movements. That count includes mismatched labels, nulls, or quantities as well as fabrications.

Ambiguity scores count notes with a nonblank movement ambiguity field. A valid draft with no movement flag on a flagged fixture counts as falsely resolved. A failed draft is counted separately as a missing response. Incomplete fields and reconciliation statuses may still block stock changes. Fixture 23 exposes a schema limitation because conflicting observations have no ambiguity field of their own.

JSON and Zod use all attempted notes as denominator. Movement recall also counts expected movements on failed notes as misses. Median uses the middle value or averages the middle two, and p95 uses nearest rank. Successful latency includes only schema-valid responses from the requested source under the expected network condition. All-attempt latency keeps failures.

## Deterministic reconciliation

**10/10** fixed human-approved fixtures passed. Discrepancy detection precision was **4/4** and recall was **4/4**. Fixtures include 47 usable and a 22-bag discrepancy with 8 distributed, and 45 usable and a 20-bag discrepancy with 10 distributed. They also exercise missing opening balance, units, dismissed counts, blocking drafts, a negative discrepancy, a balanced count, and an explicit adjustment. The engine score uses the fixed fixtures as its only inputs. [Fixtures and scorer](../src/data/benchmarkReconciliation.ts) · [Actual outputs in the device artifact](evidence/g51/device.json)

Playwright starts each arithmetic branch with a fixed 25-bag shelf observation in IndexedDB because the volunteer UI has no manual observation form. The browser confirms that count and enters each movement manually. It checks the 8-to-10 edit in the second branch, blocks incomplete and ambiguous approvals, validates the clipboard text, verifies service-worker reload and unsynced IndexedDB state, resets the demo, and checks keyboard navigation, landmarks, headings, and live status. The volunteer route also passes a check for the absence of the benchmark UI and its lazy module request on first navigation. [Playwright output](evidence/g51/test-e2e.txt)

## Live Chrome extraction

Chrome 157 on macOS 27.2.1 ran the production preview on localhost. The device batch followed online preload and an offline reload. Chrome reported a controlling service worker and model availability, and each recorded attempt started and ended offline. All 30 SDK responses identified their source as `on_device`. The first attempt took 17,573 ms. There were no extraction failures in that batch. [Offline device JSON](evidence/g51/device.json)

The first online run sent all 30 requests consecutively. The API returned 10 HTTP 429 quota errors, leaving 20/30 JSON and Zod passes. The rerun started three ten-note batches about 121 and 179 seconds apart. All 30 attempts returned `in_cloud` while online, with no extraction failures. [Paced cloud JSON](evidence/g51/cloud.json) · [Unpaced cloud JSON](evidence/g51/cloud-unpaced.json)

| Metric | Device raw | Device guarded | Cloud raw | Cloud guarded |
| --- | ---: | ---: | ---: | ---: |
| Movement precision | 25/39 | 23/34 | 28/33 | 28/33 |
| Movement recall | 25/32 | 23/32 | 28/32 | 28/32 |
| False-positive movements | 14 | 11 | 5 | 5 |
| Unsupported item or quantity | 12 | 9 | 4 | 4 |
| Notes with an explicit ambiguity flag | 1/30 | 2/30 | 6/30 | 6/30 |
| Correctly flagged | 1/10 | 2/10 | 6/10 | 6/10 |
| Falsely resolved | 9/10 | 8/10 | 4/10 | 4/10 |

| Live batch | Attempted | JSON parse | Zod pass | Valid requested source and network | Median | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Device, offline | 30/30 | 30/30 | 30/30 | 30/30 | 5,200 ms | 7,235 ms |
| Cloud, paced online | 30/30 | 30/30 | 30/30 | 30/30 | 1,882.5 ms | 3,145 ms |
| Cloud, unpaced online | 30/30 | 20/30 | 20/30 | 20/30 | 1,477.5 ms | 2,432 ms |

The table uses all 30 attempts for latency. For the unpaced run's 20 successful requests, median was 1,607 ms and p95 was 2,432 ms. The corresponding successful-only latencies for the device and paced cloud runs equal their all-attempt latencies.

### Offline failure modes

- The raw draft proposed a fabricated movement for 700 trays of peaches in note 15. The guard removed it and retained the factual onion receipt. On note 10 the guard removed an overlapping quarantine and flagged the distribution for review.
- For note 12 the model emitted a tiny positive distribution quantity, `1e-15`, despite the zero dispatch. Its evidence showed the dispatch zero and a separate observed zero in a single quote. The numeric guard left it in the draft. The guard also retained an adjustment proposal based on the physical count in note 19.
- The guard filtered five movements in total, including two exact matches whose evidence failed grounding. Precision rose from 25/39 to 23/34 while recall fell from 25/32 to 23/32. Eight of ten ambiguity fixtures still had no explicit flag after guarding. [Offline device JSON](evidence/g51/device.json)

### Cloud failure modes

- Both tomato tallies in note 08 became separate ambiguous receipt proposals for a single event. Note 18 also produced two ambiguous candidates for one distribution. The candidates contributed four of five movement false positives under the single-event fixtures.
- The remaining false positive used the unit `individual` for `individual pears`. The model returned no movement for the unknown-direction yogurt in note 28 and no explicit movement flag for notes 06, 16, 23, or 28. The sanitizer left the scored cloud movements and flags unchanged. [Paced cloud JSON](evidence/g51/cloud.json)

## Five-note spreadsheet comparison

Codex operated both interfaces through desktop Chrome. In a prepared private Google Sheets scratch sheet, the timed step navigated to a row, pasted manually transcribed cells, and checked the selected range. Formulas used a supplied baseline of 24 bags for notes 25 and 30 and left the baseline blank for notes 19 and 20. On the app side, timing started at note entry and ended at the **Copied** status after extraction, review, and any available fallback. Setup and reset took place outside the timers. The app timings include operator and tool pauses, and the spreadsheet timings exclude reading and preparing the row before pasting. Treat these as pilot measurements for one agent operator with different timing boundaries. [Timing JSON](evidence/g51/spreadsheet-timing.json) · [Verified spreadsheet rows](evidence/g51/spreadsheet-rows.csv)

| Note | Spreadsheet | PantryRelay | App outcome |
| --- | ---: | ---: | --- |
| 06 · Missing unit | 5,193 ms | 26,432 ms | Approval blocked. The handoff omitted the clarification. |
| 19 · Missing baseline | 4,616 ms | 39,877 ms | Approved the receipt, rejected a false adjustment, and confirmed the count. The demo baseline yielded 41 usable and a discrepancy of 22. |
| 20 · Beans shelf count | 4,636 ms | 79,580 ms | Device deadline elapsed before the observation and recount reached review. |
| 25 · Distribution and quarantine | 5,150 ms | 114,140 ms | After the deadline, manual approvals yielded 16 usable. Without a manual count form, the handoff omitted the discrepancy of 1. |
| 30 · Negated receipt | 4,600 ms | 82,083 ms | After the deadline, manual distribution yielded 20 usable. The handoff omitted Mo's follow-up. |
| Median, five trials | 4,636 ms | 79,580 ms | |
| Total, five trials | 24,195 ms | 342,112 ms | |

The three 60-second deadlines occurred in the separate incognito workflow pilot after the completed 30-note device batch. The batch evidence records a successful response for each of those same notes. Notes 25 and 30 used the UI's manual movement fallback, and all approvals stayed offline.

## Build and hosting

The final Vite build emits a 376.64 kB app entry, a 120.96 kB Firebase chunk, a 485.85 kB Firestore chunk, and a 23.28 kB lazy benchmark chunk before gzip. Workbox precaches seven entries, including the lazy benchmark chunk so the developer route can reload offline. Both live batch tabs loaded the same benchmark implementation before final chunk consolidation. The five paired workflow trials used the final chunk layout. Hosting is configured for `dist`, SPA fallback, and revalidation of the app shell and service worker. [Build log](evidence/g51/build.txt) · [Hosting config](../firebase.json)

All four commands exited 0. TypeScript emitted no output. [Unit test output](evidence/g51/npm-test.txt) · [TypeScript output](evidence/g51/typecheck.txt) · [Build output](evidence/g51/build.txt) · [End-to-end output](evidence/g51/test-e2e.txt)

## Release review

| Severity | Reproduction | Smallest follow-up | Owner | Release decision |
| --- | --- | --- | --- | --- |
| High | Device notes 12 and 19 retain a near-zero dispatch and an adjustment inferred from a shelf count after guarding. | Add a review blocker for conflicting quantity evidence and count-only movement proposals. | Extraction maintainer | Keep human approval mandatory and show draft evidence when demonstrating extraction. |
| High | In the rice workspace, note 19 still uses the sample opening balance even though the note says the shelf has no opening count. | Allow a new shelf or session without the sample baseline. | Workflow maintainer | Reproduce missing-baseline handling with the independent fixture or the beans workspace. |
| High | Three of five separately timed workspace extractions reached the device deadline, and fallback could only record movements. | Add a manual shelf-count entry alongside the existing manual movement path. | Workflow maintainer | Disclose the observed deadlines and fallback limits in the demo. |
| Medium | Back-to-back cloud requests hit quota in the first 30-note run. | Space benchmark batches and retain service errors in the exported results. | Benchmark operator | Use paced results for the model comparison and publish the unpaced results alongside them. |
