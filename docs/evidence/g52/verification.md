# G5.2 release verification

## Local and deployment results

- `npm test` exited 0 with 123 tests passing in 9 files. The three new reducer cases failed before implementation because the new actions were unhandled. [Unit output](npm-test.txt)
- `npx tsc --noEmit` exited 0 with empty stdout and stderr. [TypeScript output](typecheck.txt)
- `npm run build` exited 0. [Build output](build.txt)
- `npm run test:e2e` exited 0 with 3 tests passing. Both offline golden paths entered and edited the count in the UI, then confirmed it, reconciled, copied the handoff, and reloaded from the service worker. No test wrote a shelf count directly to IndexedDB. [Playwright output](test-e2e.txt)
- `VITE_APPCHECK_DEBUG_TOKEN="" npm run build` exited 0. A scan of nine deployable text files found no copy of the registered localhost debug token. [Production build](production-build.txt)
- `npx --yes firebase-tools deploy --only hosting,firestore:rules --project pantryrelay-c3246` exited 0. Firebase compiled the rules and reused the matching current rules version when releasing Hosting and Firestore Rules. [CLI output](deploy.txt)

## Initial hosted Chrome result

[PantryRelay on Firebase Hosting](https://pantryrelay-c3246.web.app/) rendered in regular and Incognito Chrome. The Incognito workspace reported **On-device model Ready** and **Cached offline**. The online App Check button returned **FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).** Chrome DevTools showed **POST https://www.google.com/recaptcha/enterprise/clr 400 (Bad Request)**. [Redacted console record](console-check.txt)

The Fraud Defense key inspected in the project console already listed both Hosting domains. The key ID in that view differed from the key used by the deployed app, so that allowlist does not establish that the deployed key authorizes the domain. The owner later corrected the site key used in the build. The hosted recheck is recorded below. [Firebase Enterprise provider setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)

The first hosted workflow stopped at the App Check failure. Historical localhost results are recorded separately. [G5.1 evaluation](../../EVALUATION.md)

## Hosted recheck with the corrected site key

The owner updated the site key in the ignored local configuration. The production rebuild embedded the new site key. A bundle scan confirmed the local debug token was absent and the deployment released Hosting and Firestore Rules again. [Production rebuild](production-rebuild.txt) · [Redeploy output](redeploy.txt)

- **Online.** Chrome Incognito reported **App Check Verified**. The synthetic Golden rice note returned **Source: Cloud** in 22.3 seconds in `ONLY_IN_CLOUD`. The three verified movements and the shelf count reconciled to 47 usable bags, 5 quarantined, and a 22-bag discrepancy against 25 observed. **Sync now** advanced **Pending sync (3)** to **Synced (3)**. [Hosted online screenshot](hosted-online.png)
- **Cloud Shift Briefing.** The first request displayed the retry message. The retry returned **Source: Cloud**, with correct stock and discrepancy quantities and contradictory wording about Sam's assignment. After the offline run, a separate briefing also returned **Source: Cloud**. The latter is the screenshot and reflects the new unverified observation and both extracted follow-ups. [Hosted cloud briefing screenshot](hosted-cloud-briefing.png)
- **Offline.** With DevTools Network set to **Offline**, a normal reload reopened the same hosted workspace and retained **Synced (3)**. DevTools showed hosted assets served by the service worker with 0 B transferred. `ONLY_ON_DEVICE` returned **Source: On-device** in 26.0 seconds. The device draft contained two reviewable movements and a shelf count for this note. No second set of movements was approved. Chrome was returned to **No throttling**. [Hosted offline screenshot](hosted-offline.png)
- **Console.** The successful online workflow showed no console errors and one LanguageModel output-language warning. A Firestore channel termination logged `ERR_INTERNET_DISCONNECTED` during the offline transition. There were no App Check errors in the verified workflow. [Redacted console record](console-check.txt)
