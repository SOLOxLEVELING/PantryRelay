# PantryRelay G1.2

Minimal React + Vite + TypeScript feasibility spike for real Firebase AI Logic hybrid structured extraction. This is an unstyled diagnostic harness, not the PantryRelay product UI. See [the feasibility report](docs/FEASIBILITY.md) for actual results and limitations.

## Run locally

1. Use Node 24 and run `npm ci`.
2. In Firebase Console, register a Web App, complete **AI Logic → Get started → Gemini Developer API**, and enforce App Check for AI Logic.
3. Register reCAPTCHA Enterprise for the Web App. Copy `.env.example` to `.env.local` and fill in the six Firebase configuration values and Enterprise site key.
4. For localhost, set `VITE_APPCHECK_DEBUG_TOKEN` to a debug token registered for that Web App in Firebase App Check. The debug token is assigned before App Check initialization, including in production-mode `vite preview`. Without a supplied token, `npm run dev` can generate one; its SDK log is redacted, so prefer supplying a registered token.
5. Run `npx tsc --noEmit`, `npm test`, `npm run build`, then `npm run preview`.
6. Open `http://localhost:4173/` in desktop Chrome. Click **Refresh diagnostics / App Check**, then **Preload device model via Firebase**. Both inference and preload use `firebase/ai`.

`.env.local`, generated `dist`, and dependencies are ignored by git. Vite embeds `VITE_*` values in bundles: keep debug builds local and rebuild without the debug token before distributing a build. Debug builds refuse to run on non-localhost origins.

## Enable ledger sync

In the same Firebase project, create the default Cloud Firestore database and enable **Authentication → Sign-in method → Anonymous**. Publish the repository's `firestore.rules` in **Firestore → Rules**. The rules allow each authenticated user to read and create events in their own workspace. Ledger updates and deletes are denied.

Use `npm run preview` and wait for **App shell Cached offline** before testing a reload with DevTools set to Offline. Use Chrome's standard reload so the service worker can serve the app. Reconnecting retries queued approvals automatically. You can also use **Sync now** or **Retry sync**. **Synced** appears after Firestore acknowledges the event.

## Reproduce the spike

- Run the golden note in `ONLY_IN_CLOUD` while online, then `PREFER_ON_DEVICE` while online.
- Wait for service-worker control and model availability `available`. In DevTools Network, choose **Offline**, reload normally, and verify the document/scripts are served by the service worker.
- Select `ONLY_ON_DEVICE`, run the golden note, then run all ten synthetic notes. Keep DevTools open and Offline throughout. Restore **No throttling** when finished.
- Download the attempt evidence before reloading: the spike keeps its attempt list only in memory. The JSON contains note text, mode, online state, timestamp, raw SDK source, duration, raw response, parsed response, and errors. It never includes App Check token values.

## G1.2 guarded drafts

`parsed` and `rawParsed` retain the exact Zod-validated SDK payload. `sanitized` is a separate draft; `quarantined` retains removed records and reasons. The sanitizer normalizes nullable placeholders, checks normalized evidence spans and attack context, suppresses repeated movements, rejects contradictions to single numeric literals in evidence, and holds possible double losses from explicit damage/distribution inclusion. It does not fill missing quantities, item names, or assignees.

Empty or whitespace-only notes return `SKIPPED_EMPTY`, `UNKNOWN`, zero latency, no raw SDK payload, and an empty sanitized draft. The empty case is an intentional skip, so the ten-note offline set contains nine actual SDK requests.

Use **Cloud check: golden x3 + overlap + injection** to test repeatability for the selected cloud model. All calls still use Firebase AI Logic. Gemini 2.5 model IDs remain available in this spike selector for comparison, but this project returned HTTP 404 for both; see the feasibility report.

The runner stops device batches on prompt-format errors, model crashes, or two consecutive 60-second deadlines. Schema PASS describes raw structure, not factual correctness or approval. Every sanitized row still needs human review.

Each extraction has a 60-second deadline. The signal is supplied through Firebase's cloud request options and on-device `createOptions.signal`. The on-device session is aborted after completion or timeout to release resources. A timeout is recorded as no SDK response, with source `UNKNOWN`.

The raw SDK source values in Firebase 13.4.0 are `on_device` and `in_cloud`. The result contract maps these to `ON_DEVICE` and `IN_CLOUD` and displays both. A valid schema is not proof that the extracted facts are correct; inspect the raw and parsed JSON.
