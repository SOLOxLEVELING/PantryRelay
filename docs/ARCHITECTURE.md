# PantryRelay architecture

1. **Capture.** The React workspace keeps the source note with its review draft. The Firebase Web SDK calls hybrid extraction in `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, or `ONLY_IN_CLOUD` mode. The UI labels the response using Firebase's reported source. Zod validates the result and draft guards check evidence, duplicates, overlaps, and selected numeric contradictions. [Extraction](../src/lib/spikeExtract.ts) · [Draft guards](../src/lib/sanitizeDraft.ts)
2. **Review and reconcile.** Volunteers can correct proposals or enter movements and shelf counts manually. Approval creates an immutable ledger event. Reconciliation uses the opening balance plus receipts and adjustments, minus distribution and quarantine. Shelf counts supply the comparison value. Manual and edited counts enter the comparison after confirmation. Reconciliation flags missing baselines and incompatible units. [Workflow reducer](../src/lib/workflowState.ts) · [Reconciliation](../src/lib/reconcile.ts)
3. **Handoff.** The deterministic clipboard record uses stock, discrepancies, movements, and follow-ups already in the workspace. The optional cloud briefing sends those structured summaries, including assignees when present. Raw note text stays out of this briefing payload. Cloud extraction in the cloud-enabled modes can send the original note. [Handoff implementation](../src/lib/shiftBriefing.ts)

## Persistence contract

| Store | What it owns |
| --- | --- |
| IndexedDB | The active workspace on this browser and origin. The snapshot includes source notes attached to drafts, observations, tasks, approved ledger events, and open discrepancy decisions. Snapshot and new outbox entries are saved together. |
| Cloud Firestore | An append-only mirror of approved movement events at `workspaces/{uid}/sessions/{sessionId}/ledgerEvents/{eventId}`. The remote write acknowledgment determines **Synced**. The app reads the remote document on a duplicate retry to verify an exact match. It rebuilds the active workspace from IndexedDB on reload. |
| Service-worker Cache Storage | Static HTML and bundled assets for offline reload after the worker controls the page. The device model lives in Chrome's separate model storage. |

[Local persistence](../src/lib/storage.ts) · [Outbox writer](../src/lib/syncOutbox.ts) · [PWA build](../vite.config.ts)

## Security and trade-offs

App Check initializes with the Enterprise provider before the Firebase AI Logic client. Basic enforcement was observed in Firebase Console. The localhost debug token is available only for local runs. The hosted release passed production attestation after the site key was corrected and redeployed. [Firebase initialization](../src/lib/firebase.ts) · [Enforcement capture](evidence/app-check-enforced.png) · [Hosted check](evidence/g52/verification.md)

Anonymous Authentication assigns the UID used by Firestore Rules. The rules deny access by default, permit owner reads and validated creates on the ledger path, and deny updates and deletes. Validation covers the event ID, positive numeric quantity, nonempty unit, and allowed movement kind. Reconciliation and draft approval run in the client. [Rules](../firestore.rules) · [Live rule simulation evidence](evidence/g41/live-firestore-rules.txt)

The local workspace continues through connectivity outages. Browser data clearing removes local state, and another browser cannot recover it through this app. The rice baseline is synthetic, beans has no seeded opening balance, and there is no automatic unit conversion. Cloud availability depends on App Check, connectivity, and quota. Offline AI depends on a prepared Chrome profile. [Evaluation](EVALUATION.md)
