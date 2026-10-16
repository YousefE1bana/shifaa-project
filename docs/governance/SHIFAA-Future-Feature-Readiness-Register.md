# SHIFAA future-feature readiness register

> Document ID: SHIFAA-FUTURE-READINESS-REGISTER
> Version: 1.0.0-proposed
> Package: F012-GRADUATION-ENGINEERING/2.2.0-proposed
> Status: PROPOSED_UNAPPROVED — NOT_EFFECTIVE
> Approval of exact contents: NOT RECORDED
> Effective authority: NONE; frozen boundaries and approved baselines remain controlling.

## Scope and source discipline

This additive register carries completed-audit findings forward for Features 013–026. It does not repeat the audit, reorder/re-split features, approve their specifications, extend the F012 engineering amendment, alter ownership or add operations.

[Assigned frozen roadmap rows](SHIFAA-Remaining-Specs-Roadmap.md#L128-L266) remain the feature boundaries. [Coverage reconciliation item 6](SHIFAA-Completion-Coverage.md#L218-L227) explicitly records the listed UI gaps. Finding classifications are CONFIRMED_GAP, POTENTIAL_GAP, DOCUMENTATION_DRIFT and NO_FINDING; they are not requirement statuses or runtime results.

## Retained readiness findings

| Feature / current operations | Classification and bounded finding | Exact evidence | Owner / measurable closure / earliest decision |
| --- | --- | --- | --- |
| 013 / 14 | CONFIRMED_GAP: pharmacy-director/catalog administration composition | [Coverage item 6](SHIFAA-Completion-Coverage.md#L227); [F013](SHIFAA-Remaining-Specs-Roadmap.md#L128-L136) | Product/Design approved actor/action composition and state references at Plan approval; boundary conflict before Specify |
| 014 / 16 | POTENTIAL_GAP: independent substitution-review discovery/detail completeness | [F014](SHIFAA-Remaining-Specs-Roadmap.md#L138-L146); [pharmacy worklist](../architecture/SHIFAA-API-Catalog.md#L182) | Product/API/Data demonstrate whole journey before Specify if boundary change needed; OPEN-PHARM-001 remains SPEC_APPROVED for FR-PHARM-006 |
| 015 / 23 | CONFIRMED_GAP: subject-readable admission composition | [Coverage item 6](SHIFAA-Completion-Coverage.md#L227); [F015](SHIFAA-Remaining-Specs-Roadmap.md#L148-L156) | Product/Design approved subject projection and UI states before Plan approval; no finding that existing transfer operations are absent |
| 016 / 13 | POTENTIAL_GAP: catalog signature producer/binding completeness | [F016](SHIFAA-Remaining-Specs-Roadmap.md#L158-L166); [catalog publish](../architecture/SHIFAA-API-Catalog.md#L260) | API/Data/Lab establish exact approved producer/binding before Plan approval; boundary changes before Specify |
| 017 / 10 | CONFIRMED_GAP: ordering-clinician critical-result composition; critical-policy required-signature producer chain unresolved | [Coverage item 6](SHIFAA-Completion-Coverage.md#L227); [publishCriticalPolicy](../architecture/SHIFAA-API-Catalog.md#L263); [signed reviewers](../architecture/SHIFAA-Data-RLS.md#L113) | Product/Design/API/Data document discovery/read/acknowledgement and signature producer contracts; boundary before Specify, complete design before Plan approval; OPEN-CLIN-003 retained |
| 018 / 5 | CONFIRMED_GAP: approved vaccine schedule/rule producer and consumer boundary unresolved | [schedule/rules](../architecture/SHIFAA-Data-RLS.md#L71-L73); [trace FR-VAX-001](../traceability/SHIFAA-Traceability-Matrix.md#L85); [F018](SHIFAA-Remaining-Specs-Roadmap.md#L178-L186) | Clinical source owner and API/Data explicit provenance/consumer contract; boundary before Specify, consumption design before Plan approval; OPEN-CLIN-003 retained |
| 019 / 6 | CONFIRMED_GAP: routed refill request discovery/detail workflow not reconciled | [refill operations](../architecture/SHIFAA-API-Catalog.md#L165-L167); [fulfilment worklist](../architecture/SHIFAA-API-Catalog.md#L182); [F019](SHIFAA-Remaining-Specs-Roadmap.md#L188-L196) | Product/API/Data map request discovery/assignment/detail/decision/recovery before Specify for boundary; no assumed reuse of F014 permissions |
| 020 / 3 | CONFIRMED_GAP: disability review composition | [Coverage item 6](SHIFAA-Completion-Coverage.md#L227); [F020](SHIFAA-Remaining-Specs-Roadmap.md#L198-L206) | Product/Design approved reviewer composition before Plan approval; OPEN-LEGAL-005 remains unchanged |
| 021 / 10 | CONFIRMED_GAP: facility complaint-handling composition | [Coverage item 6](SHIFAA-Completion-Coverage.md#L227); [F021](SHIFAA-Remaining-Specs-Roadmap.md#L208-L216) | Product/Design approve composition before Plan approval; existing complaint list/detail operations remain available by their own authorization |
| 022 / 3 | CONFIRMED_GAP: finance-review composition | [Coverage item 6](SHIFAA-Completion-Coverage.md#L227); [F022](SHIFAA-Remaining-Specs-Roadmap.md#L218-L226) | Product/Design/API reconcile actor/detail/decision recovery before Plan approval; boundary conflict before Specify; OPEN-VENDOR-003 retained |
| 023 / 4 | POTENTIAL_GAP: evaluation-source/current-authority/invalidation completeness | [F023](SHIFAA-Remaining-Specs-Roadmap.md#L228-L236) | AI/API/Data/Security complete source/version/current-authority and failure contract before Plan approval; OPEN-AI-001 remains VERIFYING for Phase 7 |
| 024 / 3 | CONFIRMED_GAP: authorized admin AI-run review composition | [Coverage item 6](SHIFAA-Completion-Coverage.md#L227); [F024](SHIFAA-Remaining-Specs-Roadmap.md#L238-L246) | Product/Design/API/Data approve purpose-scoped review projection/UI before Plan approval; no admin-derived patient read |
| 025 / 0 | POTENTIAL_GAP: exact approved parked-Control reconciliation must be located and identified | [F025 normative-scope clause](SHIFAA-Remaining-Specs-Roadmap.md#L250-L256) | Yousef identifies approved artifact/version before Specify; unavailable evidence is not proof the artifact does not exist |
| 026 / 0 | DOCUMENTATION_DRIFT: 23-item statement versus 19 current remaining IDs; summary/ledger arithmetic divergence | [F026](SHIFAA-Remaining-Specs-Roadmap.md#L258-L266); [PRD remaining register](../../shifaa-prd.md#L342-L364); [coverage summary](SHIFAA-Completion-Coverage.md#L21-L33) | Product/QA approved additive accounting/evidence reconciliation before release claims; no acceptance rewrite |

The F013–024 baseline sums to 110 operations; F025/F026 add none. This register never implies an unbuilt feature passed tests. No feature-wide READY label is assigned.

## Coverage terminology and arithmetic reconciliation

Preserve the canonical [status definitions](SHIFAA-Completion-Coverage.md#L7-L19):

- DONE: the ledger's recorded graduation-engineering realization, with its stated local/merged limits; not production RELEASED.
- PARTIAL: verified slice with a named remaining closure owner.
- PLANNED: no completed slice and an assigned remaining owner; general lifecycle overlays do not make every row BLOCKED.
- BLOCKED: a requirement-specific canonical gate prevents SPEC_APPROVED or requirement completion.
- DEFERRED_POST_MVP: reserved history forbidden from graduation scope.

The previous response-only draft's COMPLETE and OPEN_DEPENDENT labels were erroneous substitutes. This patch rejects those substitutions and retains DONE and BLOCKED. It proposes no canonical vocabulary change or status remapping.

| View / status order | DONE | PARTIAL | PLANNED | BLOCKED | DEFERRED_POST_MVP | Reported / proposed total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Preserved canonical summary, Coverage Section 2 | 30 | 21 | 59 | 5 | 3 | 119 |
| Proposed accounting successor from existing Section 3/4 ledger rows | 31 | 21 | 61 | 3 | 3 | 119 |

The preserved summary reports total 119, but its displayed status subtotals sum to 118 (its FR subtotals sum to 94 while reporting 95). This internal arithmetic discrepancy is retained and explicitly identified; the proposed successor's subtotals sum to 119.

Reproduction: select the 95 unique FR and 24 unique NFR rows from Sections 3/4, retain each existing Status cell and count by canonical label. There are 119 unique entries, 116 active and three deferred. This is an accounting proposal derived from unchanged row statuses, not new acceptance, fresh runtime verification or approval of their historical completion claims.

Do not update the canonical summary or historic row labels in this patch. The unmerged three-file successor's dated accounting remains preserved. Exact approval/integration is still required for successor authority.

## OPEN-register reconciliation

The current PRD Section 10.2 and Master Section 14.2 each list the same 19 remaining OPEN IDs. The frozen F026 row's 23-item statement remains historical source text.

This register proposes using the identified current 19-ID inventory while retaining all historical closure records and investigating the 23-item provenance before any release claim. It does not fabricate four current IDs, infer a new closure or rewrite a past approval. Related release and engineering restrictions remain as canonically recorded.

## Reusable future pre-Specify check

Record assigned immutable IDs/operations/dependencies/exclusions; producer → contract → discovery/assignment/detail/decision → data/RLS → current authority → transaction/retry/recovery → evidence; minimum disclosure and app entry ownership; source availability versus source approval; applicable OPEN IDs/owners/evidence/restrictions/stages; exact product/architecture decisions.

A feature whose boundary conflicts with higher authority needs its own approved reconciliation before Specify. The F012 synthetic profile is not a blanket future-feature waiver.

Engineering Factory, unrelated automation and Spec Kit upgrades are excluded. Spec Kit remains 1.1.3 and the established custom workflow remains unchanged.
