# Pantry workflow research

Sundermeir et al. surveyed 297 U.S. food pantries from January through June 2022. The study appeared in the 2024 journal issue after online publication in 2023. Respondents reported visual inventory assessment (62.3%) and paper and pencil (48.5%). They could select multiple methods. The response rate was 28.8% among contactable pantries, four states were unrepresented, and rural responses were less common. Treat the self-reported figures as descriptive of the survey sample. They establish neither global prevalence nor the effect of this app or demand for AI. [PMC11810111](https://pmc.ncbi.nlm.nih.gov/articles/PMC11810111/) · [Journal article](https://doi.org/10.1080/19320248.2023.2228728)

**Not user-validated via live pantry interviews. The demo uses synthetic scenarios.**

## Alternatives

Public product documentation reviewed 21 November 2026. A dash indicates an aspect the cited material did not establish. The scan used vendor and user-facing documentation and did not test the products.

| Tool | Documented workflow or provenance | Offline or discrepancy handling in reviewed material | Source |
| --- | --- | --- | --- |
| PantrySoft | Donation receipts by inventory source, barcode intake, and reports by item, group, client or source. | — | [Donations and inventory](https://www.pantrysoft.com/feature/donations-and-inventory/) |
| Link2Feed | Agency inventory administration with disposal and distribution settings. | Negative balances can be allowed by configuration. Offline use and note reconciliation were outside the reviewed page. | [Inventory administration](https://link2feed.zendesk.com/hc/en-us/articles/46708419223188-Inventory-Administration) |
| Oasis Insight | Client intake and reporting across food banks and partner agencies. | The Central Texas Food Bank describes web access to a cloud service. | [Product](https://oasisinsight.net/) · [Central Texas Food Bank guide](https://www.centraltexasfoodbank.org/oasis-insight-user-guides-and-resources) |
| FoodBank Manager | Optional inventory and POS module tracks transactions and posts stock changes when distribution is fulfilled. | The vendor describes a cloud service. | [Inventory and POS guide](https://fbm-support.freshdesk.com/support/solutions/articles/159000434698-inventory-pos-add-on-feature) · [Product](https://www.foodbankmanager.com/) |
| SmartChoice Pantry | Barcode and manual inventory intake tied to client-choice ordering and live stock. | Vendor describes cloud-based real-time inventory. | [Inventory feature](https://www.smartchoicepantry.com/features/food-pantry-inventory-management-software) · [Features](https://www.smartchoicepantry.com/features) |
| Google Sheets | A pantry can enter movements, record source text in cells, and use formulas for stock and discrepancies. | Offline editing can be enabled. The template and operators define review and approval conventions. | [Google offline guide](https://support.google.com/docs/answer/6388102) · [G5.1 spreadsheet design](EVALUATION.md#five-note-spreadsheet-comparison) |
| Slack | Shift updates can use searchable threads. AI summaries can link back to source messages. | Inventory approvals and physical-count checks would need a separate workflow. | [Conversation summaries](https://slack.com/help/articles/25076892548883/Guide-to-AI-features-in-Slack) |
| General-purpose AI chat, e.g. ChatGPT | Drafts and summarizes text and can extract information from uploads. | A chat-based workflow would need separate rules for approvals, reconciliation, and offline device inference. | [ChatGPT capabilities](https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview) |

## Working hypothesis

A volunteer coordinator at a small pantry receives a shift note that mixes receipts, items handed out, damaged stock, and a shelf count. At the next shift, the coordinator has to decide which quantities should enter the ledger and which still need checking. PantryRelay proposes rows with evidence from the note, keeps physical counts separate from approved movements, and records open discrepancies in the handoff.

A spreadsheet with a raw-note column, ledger formulas, and a review convention is the strongest baseline for a pantry with few items. The proposed value of AI is to prefill those review rows when the note is messy or the connection drops. G5.1's small timing pilot favored the prepared sheet, with unequal timing boundaries and one agent operator. A comparable future test would time both workflows from the original note to a handoff and record corrections, wrong approvals, and unresolved ambiguity. [G5.1 method and results](EVALUATION.md#five-note-spreadsheet-comparison)
