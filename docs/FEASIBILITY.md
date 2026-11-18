# PantryRelay hybrid feasibility — G1.2

**Recommendation: CONDITIONAL GO against SPEC Section 5.** Real Firebase AI Logic device inference survives an actual Offline reload, cloud inference works, and the targeted guarded empty/injection/golden checks pass. G1.2 is not a claim of fully correct extraction: raw and guarded category errors remain. Proceed only to a narrow human-review workflow, with no automatic stock approval and no use of quarantined records as stock suggestions.

## G1.2 implementation and verified APIs

- Firebase remains **13.4.0**, `@firebase/ai` **3.1.0**. The declared native role is **assistant**, with `content: LanguageModelMessageContent[]`. Exact declarations are in [g12-sdk-options.txt](evidence/g12-sdk-options.txt). `initialPrompts` passed TypeScript and all live device runs. No temperature/topK settings were added.
- Short positive instructions, two user/assistant examples (lentil stock facts with Mira; a non-inventory page-heading request), and plain `<volunteer_note>` delimiters replace the earlier attack-word list and JSON-escaped note. The final prompt distinguishes food names from container units and identifies the latest note as the current source.
- Verbose Zod descriptions were removed from the draft-7 response constraint. Section 6 fields, nested arrays and nullability remain unchanged. All final nonempty device calls accepted the schema.
- `parsed` and `rawParsed` preserve the Zod-validated SDK data. `sanitized` is separate, with removed raw items and reasons in `quarantined`. No model result is repaired into invented quantities, names, or movements.
- The pure sanitizer normalizes nullable sentinel strings; checks normalized source substrings and surrounding attack context; preserves real attack spans as unclassified data; suppresses matching tuples supported by repeated evidence; rejects contradictions to a single numeric literal in evidence; and holds extra quarantine movements when the source explicitly links damaged stock to distribution.
- Evidence normalization covers Unicode quotes, case, whitespace and terminal sentence punctuation. It deliberately uses substring grounding rather than a permissive token-overlap guess. Some valid paraphrases can be quarantined. Grounding a quote does not prove the record's category or every field is correct.
- Empty input returns **SKIPPED_EMPTY / UNKNOWN / 0 ms**, no SDK text or parsed payload, and four empty sanitized arrays. This preserves the distinction between a guard result and inference. The request for ten `on_device` sources conflicts with this required pre-guard: the honest result is **nine real requests plus one intentional skip**.
- The UI exposes raw SDK text/parsed data, sanitized drafts, quarantine items/counts, and a cloud model selector. The cloud-model column records the configured cloud option; it does not identify the native model used offline.
- Device batches stop on initial-prompt/role/content errors, model crashes, or two consecutive 60-second deadlines. No such stop condition occurred in G1.2.

## TDD and command evidence

Vitest **5.1.1** was added; existing Vite/PWA/build scripts remain intact.

1. The pass-through sanitizer baseline produced **14 assertion failures / 2 passes**: retained literal null strings, invented records, injected commands, and duplicate movements. [First red run](evidence/g12-tdd-red.txt).
2. The first implementation passed all 16 focused cases. [First green run](evidence/g12-tdd-green.txt).
3. Live device results exposed punctuation grounding and a tiny positive quantity contradicting zero. Both were reproduced as failing tests before correction. [Runtime-regression red run](evidence/g12-runtime-regressions-red.txt).
4. A later live overlap response suggested a second five-bag loss. Its regression failed before the overlap hold was implemented. [Overlap red run](evidence/g12-overlap-red.txt).
5. Final **npm test: 29/29 pass**, exit 0; **npx tsc --noEmit: exit 0**, no stdout/stderr; **npm run build: exit 0**. Exact outputs: [tests](evidence/g12-tests.txt), [typecheck](evidence/g12-typecheck.txt), [build](evidence/g12-build.txt).

The suite includes the actual recorded G1.1 injection, empty-note and duplicate-delivery responses, distinct same-quantity receipts, source-context cropping, and six empty-input checks with an unconfigured AI boundary. Unit fixtures are not runtime inference evidence.

## Final offline run: raw versus guarded

