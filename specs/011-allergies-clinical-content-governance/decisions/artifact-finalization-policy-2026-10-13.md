# F011 artifact organization and preservation disposition

On 2026-10-13, Yousef Osama instructed that the feature spec folder be the
permanent home for official documentation, reviews, acceptance, decisions, and
an evidence index. He required a Feature Artifact Finalization Gate before
feature closeout/worktree cleanup, then authorized applying it and auditing the
remaining GP-STUFF material before restoration.

The [audit and gate decision](../evidence/artifact-finalization/README.md) records
the additive organization. Reviewed original reports were copied byte-for-byte;
the existing spec and decision files remain unchanged. External evidence is
indexed by original/current location and SHA-256. Remaining run material is
preserved outside the repository with a verified per-file index.

## Final Product Owner disposition

**Status: CLOSED_WITH_ACCEPTED_PRESERVATION_LOSS — Yousef Osama, 2026-10-13.**

After the audit reported the missing archive and remaining classification hold,
Yousef explicitly instructed: "the files was deleted and can't restore it end it
now we need to merge the new edits to make our main clean."

The original complete worktree archive is treated as irrecoverably deleted. Its
loss remains recorded with the expected size/hash; it is not reconstructed or
reported as preserved. The earlier BLOCKED report and verification records remain
historical and are superseded by this explicit disposition for retrospective
closeout only.

All 21,505 remaining indexed run files are retained as historical run evidence,
reproduction fixtures/support, or browser runtime dependencies. Retaining the
entire indexed set resolves the retention decision without claiming exhaustive
content review or declaring files safe to discard. The
[closed evidence index](../evidence/artifact-finalization/evidence-index-closed.json)
records the resulting categories, verified saved paths, hashes, and source index.
No remaining files are moved or deleted by this disposition.

The archive loss and remaining classification hold no longer block this F011
retrospective audit or the maintenance PR. This is a specific Product Owner
exception for already-deleted historical material, not a future preservation
waiver or a full preservation PASS. Required PR checks and Yousef's squash merge
remain necessary for integration. No new professional approval, clean final
automated review, or successor authority is inferred.

The later [review-wait waiver](pr-490-review-wait-waived-2026-10-12.md), engineering-only
acceptance, deferred physical/formal/strict-pixel review, and retained OPEN gates
remain authoritative within their recorded limits. This maintenance does not
reopen or rewrite historical task acceptance and does not approve Feature 012.
