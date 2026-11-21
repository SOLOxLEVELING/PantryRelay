# G3.2 desktop Chrome verification

The test used desktop Chrome at `http://localhost:4173/` with Vite preview, the existing downloaded device model, and the production service worker active.

## Test F

DevTools Network was set to Offline before extracting the unmodified Golden rice sample in `ONLY_ON_DEVICE`. The Firebase AI Logic result reported `On-device` in 24.6 seconds. Approvals for the 36-bag receipt and the 8-bag distribution reached `Locally saved · Pending sync`. The 5-bag quarantine stayed `AI-suggested`.

Chrome's hard reload bypassed the service worker and returned `ERR_INTERNET_DISCONNECTED`. A standard reload with DevTools still Offline restored the original note in the editor and review, both approvals, the draft, and Sam's open shelf-check follow-up. The sync status was `Pending sync (2)`. [Offline reload screenshot](offline-reload.png)

## Test G

The 5-bag quarantine was approved while Offline. The UI reached `Pending sync (3)`. Restoring No throttling triggered automatic sync and the UI moved through `Syncing…` to `Synced (3)`. After the manual `Sync now` retry and an online reload, all three movements were still synced. [Online post-sync screenshot](online-post-sync.png)

### Redacted Network and Console observations

| Step | Chrome DevTools observation |
| --- | --- |
| Reconnect | Network showed a Firestore `Write/channel` request to `firestore.googleapis.com` under the Firestore domain filter. Five Firestore-domain requests were visible in that capture. Query parameters and connection identifiers are omitted. |
| Manual retry | Cleared the Network log with the Firestore domain filter still enabled. Clicking `Sync now` produced no new Firestore requests. |
| Online reload | Network showed `0 / 52 requests` under the Firestore domain filter. Chrome restored `Synced (3)`. |
| Console | No Firebase sync error was observed. Code inspection and the console trace identified browser-extension messages, a blocked Google Analytics request initiated by an extension, and `GET http://localhost:4173/favicon.ico 404 (Not Found)`. The final build supplies an inline favicon declaration to prevent the 404. The final browser console was not rerun after the rules stop condition. |

The live Firebase Data viewer listed exactly three distinct document IDs under `workspaces/[UID]/sessions/[SESSION]/ledgerEvents` after the retry and reload. The workspace and document identifiers are omitted.

## Test J and stop condition

The live Firebase Rules editor still showed the default catch-all test-mode rule, `allow read, write: if request.time < timestamp.date(2026, 12, 21);`. The owner-scoped rules in the repository had not been deployed. No Firebase error was returned because the permissive rules admitted the writes. Live testing stopped when this was discovered. Test G verifies the observed write and retry behavior. Test J remains blocked on deployment and a workspace-isolation check. No Firebase configuration or rules were changed.

## Local checks

The two new workflow tests initially failed because the state lacked `hydrated` and reset did not return a hydrated session with a fresh ID. Both passed after implementation. The test also verifies that saving another snapshot preserves `SYNCED` and `SYNC_ERROR` outbox entries.

- `npm test` exited 0 with 111 passing tests. [Exact output](npm-test.txt)
- `npx tsc --noEmit` exited 0 with no output. [Exact output](typecheck.txt)
- `npm run build` exited 0 with Vite's chunk-size warning. [Exact output](build.txt)