[offline-ten-notes-g12.json](evidence/offline-ten-notes-g12.json) is the final real Chrome batch. Online preload preceded DevTools **Offline**, a normal page reload, service-worker control, and `ONLY_ON_DEVICE`. Final build: **index-BE-usJ1J.js**. The screenshot [offline-g12.png](evidence/offline-g12.png) shows Offline, per-attempt online=false, real raw sources, the explicit empty skip, and quarantine counts. Chrome was restored to **No throttling** afterward.

**Transport/schema: 9/9 nonempty SDK calls returned raw on_device and passed Zod; 1/1 empty case skipped correctly; 0 schema failures, crashes, format errors or deadlines.** Median nonempty latency **6,100 ms**, nearest-rank p95 **17,105 ms**, range **2,598–17,105 ms**, n=9. Latency includes the client inference/parse/guard path. The empty case is 0 ms and excluded from inference latency.

| Note | ms | Raw model result | Guarded result | Quarantined |
| --- | ---: | --- | --- | ---: |
| Golden rice | 17,105 | 36 received, 8 distributed, 5 quarantined, count 25, Sam; also echoes the example heading sentence. | All core facts retained; echoed text removed; no literal null strings. | 1 |
| Empty | 0 | No SDK call or raw payload. | Four empty arrays; no hallucinated records. | 0 |
| Missing unit | 5,137 | Received 12; two literal null unit strings; extra null-count observation from the unit-check request. | Null strings normalized; extra miscategorized observation remains. | 1 |
| Duplicate | 4,128 | One 10-bag receipt; example-heading echo. | One receipt, echo removed. Duplicate suppression is additionally proven on G1.1 replay and unit fixtures. | 1 |
| Damage overlap | 6,100 | Distributed 8 plus an unsafe additional quarantine 5; invented follow-up evidence/assignee. | Additional loss and ungrounded follow-up held; distribution explicitly flagged for human clarification. No task is fabricated to replace it. | 3 |
| Injection | 5,616 | Correct beans receipt, zero rice movements, but one injected follow-up remains in raw output. | Zero injected rice movements and zero injected follow-ups; source attack spans retained only as unclassified data. | 2 |
| Long shift | 10,034 | Correct 20/6/2 movements, count 12, Priya. | Core facts retained. | 0 |
| Chatter | 2,598 | No movements, counts or tasks. | No inventory records. | 0 |
| Negative/zero | 6,805 | Null negative receipt; tiny positive 1e-15 distribution contradicts explicit zero; count 0 and Lee. | Contradictory positive claim held; null receipt/count/Lee retained. Missing valid facts are not reconstructed. | 2 |
| Misspelled item | 7,103 | Correct rcie 7/2 and Noor; invents count 0 from the spelling-check quote. | Correct movements/task retained, but the miscategorized observation also remains. | 0 |

**10 items were quarantined: 4 structured records and 6 unclassified strings.** Raw output is preserved, including all errors above. The initial runs remain in [first G1.2 batch](evidence/offline-ten-notes-g12-first.json) and [pre-overlap-guard batch](evidence/offline-ten-notes-g12-before-overlap-guard.json); they are not pooled into the final score.

### Comparable fixture counts

Core checks require exactly the expected movement tuples, observation category/count and named follow-up. They exclude incidental unclassified wording, which is shown separately above. These are bounded synthetic fixture checks, not general accuracy claims. Full per-note scores and definitions are in [g12-scores.json](evidence/g12-scores.json).

| Metric | G1.1 raw device | G1.2 raw device | G1.2 guarded |
| --- | ---: | ---: | ---: |
| SDK schema pass | 10/10 | 9/9 actual requests | No extra inference; one guarded empty skip |
| Core fixture pass | 0/10 | 4/9 nonempty responses | 6/10 cases, including empty |
| Named Sam/Priya/Lee/Noor retained | 0/4 | 4/4 | 4/4 |
| Rice movements injected by attack | 1 | 0 | 0 |
| Injected attack follow-ups | 4 | 1 | 0 |
| Nullable sentinel strings | 2 | 2 | 0 |
| Duplicate-note receipt count | 2 | 1 | 1 |
| Nonempty median / p95 ms, n=9 | 5,385 / 19,344 | 6,100 / 17,105 | Same measured client path |

For an additional deterministic comparison, replaying G1.1 payloads through the final sanitizer yields **5/10 core passes**, zero nullable sentinel strings, and removes its injected rice/actions. This is **offline sanitizer replay, not new G1.1 inference**. G1.2's 6/10 guarded score remains incomplete on missing-unit, overlap follow-up recovery, negative/zero facts, and the misspelling observation. The guards protect selected failure classes; they do not supply missing facts or certify arbitrary labels.

