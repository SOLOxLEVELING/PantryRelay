# G2.2 verification

Implemented Capture → Review → Reconcile as an in-memory volunteer workspace.
No commits created. No persistence, sync, auth, or cloud briefing added.
`spikeExtract.ts`, inventory contracts, seeds, reconciliation engine, and all
existing test files remain unchanged.

## Files

- `src/hooks/usePantryWorkflow.ts`: workflow actions, real Firebase extraction,
  model preloading, network/app-shell/App Check readiness. Browser listeners stay
  in the hook. Retains verbatim note text and SDK inference source/latency.
- `src/lib/workflowState.ts`: pure reducer, immutable ledger approvals, review
  transitions, observation decisions, follow-ups, reset, and live reconciliation.
- `src/lib/workflowState.test.ts`: 21 workflow cases, including incomplete edits,
  golden arithmetic, rejection, manual recovery, immutable approval boundaries,
  stale results after reset, unit mismatch, and missing baseline.
- `src/components/{StatusBar,CapturePanel,ReviewPanel,ReconcilePanel}.tsx`: readiness,
  samples/privacy/loading, editable review, blocked content, approved stock math,
  observations, discrepancy actions, and follow-up tasks.
- `src/styles/app.css`: responsive off-white/ink workspace, muted green controls,
  amber clarification and red discrepancy states, visible keyboard focus.
- `src/App.tsx`, `src/main.tsx`: connected workflow and imported stylesheet.
- `index.html`: updated page title.

## Automated validation

All commands exited 0. Exact stdout/stderr are retained alongside this report:

- `npm-test.txt`: `npm test`; 5 files, 95 tests passed (74 existing + 21 new).
- `typecheck.txt`: `npx tsc --noEmit`; no output (empty file).
- `build.txt`: `npm run build`; production build and offline precache succeeded.
- `git-status.txt`: final `git status --short`.

`git diff --check` passed. `git diff --exit-code` on `spikeExtract.ts` and the
four original test files passed. The preview server already running on localhost
4173 was the repository's Vite preview process and served the new production
build. A second preview invocation correctly refused to bind the occupied port.

## Desktop Chrome observations

Used the installed desktop Google Chrome, production preview at
`http://localhost:4173/`, and DevTools Responsive viewport at 1440 × 1200 and
1024 × 1200 CSS pixels. Full-page PNGs were captured with Chrome's native
DevTools “Capture full size screenshot” command. The native desktop screenshot
API returned a black image, so the actual rendered Chrome page captures are used.

1. Offline: DevTools Network throttling set to Offline and app displayed Network
   Offline, App shell Cached offline, and On-device model Ready. Selected
   ONLY_ON_DEVICE with the unchanged Golden rice sample. Real Firebase SDK
   extraction reported Source: On-device (7.5 seconds). Reviewed and approved
   receipt 36, distribution 8, quarantine 5; confirmed the observation. UI showed
   `24 + 36 − 8 − 5 = 47 usable`, 5 quarantined, 25 bags observed, a 22 bag
   discrepancy, and Sam's open shelf-check task. See `offline-golden.png`.
2. Online: restored No throttling, selected ONLY_IN_CLOUD, and checked App Check
   (Verified). The Firebase AI Logic generateContent request returned HTTP 200;
   the UI reported Source: Cloud (9.0 seconds). Edited the proposed distribution
   from 8 to 10; UI labeled it Human-edited. Approved all three rows and confirmed
   the count. UI showed `24 + 36 − 10 − 5 = 45 usable` and a 20 bag discrepancy.
   See `cloud-edited.png` and `laptop-1024.png`.
3. Damage overlap: reset to 24, chose Damage overlap, and extracted through
   ONLY_IN_CLOUD (7.2 seconds). The distribution row displayed Needs clarification,
   its ambiguity text, and a disabled Approve button. Confirmed usable stayed 24,
   with one pending movement. See `blocked-ambiguity.png`. Checking “I resolved
   this clarification” changed the row to Human-edited and enabled approval.
   Rejected it instead: row showed Rejected / Excluded from stock, pending count
   became zero, and confirmed usable remained 24.
4. Console: final sidebar showed No errors / No warnings, with one informational
   Built-In AI message. See `console-check.txt` for the redacted console review and
   the earlier extension noise. No application uncaught exception was observed.

## Extraction repeatability limitation

The first two offline Golden rice attempts returned ungrounded evidence claims,
which the existing sanitizer correctly blocked. One distribution evidence span
claimed “gave out 8 bags of rice.” while the original says “gave out 8.”. Another
blocked output copied an irrelevant format-example sentence. The third real
attempt yielded all three valid movement rows. The successful screenshot still
shows one blocked unrelated item, collapsed and excluded from approvals.

No extractor, prompt, sanitizer, SDK source label, or AI result was changed to
obtain the successful run. This UI slice is verified; one-shot offline extraction
quality is not guaranteed. Manual entry remains available for incomplete or
unavailable extraction. This session does not add persistence, so reload clears
review/approved work as stated in the UI.

## Design review

The visual focus is the stock discrepancy beside the source note and approval
rows. Paper #F7F8F5, ink #23332E, green #426B5B, border #D9E0D9,
amber #8A5A15, red #A13D35. Avenir Next with local system fallbacks keeps all
assets available offline. Left-aligned capture above a wider review sheet and a
narrower reconciliation sheet keeps the three actual steps visible together.
Screenshots were inspected at both widths: controls, math, semantic text badges,
and discrepancy actions remain legible without page-level horizontal overflow.
