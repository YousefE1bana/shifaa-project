# Feature Artifact Finalization Gate

Effective 2026-10-13 under Yousef Osama's instruction in this conversation.
This is a mandatory feature closeout and cleanup gate within SpecKit. It does
not change the Constitution, frozen feature scope, professional approval roles,
release gates, or the PR-only integration policy.

## Permanent locations

| Material                                                                       | Required location and treatment                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Specify, Clarify, Plan, Tasks, contracts, and other official feature documents | `specs/<feature>/`; preserve mandatory template sections                                                                       |
| Review reports, acceptance records, decisions, and exceptions                  | Inside that feature folder, with author/date, scope, status, and approval limits                                               |
| Essential test evidence and final verification                                 | Inside the feature folder, or a verified saved copy linked by an evidence index there                                          |
| Temporary tests, repeated captures, and reproducible logs                      | Outside official documents unless required as evidence; classify and document retention or non-retention                       |
| Large build/cache/dependency trees such as `.next` and `node_modules`          | Do not move automatically into specs; distinguish regenerable state from unique evidence                                       |
| Personal settings and installation assets                                      | Outside the feature folder, for example `D:\ECU\GP-STUFF`; never publish secrets or personal configuration as feature evidence |

A whole-worktree archive provides backup coverage; it does not replace organizing
official outputs. Retain essential information and evidence with a known reason
and location, rather than retaining every generated file indefinitely.

## Required sequence

1. Before cleanup, inventory tracked, untracked, and relevant ignored files,
   including artifact folders, active-feature state, logs, archives, historical
   failures, and any retained local branch history. Record counts and byte totals.
2. Review content and references. Classify each item or explicitly bounded group
   as official output, essential evidence, duplicate evidence, reproducible
   temporary/build state, personal/local setup, unrelated feature material, or
   unresolved. An extension or directory name alone does not prove dispensability.
3. Put official outputs in `specs/<feature>/` and prepare them for the feature PR.
   Preserve original historical bytes; explain supersession and current location
   in an additive index instead of silently rewriting sealed evidence.
4. Index essential evidence kept externally. Record original and current paths,
   SHA-256, bytes, purpose, run/commit context when known, retention reason, and
   validation result. Unknown provenance remains explicitly unknown. Keep recovery
   instructions and applicable toolchain/source prerequisites with the index.
5. Reconcile the inventory with those destinations. Verify regular-file hashes,
   archive entries/integrity, and any required restoration, symlink target/type,
   traversal, and Windows long-path coverage. Report actual tested coverage.
   A historical PASS is not a fresh restoration test or approval.
6. Confirm the exact feature PR/head and squash merge on current remote `main`
   under the AGENTS integration sequence. Verify required official outputs and
   evidence index in that merged tree. An intended merge or local cached ref is
   insufficient. Only Yousef may squash-merge.
7. Record the finalization decision and remaining release/approval gates inside
   the feature folder. Pass only if required outputs are organized, evidence is
   verifiable, references are current, and no important material is unclassified
   or missing. Then perform only explicitly authorized, non-force cleanup.
   Record subsequent cleanup receipts as additive evidence through the repository's
   allowed integration path; do not amend sealed history.

## Evidence index and decision record

The index must identify its feature, date, custodian, source inventory, and scope.
For each retained item or bounded group, include:

- original path and Git state, current repository or external location;
- classification, retention reason, file count, bytes, and SHA-256 hashes;
- evidence purpose, run/commit identity if recorded, and approval/status limits;
- validation method/date/result and any missing or inaccessible dependencies;
- superseding record where applicable, without deleting historical failures.

For non-retention, record why the item is unnecessary or reproducible and the
reproduction inputs, tools, and source identity. Do not invent a retention period.
Machine-specific saved locations must be explicit and verified; future relocation
requires updating the index and rechecking integrity before removing the old copy.

The decision is `PASS` or `BLOCKED`, with exact blockers and safe next steps.
Unclassified important files, unresolved required preservation gaps, mismatches,
inaccessible saved copies, or stale unresolved references prohibit cleanup and
final closeout. Missing archives cannot be recreated from Git and described as
the original backup. A recorded historical cleanup does not waive a discovered gap.

### F011 legacy preservation-loss disposition

On 2026-10-13, Yousef Osama explicitly directed closure of F011's already-deleted,
unrecoverable archive issue and completion of the maintenance integration. The
dated [F011 disposition](../../specs/011-allergies-clinical-content-governance/decisions/artifact-finalization-policy-2026-10-13.md)
records this one-time outcome as `CLOSED_WITH_ACCEPTED_PRESERVATION_LOSS`, rather
than a preservation PASS. All indexed remaining run material is retained as
historical evidence or reproduction support; no discard decision or exhaustive
content approval is implied. This closes the retrospective audit and does not
authorize further deletion, change future features' normal gate, waive required
PR integration, or close any clinical/legal/design/release gate.

## Approval and release limits

This gate proves organization and preservation, not clinical, legal, production,
design, native accessibility, or physical-device acceptance. Preserve failed runs,
engineering-only acceptance, named deferrals, review waivers, and all retained
`OPEN-*` gates. No automated review pass, professional sign-off, or successor
authorization may be inferred. In particular, F011 does not approve F012 UI or
authorize its lifecycle.

The root agent owns the classification, evidence review, and lifecycle report.
The applicable named approver retains approval authority. An index of unreviewed
material is useful inventory but cannot itself satisfy the gate.