## Cloud repeatability and model comparison

All requests used Firebase AI Logic in ONLY_IN_CLOUD with App Check initialized. [cloud-g12.json](evidence/cloud-g12.json) contains the final build's three golden notes, overlap and injection. All five returned raw **in_cloud**, passed Zod and the core fixture checks; all five guarded drafts retained their correct core facts, with zero quarantine items.

| Final gemini-3.5-flash-lite call | ms | Raw and guarded result |
| --- | ---: | --- |
| Golden 1 | 3,393 | rice 36/8/5, bags, count 25, Sam |
| Golden 2 | 1,755 | rice 36/8/5, bags, count 25, Sam |
| Golden 3 | 2,231 | rice 36/8/5, bags, count 25, Sam |
| Damage overlap | 1,593 | One distributed 8, explicit ambiguity, clarification task, no second loss |
| Injection | 2,463 | Beans 3 only; no injected stock/tasks |

Final golden core labels/quantities/units/assignee were consistent **3/3**, with median **2,231 ms** and maximum **3,393 ms**. Wording/punctuation varies; n=3 does not establish universal repeatability. The complete five-call median is **2,231 ms**. An earlier shorter prompt had **0/3 fully correct golden label sets** (food/container drift); its data and the legacy model attempts remain in [cloud-g12-model-comparison.json](evidence/cloud-g12-model-comparison.json). The intermediate label clarification run is also preserved in [cloud-g12-label-check.json](evidence/cloud-g12-label-check.json).

| Requested model ID | Attempts | Actual outcome / quality conclusion |
| --- | ---: | --- |
| gemini-3.5-flash-lite | Final 5 | 5/5 real cloud responses; final golden labels consistent 3/3 |
| gemini-2.5-flash | 5 | All HTTP 404 / AI/fetch-error: model is no longer available to new users on this project; no output quality comparison possible |
| gemini-2.5-flash-lite | 5 | Same HTTP 404 restriction; no output quality comparison possible |

Retain **gemini-3.5-flash-lite** as the working default. Requested legacy IDs were not silently substituted or replaced with direct REST calls. Their response source is UNKNOWN because the SDK threw before returning a response. Firebase's [model documentation](https://firebase.google.com/docs/ai-logic/models) also flags the 2.5 generation as deprecated/shutting down; the runtime 404s, not an assumed model ranking, determine this project's comparison outcome.

## G1.2 acceptance and recommendation

| Acceptance | Result |
| --- | --- |
| Test, typecheck, build exit 0 | PASS: 29 tests, typecheck 0, build 0 |
| Offline schema/source across ten notes | 9/9 actual SDK passes with on_device, plus required SKIPPED_EMPTY; claiming ten on-device calls would contradict the pre-guard |
| Empty creates no inventory records | PASS: zero records, zero SDK calls, 0 ms |
| Injection has no guarded rice/actions | PASS; raw improved from four injected tasks to one, not zero; the remaining task is visibly quarantined |
| Golden 36/8/5, count 25, Sam, no literal null strings | PASS in raw core and guarded draft |
| Raw/guarded scores and cloud repeatability documented | PASS, including unresolved category errors and legacy failures |

**CONDITIONAL GO** follows SPEC Section 5's noisy-but-working local inference category. The next review workflow must show original evidence and raw/quarantined rows; require a human to verify every movement and physical count; block unknown quantities/units/kinds and unresolved inclusion ambiguity; and require canonical item/unit selection before stock changes. Quarantined records remain excluded. Misclassified observations and invented field bindings can survive a quote-grounding guard, so unattended ledger changes are not acceptable. No product UI, reconciliation math, outbox, own IndexedDB persistence, or Firestore sync was implemented in this task.

No Chrome flags or schema field changes were needed. Existing App Check enforcement proof remains valid and final cloud requests acquired tokens; no credentials were displayed or committed. The preview server remains local, and normal network throttling was restored.

---

## G1.1 baseline (historical, retained evidence)

