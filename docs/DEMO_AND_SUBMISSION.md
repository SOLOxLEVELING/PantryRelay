# Demo and submission

## Video storyboard

Target runtime **2:30**. Record in desktop Chrome with the app shell cached and the browser model ready. Use the synthetic Golden rice note. For hosted footage, follow the [verified G5.2 workflow](evidence/g52/verification.md).

| Video time | Show |
| --- | --- |
| 0:00–0:05 | Open on the workspace. “A pantry shift note can mix what came in, what went out, and what someone counted. PantryRelay turns it into stock changes a volunteer can review.” |
| 0:05–0:12 | Set DevTools Network to **Offline** and reload normally. Show **Offline**, **Cached offline**, and **On-device model Ready**. |
| 0:12–0:22 | Run **ONLY_ON_DEVICE** on the rice note. Show the real **Source: On-device**, the note evidence, and the proposed receipt, distribution, quarantine, count, and follow-up. If the model takes longer than the segment, label the shortened wait and leave the measured duration visible. |
| 0:22–0:30 | Show the review decisions and the resulting comparison, **47 expected vs 25 observed**, once all three verified movements are approved. Keep the 22-bag discrepancy open. Label any shortened interval through approval. |
| 0:30–1:05 | Replay the review at a readable pace. Explain the original evidence and how the shelf count stays separate from ledger approvals. Show the manual count form, the recount action, and the offline clipboard handoff. If a model omits a row, identify the missing suggestion and record it as a manual entry. |
| 1:05–1:40 | Reconnect. Show **Pending sync** changing to **Synced**. Generate a Cloud Shift Briefing and show **Source: Cloud**. Explain the structured cloud payload and when extraction can send the note. |
| 1:40–2:15 | Show the 30 synthetic notes per successful source, the 10 deterministic reconciliation fixtures, and examples of wrong draft values or missing ambiguity flags. Identify the unpaced cloud quota failures and the uneven spreadsheet timing method. |
| 2:15–2:30 | Close with the intended volunteer coordinator workflow. Point to the browser setup, public source, license, and verified demo link when available. |

Record the actual browser network setting, SDK source, and human review. Label synthetic examples and edited waits on screen. Check the published runtime and English captions.

## Devpost writeup draft

**PantryRelay** gives volunteer coordinators at small food pantries a way to turn a messy shift note into a reviewed stock record and handoff, even after the connection drops. A study of 297 U.S. food pantries surveyed in 2022 and published in the 2024 journal issue found that 62.3% of respondents used visual inventory assessment and 48.5% used paper and pencil. Those figures describe surveyed workflows. The PantryRelay demo uses synthetic scenarios and had no live pantry interviews. [Survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC11810111/) · [Research notes](RESEARCH.md)

In the rice example, a volunteer starts with 24 bags, approves a receipt of 36, a distribution of 8, and 5 damaged bags set aside. PantryRelay calculates 47 usable bags. A shelf count of 25 leaves a 22-bag discrepancy for the next shift. The original note stays attached to the review, and units or quantities can be corrected before approval. The workspace supports manual movements, counts, and a copyable handoff without any AI calls.

Firebase AI Logic drives both extraction paths. Supported and prepared desktop Chrome can run the Gemini Nano device path offline. An online cloud option supports browsers without the local model. The UI reports the SDK's actual inference source. IndexedDB holds the workspace, and anonymous Firebase Auth scopes Firestore writes to the volunteer's workspace. Firestore mirrors approved events under create-only rules. Firebase AI Logic enforces App Check. The optional cloud briefing consumes a structured shift summary. [Architecture](ARCHITECTURE.md)

G5.1 evaluated 30 synthetic notes with ground truth written before inference. The offline Chrome 157 device batch returned 30/30 schema-valid on-device responses with a 5.20 s median. The quota-paced cloud batch returned 30/30 schema-valid cloud responses with a 1.88 s median. The guarded movement scores were 23/34 precision and 23/32 recall on-device, and 28/33 precision and 28/32 recall in the paced cloud run. The guarded drafts flagged just 2/10 and 6/10 expected ambiguity cases respectively. All 10 deterministic reconciliation fixtures passed. The unpaced cloud run hit 10 quota errors. Three device timeouts occurred in a separate five-note workflow pilot. [Evaluation method and results](EVALUATION.md)

The pilot's median was 4.636 s for a prepared spreadsheet and 79.580 s for the app. One agent operated both, and the spreadsheet timer excluded preparing the rows. The app timer included inference and operator pauses. Treat this as a pilot observation. Manual approval remains central because plausible drafts can contain wrong quantities or miss ambiguities. [Timing evidence](EVALUATION.md#five-note-spreadsheet-comparison)

## Submission fields

- Platform and category: Web (Chrome).
- License and test path: [Apache-2.0](../LICENSE) and [Chrome setup](../README.md#chrome-and-offline-setup).
- Hosted project: [Firebase Hosting](https://pantryrelay-c3246.web.app/). Desktop Chrome verified hosted App Check, cloud extraction and briefing, sync, and offline device extraction. [Verification](evidence/g52/verification.md)
- Public GitHub or GitLab URL: [https://github.com/SOLOxLEVELING/PantryRelay](https://github.com/SOLOxLEVELING/PantryRelay).
- Public YouTube URL: pending owner submission.
- Devpost entry: pending owner submission. [Official rules and deadline](https://firebasehybridaihackathon.devpost.com/rules)
