# PantryRelay

PantryRelay turns volunteer shift notes into reviewable inventory movements, shelf counts, and follow-ups. Volunteers approve each movement, compare the resulting balance with the shelf count, and copy a handoff for the next shift. Firebase AI Logic can extract drafts on supported desktop Chrome while offline or in the cloud while online. Manual movements and shelf counts work without inference.

## Hosted demo

[Open PantryRelay](https://pantryrelay-c3246.web.app/) in desktop Chrome and use the synthetic **Golden rice** sample. Desktop Chrome verified App Check, cloud extraction, Firestore sync, and Cloud Shift Briefing. With DevTools Network set to Offline, the cached app reloaded and completed on-device extraction. [Deployment and browser evidence](docs/evidence/g52/verification.md)

## Run locally

1. Install Node.js 24 and run `npm ci`.
2. In Firebase Console, register a Web App and set up **AI Logic → Get started → Gemini Developer API**. Confirm App Check enforcement for **Firebase AI Logic**. Under **App Check → Apps**, register the web app with a Google Cloud Fraud Defense reCAPTCHA Enterprise website score key. Use the same key in the app and add the Hosting hostname to that key's allowed domains. [Firebase App Check setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
3. Create the default Cloud Firestore database, deploy [`firestore.rules`](firestore.rules), and enable **Authentication → Sign-in method → Anonymous** in the same project.
4. Copy `.env.example` to `.env.local`. Fill in the six `VITE_FIREBASE_*` Web App values and `VITE_RECAPTCHA_SITE_KEY`. For localhost cloud tests, set `VITE_APPCHECK_DEBUG_TOKEN` to a registered App Check debug token for that same web app. Keep the file private. The debug token also applies to a localhost preview build. [Firebase debug provider](https://firebase.google.com/docs/app-check/web/debug-provider)
5. Run `npm run build` and `npm run preview`. Open `http://localhost:4173/`. While online, click **App Check → Check** and look for **Verified**. Use `npm run dev` on port 5173 for editing. Use the preview build for service-worker verification.

## Chrome and offline setup

Firebase documents support from **desktop Chrome 139 onward**. The G5.1 device run used **Chrome 157**. Chrome requires a supported OS, at least 22 GB free on the profile volume for eligibility, and either more than 4 GB VRAM or at least 16 GB RAM with four CPU cores. Use an unmetered connection for the initial download. [Firebase browser setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) · [Chrome requirements](https://developer.chrome.com/docs/ai/prompt-api) · [G5.1 evidence](docs/EVALUATION.md)

1. While online, open the app and click **Preload model** if needed. Wait for **On-device model Ready** and **App shell Cached offline**. If the model is unavailable on an otherwise eligible Chrome installation, follow the Firebase flag and restart instructions. The tested Chrome 157 profile already reported availability without manually enabled flags.
2. In Chrome DevTools **Network**, choose **Offline**. Reload normally. Check **Offline**, **Cached offline**, and **Ready**. Select **ONLY_ON_DEVICE**, then click **Extract changes**. A successful result displays **Source: On-device**. The Network panel should show the page served by the service worker.
3. Review the extracted values against the original note and confirm the shelf count. If extraction stalls or the device lacks the model, use **+ Add manual movement** and **+ Add shelf count** in Review. Set the item, count and unit for the observation, then click **Confirm count**.
4. For the golden note, approve 36 bags received, 8 distributed and 5 quarantined. With sample opening stock of 24, the ledger shows 47 usable. A count of 25 produces a discrepancy of 22. Keep it open or add a recount task, then **Copy shift handoff**.
5. Restore **No throttling** to retry pending ledger writes. Use **Sync now** or **Retry sync** if needed and wait for **Synced**. Try **ONLY_IN_CLOUD** and **Generate cloud briefing** online. Each successful cloud call displays **Source: Cloud** in its own panel.

## Tests

```sh
npm test
npx tsc --noEmit
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright serves the built app at `http://localhost:4175/` and covers manual entry, reconciliation, cached reload, and the handoff with external requests blocked. Use physical desktop Chrome for live AI checks. Open `/?benchmark=1` on the local preview for the [G5.1 synthetic evaluation](docs/EVALUATION.md).

## Production deploy

Build with the production project's Web App configuration and reCAPTCHA Enterprise site key in a private environment or ignored `.env.local`. Vite embeds `VITE_*` values in browser bundles. Use an explicit empty override when a local file contains a registered debug token.

```sh
VITE_APPCHECK_DEBUG_TOKEN="" npm run build
npx firebase-tools deploy --only hosting,firestore:rules --project <VITE_FIREBASE_PROJECT_ID>
```

Run the Firebase CLI under an account with Hosting and Firestore Rules deploy access. Verify the printed Hosting URL in a clean Chrome profile. Use the hosted **Check** button before testing cloud inference and sync. [Hosting configuration](firebase.json)

## Limitations

Use synthetic data in the demo. **PREFER_ON_DEVICE** may send the note to Firebase AI Logic if it falls back. **ONLY_IN_CLOUD** sends the note, and the optional cloud briefing sends structured shift data. Confirm all proposed quantities by hand. The G5.1 evaluation observed incorrect drafts, device timeouts, and cloud quota errors.

The workspace uses a sample rice baseline and a small catalog. Notes, counts, and tasks live in this browser's IndexedDB. Firestore mirrors approved movements for the anonymous user, and the app has no cross-device workspace recovery. PantryRelay has had no live pantry interviews.

[Architecture](docs/ARCHITECTURE.md) · [Research](docs/RESEARCH.md) · [Compliance](docs/COMPLIANCE_CHECKLIST.md) · [Demo and submission draft](docs/DEMO_AND_SUBMISSION.md)

## License

[Apache-2.0](LICENSE).