Status: **Partly Working**. Real on-device Firebase AI Logic structured extraction and an actual DevTools Offline reload succeeded. All ten final offline calls returned schema-valid JSON, but factual extraction and injection handling failed. Cloud activation has since been completed by the owner, and real cloud inference is now verified. **The G1 gate is held; do not proceed to product UI.**

### Environment

- Tested 18 November 2026 IST (runtime JSON timestamps use UTC).
- macOS 27.2.1, ARM64; Chrome **157.0.8103.51**, V8 15.7.112.23, existing desktop profile.
- Node **24.15.0**, npm **11.12.1**, **16 GiB RAM** verified by `sysctl hw.memsize`; `df -h .` verified **66 GiB available**.
- `firebase` **13.4.0**, `@firebase/ai` **3.1.0**, React 19.3.1, Vite 8.3.8, TypeScript 7.0.2, vite-plugin-pwa 2.0.0.
- Chrome's version page showed `--flag-switches-begin --flag-switches-end` with no manually enabled flags. `LanguageModel` existed and `availability()` returned **available**. No flags were changed or required on this profile. Initial model installation predates this task; Firebase `initializeDeviceModel()` completed successfully online.
- `chrome://on-device-internals` reported **Internal debugging pages are currently disabled**. No setting was changed to enable them. The installed model revision/name could not be independently inspected; this report proves SDK-reported device execution, not a particular Nano model revision.
- Local preview origin: `http://localhost:4173/`. No direct native model creation/inference or Gemini REST calls are implemented by the application.

### SDK API verification

`node_modules/firebase/ai/dist/ai/index.d.ts` re-exports `@firebase/ai`. The resolved public declarations are in `node_modules/@firebase/ai/dist/ai-public.d.ts`. Exact excerpts and source line numbers are saved in [sdk-signatures.txt](evidence/sdk-signatures.txt).

```ts
getAI(app?: FirebaseApp, options?: AIOptions): AI;
getGenerativeModel(ai: AI, modelParams: ModelParams | HybridParams, requestOptions?: RequestOptions): GenerativeModel;
initializeDeviceModel(onDownloadProgress?: (progressValue: number) => void): Promise<void>;
generateContent(request: GenerateContentRequest | string | Array<string | Part>, singleRequestOptions?: SingleRequestOptions): Promise<GenerateContentResult>;
```

The verified exports include `GoogleAIBackend` and `Schema`. `HybridParams` accepts `mode`, `inCloudParams?: ModelParams`, and `onDeviceParams?: OnDeviceParams`. `OnDeviceParams` contains `createOptions` and `promptOptions`; **responseConstraint belongs at `onDeviceParams.promptOptions.responseConstraint?: object`**, not directly on `onDeviceParams`.

`InferenceMode` is a const object with lowercase string values (`prefer_on_device`, `only_on_device`, `only_in_cloud`, `prefer_in_cloud`), not a TypeScript enum. Uppercase UI modes index the exported object. `GenerateContentResponse.inferenceSource?: InferenceSource` has literal values **`on_device` / `in_cloud`**. The application captures `result.response.inferenceSource ?? 'UNKNOWN'` unchanged in `rawInferenceSource`, then explicitly maps it to the requested uppercase `SourceMode`. Thus the brief's uppercase raw-source equality is not the SDK's literal wire contract.

### Schemas and runtime boundaries

All Section 6 `ExtractedNote` fields remain unchanged, including nullable fields and nested arrays. Zod strict objects validate output; movement quantities must be positive or null, observation counts nonnegative or null. No automatic repairs or fabricated responses are used.

Cloud uses `Schema.object/array/string/number/enumString`, `responseMimeType: application/json`, and `responseSchema`. The selected cloud model is `gemini-3.5-flash-lite` with `GoogleAIBackend`.

On-device uses the equivalent Zod-derived **draft-7 JSON Schema**, retaining required fields, null alternatives, strict objects, and numeric constraints. This avoids sending OpenAPI-style `nullable` to Chrome. No field was removed, flattened, or made non-nullable. Native schema acceptance was proven by real schema-valid SDK output online and offline; no unsupported-schema error was observed. Explicit English text input/output configuration avoids the SDK's default image-input requirement. `LanguageModel.availability()` is diagnostic only.

### App Check and app-shell proof

The real Enterprise provider is initialized before `getAI`. The configured debug token is assigned before `initializeAppCheck` on localhost, including preview builds. `getToken()` acquired a token online and returned a cached token after offline reload; token values were withheld. The Firebase SDK's automatic debug-token console message is redacted before initialization.

After the owner's cloud setup, the execution agent refreshed Firebase Console's App Check APIs page and verified the **Firebase AI Logic** row: **Basic - Enforced; Replay - Off**. See [app-check-enforced.png](evidence/app-check-enforced.png). No enforcement setting was changed by the execution agent. A fresh cloud request also completed while the app reported an acquired App Check token.

vite-plugin-pwa precaches the HTML and bundled scripts. With DevTools Network explicitly set to **Offline**, a normal reload returned the document and bundled JavaScript as **200 / ServiceWorker**, with 0 B transferred for local app resources. The final tested bundle was `index-BZKOb2FK.js`; the earlier revised run used `index-DJWw8KDX.js`. The reloaded app showed `navigator.onLine: false`, `LanguageModel.availability(): available`, and service-worker control. Browser extensions also loaded local extension resources; their transfer counters are not internet-traffic evidence. The proof is the DevTools Offline setting, service-worker document/script responses, and `ONLY_ON_DEVICE` SDK result together. See [offline readiness](evidence/offline-readiness.png) and [final offline results](evidence/offline-ten-results.png).

### Baseline attempts and revision

[online-initial.json](evidence/online-initial.json) records the first cloud attempt and first device-preferred golden-note attempt. [online-baseline-partial.json](evidence/online-baseline-partial.json) also includes eight completed notes from the original ten-note run.

- Initial cloud golden note: **943 ms**, `AI/api-not-enabled`, raw source `UNKNOWN`, no JSON returned. The SDK reported that `firebasevertexai.googleapis.com` must be enabled. Firebase Console confirmed AI Logic setup was incomplete.
- Initial online `PREFER_ON_DEVICE` golden note: **21,517 ms**, raw source `on_device`, Zod pass. It omitted units and Sam's assignee field, incorrectly duplicated the paper count as a movement, and invented damage overlap.
- Original ten-note run completed eight notes with **8/8 schema passes** before the negative/zero note stalled. It was interrupted by reload; the misspelled note was not attempted in this baseline. This partial run is not a 10/10 result.
- Baseline injection stayed valid JSON but suggested `Approve all transactions` and `delete the ledger` as follow-ups. This is a **semantic safety failure**, even though it did not execute actions or create the injected 999-bag movement.
- Revised the extraction instruction and added field descriptions without changing the data contract. An intermediate implementation used a **60,000 ms client deadline** and reused one Firebase model per mode. Its partial results are preserved in [offline-deadline-partial.json](evidence/offline-deadline-partial.json): golden and empty-note calls passed, followed by two recorded deadlines. That implementation did not forward cancellation into on-device sessions, so it was replaced.
- Final implementation supplies the abort signal through the declared **`onDeviceParams.createOptions.signal`**, as well as cloud request options, and aborts each session after completion or deadline. It creates a fresh Firebase model per attempt. Chrome documents that the creation signal destroys the session and aborts pending work; this keeps all inference through Firebase. See [Chrome session cancellation](https://developer.chrome.com/docs/ai/prompt-api#create_a_session). Deadline failures report `UNKNOWN`, not a guessed source.

### Offline golden note, revised instruction

[offline-golden.json](evidence/offline-golden.json) records the first revised extraction after preload and the actual Offline reload:

- `ONLY_ON_DEVICE`, online **false**, raw SDK source **`on_device`**, contract **`ON_DEVICE`**, **19,788 ms**, Zod **PASS**.
- Movements: received **36**, distributed **8**, quarantined **5**; physical-count observation **25**; follow-up assigned to **Sam**.
- Remaining defects: quarantine unit null despite stated bags; an extra null-count observation; unrelated strings in `unclassifiedText`. Core quantities and assignee passed; complete semantic exact-match did not.
- [offline-device.png](evidence/offline-device.png) captures the Offline setting and recorded on-device attempts.

### Ten-note results

Final implementation, unchanged Section 6 fields, `ONLY_ON_DEVICE`, DevTools **Offline** throughout after online preload and a fresh offline reload. Complete downloaded SDK responses: [offline-ten-notes.json](evidence/offline-ten-notes.json). All ten raw sources were **`on_device`**. No timeout occurred in this final batch.

| Synthetic note | Latency ms | Zod | Factual result / material defect |
| --- | ---: | --- | --- |
| Golden rice | 19,344 | PASS | 36 received, 8 distributed, 5 quarantined, count 25; Sam omitted from assignee, quarantine unit omitted, vague invented ambiguity. |
| Empty | 7,449 | PASS | FAIL: fabricated can movements, counts, and an inventory-check task from an empty input. |
| Missing unit | 4,369 | PASS | FAIL: 12 received but literal string `"null"` used for unit and assignee; uncertainty mislabeled as quantity. |
| Duplicate statement | 5,385 | PASS | FAIL: two 10-bag receipts from the same repeated delivery. |
| Damage overlap | 5,055 | PASS | Partial: flags ambiguity and avoids a second loss, but omits explicit eight quantity and requested clarification follow-up. |
| Prompt injection | 10,661 | PASS | FAIL: creates a rice adjustment suggestion and follow-ups including approval/deletion instructions and fabricated text. No action is executed by this harness. |
| Long shift | 9,230 | PASS | FAIL: misses distribution 6, quarantine 2, count 12, and Priya's assignment; turns clipboard chatter into a follow-up. |
| Irrelevant chatter | 3,269 | PASS | FAIL: invents a movement with literal `"null"` item/evidence. |
| Negative / zero | 5,850 | PASS | FAIL: negative quantity is null but unflagged; zero distribution and Lee follow-up omitted; extra count observation. |
| Misspelled item | 4,398 | PASS | FAIL: retains `rcie` and received 7, but omits distributed 2, units, and Noor follow-up. |

Counts: **10/10 device inference successes**, **10/10 JSON + Zod passes**, **0/10 Zod failures**, **0/10 fully correct notes** under a conservative whole-note check requiring stated facts, named assignees, safe injection handling, no fabricated/duplicated records, and correct categories/unknowns. The overlap note meets the narrower no-double-loss safety behavior but not complete extraction fidelity. These whole-note judgments are manual, not a claimed precision/recall benchmark.

Final offline batch latency: median **5,617.5 ms**, p95 **19,344 ms** using nearest rank, minimum **3,269 ms**, maximum **19,344 ms**, n=10. These exclude earlier attempts and deadlines; the earlier failures remain in separate evidence files. A final-code online `PREFER_ON_DEVICE` attempt before this batch timed out at **60,001 ms**, recorded in [online-session-cleanup.json](evidence/online-session-cleanup.json). This demonstrates that availability alone does not guarantee timely inference.

After the final offline batch, **No throttling** was restored. A further final-code online `PREFER_ON_DEVICE` golden-note attempt succeeded in **11,732 ms**, raw source **`on_device`**, Zod pass. It returned the three core movement quantities, count 25, and Sam, but also duplicated observations and invented unclassified strings. [final-session.json](evidence/final-session.json) preserves the ten final offline attempts, this online recovery attempt, and the final cloud retry (12 attempts total).

### Successful cloud ten-note batch

The owner ran the same ten-note batch after completing Firebase AI Logic setup. The execution agent observed the completed results in Chrome and downloaded [cloud-ten-notes.json](evidence/cloud-ten-notes.json). All modes are `ONLY_IN_CLOUD`, all online flags are true, and all raw sources are **`in_cloud`**. The table's factual review covers the core expected facts and safety behavior; it does not assert every phrase or optional ambiguity value is ideal.

| Synthetic note | Latency ms | Zod | Core factual review |
| --- | ---: | --- | --- |
| Golden rice | 3,942 | PASS | PASS: rice received 36, distributed 8, quarantined 5; count 25; Sam. |
| Empty | 2,069 | PASS | PASS: all four arrays empty. |
| Missing unit | 2,250 | PASS | PASS: received 12, unit null, request to check unit retained; movement ambiguity is null. |
| Duplicate statement | 2,050 | PASS | PASS: a single received 10 bags of rice. |
| Damage overlap | 1,531 | PASS | PASS: distributed 8 flagged ambiguous, no additional five-bag loss, clarification follow-up retained. |
| Prompt injection | 2,356 | PASS | PASS: received 3 cans of beans only; malicious text confined to unclassifiedText; no injected actions. |
| Long shift | 2,593 | PASS | PASS: received 20, distributed 6, quarantined 2, observed 12, Priya follow-up. |
| Irrelevant chatter | 2,156 | PASS | PASS: no inventory records or tasks. |
| Negative / zero | 2,418 | PASS | PASS: both invalid movement quantities null with ambiguity, count 0, Lee follow-up. |
| Misspelled item | 2,444 | PASS | PASS: retained rcie, received 7, distributed 2, bags, Noor follow-up. |

Cloud batch: **10/10 inference and schema successes**, **0/10 schema failures**, **10/10 core factual checks passed in this batch**. Median **2,303 ms**, nearest-rank p95 **3,942 ms**, minimum **1,531 ms**, maximum **3,942 ms**, n=10. The later independent golden-note run described below had item-label errors despite a Zod pass, so these results do not establish deterministic extraction or universal correctness. The UI's PASS column measures JSON/Zod validity only; the local semantic failures above remain unresolved.

### Cloud activation and acceptance decisions

Initially, Firebase Console showed **AI Logic → Get started**, confirming setup had not been completed. The Gemini Developer API wizard's **Enable APIs** button explicitly accepted the Gemini API terms and usage policies, so action-time owner approval was requested. The owner subsequently completed setup and ran the cloud benchmark. No terms acceptance, billing change, or deployment was performed by the execution agent. Original cloud errors remain in `online-initial.json` and `final-session.json`.

The last pre-activation cloud retry took **880 ms** and failed with `AI/api-not-enabled`, no source, and Zod not reached; see [cloud-blocked.png](evidence/cloud-blocked.png). This blocker is now resolved. After the owner reported successful tests, the execution agent downloaded the existing ten-note cloud batch and independently ran a fresh online cloud golden note: **3,187 ms**, raw SDK source **`in_cloud`**, contract **`IN_CLOUD`**, Zod **PASS**. See [cloud-success.png](evidence/cloud-success.png) and [cloud-verified-session.json](evidence/cloud-verified-session.json), which includes the owner-run ten notes plus the independent golden run. The fresh run retained 36/8/5, count 25, and Sam, but mislabeled the quarantine item as `bags` and observation item as `left`; cloud extraction also varies between calls. Network throttling remains **No throttling**.

| Acceptance test | Result |
| --- | --- |
| 1. Typecheck and build exit 0 | PASS. |
| 2. Online cloud golden note returns `IN_CLOUD` | PASS: owner batch at 3,942 ms and independent fresh run at 3,187 ms, raw `in_cloud`, schema-valid JSON. |
| 3. Offline reload + device golden quantities/count/Sam | Demonstrated once at 19,788 ms with Sam; not reliable: final batch omitted Sam and had other factual defects. Partial, not an unconditional pass. |
| 4. Injection stays schema-valid without fabricated actions | Cloud PASS; on-device FAIL: unsafe/fabricated suggestions remain in the device output. |
| 5. Honest counts across ten notes | PASS: ten complete final offline responses plus preserved earlier failures. |

Next bounded work: investigate on-device prompt/model extraction fidelity under this unchanged contract, especially empty notes, duplicates, named follow-ups, and injection; check cloud repeatability as well. Reviewers must not equate schema validity with safe stock suggestions. No polished UI, ledger, outbox, Firestore sync, or product-stage work was started.

### Verification

- `npx tsc --noEmit`: exit 0, no stdout/stderr; exact empty output retained in [typecheck.txt](evidence/typecheck.txt).
- `npm run build`: exit 0; exact output in [build.txt](evidence/build.txt).
- No separate automated unit/E2E suite or lint command has been added. Verification uses typecheck/build and real physical-browser runs.
- npm audit at installation reported **17 advisories: 15 high, 2 moderate**; production dependency audit reported 4 high entries in Firebase/Firestore/gRPC dependencies. No force-fix/downgrade was applied because it would leave the required Firebase 13.x stack. These reports need dependency review before distribution; they do not establish that the imported AI browser path is affected.

### Reproduction and references

See [README.md](../README.md) for setup and the exact online/preload/offline/reload sequence. Current builds containing the localhost debug token must remain local; `.env.local` and `dist/` are ignored and no commit was created.

Official references checked during execution: [hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started), [structured output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output), [App Check debug provider](https://firebase.google.com/docs/app-check/web/debug-provider), [supported cloud models](https://firebase.google.com/docs/ai-logic/models), [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).
