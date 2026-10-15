# Repository Integration Policy

For this repository, PR-based integration is the ONLY allowed path to `main`
starting from spec 003 onward. Direct push to `main` is prohibited regardless
of verification status, unless Yousef Osama explicitly instructs otherwise in
a given conversation.

Every spec 003+ must complete this sequence in order:

1. Run local `pnpm verify` successfully.
2. Complete and record live Arabic and English acceptance evidence.
3. Push the feature branch, never `main`.
4. Open a pull request linked to the feature Issue and spec directory.
5. Wait for every required GitHub status check to pass on the up-to-date branch.
6. Stop for Yousef Osama to squash-merge the pull request; no external approver
   is required.
7. Confirm remote `main` contains the squash merge.
8. Pass the Feature Artifact Finalization Gate below before declaring feature
   closeout complete or cleaning up the feature worktree and branch.
9. Only then close the corresponding feature closeout Issue or Issues and perform
   authorized cleanup. Accepted task Issues may retain their recorded checkpoint
   closure; this gate does not rewrite historical acceptance.

## Feature Artifact Finalization Gate

`specs/<feature>/` is the permanent home for official feature documentation,
reviews, acceptance records, decisions, exceptions, and the evidence index.
Apply [the mandatory gate](docs/governance/SHIFAA-Feature-Artifact-Finalization-Gate.md)
before closeout and before worktree or branch deletion. Prepare official outputs
for the feature PR; confirm their integrity in merged remote `main` before cleanup.

Inventory tracked, untracked, and relevant ignored files, then review and classify
them. Keep essential evidence inside the feature folder or in a verified retained
copy indexed there with paths, hashes, context, and retention reasons. Do not move
build trees automatically into specs or place personal settings/setup files there.
A complete worktree archive is a backup, not a substitute for organized outputs.
Unclassified important files, inaccessible evidence, stale references, hash
mismatches, or unresolved preservation gaps block finalization and cleanup.
Preserve historical failures, named approval limits, and retained `OPEN-*` gates.

## Current onboarding guidance

Use [the maintained onboarding draft](docs/TEAM-ONBOARDING-DRAFT.md) for the
reviewed Spec Kit 1.1.3 pin and the moved local setup-center location. The
original installation checklist and roadmap remain unchanged because F011
approved evidence binds their exact bytes. The finalization gate above applies
additively without changing those frozen feature boundaries.

## Remaining feature authority

Documentation reconciliation authorized by Yousef Osama on 2026-10-14 is recorded
in the [dated successor section](docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md#documentation-reconciliation--2026-10-14).
It is a local, Product Owner-authorized documentation change pending PR-based
integration; its accounting and status successors are not effective until merged.
Read it alongside the frozen records. It grants no clinical/legal approval,
contract amendment, additional operation or Feature 012 lifecycle authorization.

For every feature after 006, read
`docs/governance/SHIFAA-Remaining-Specs-Roadmap.md` first and use the assigned
row as the feature boundary. Do not re-derive the project-wide roadmap. Inspect
only the canonical material relevant to that feature and its listed
dependencies; any boundary conflict requires a governance reconciliation before
the feature's SpecKit lifecycle begins.

For Feature 012, also read the
[proposed boundary and governance addendum](docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md).
Its successor statements are not effective until the separately authorized
governance change is explicitly approved and merged. The two boundary directions
are approved in principle only; Feature 012 remains `NOT READY`. This reference
does not authorize fixtures, contract changes, or any SpecKit lifecycle stage.

## Shared agent skills

Repository-owned SHIFAA skills and compact policy wrappers live in
`.shifaa/skills/`. The runtime roots `.agents/skills/` and
`.kimi-code/skills/` are machine-local, Git-ignored state. Never commit a
third-party skill, its assets, or the local root `skills-lock.json`.

Run `tools/sync-shifaa-owned-skills.ps1` after cloning or pulling to copy the
repository-owned skills into `.agents/skills/` without deleting locally
installed third-party skills. Third-party project-skill installs and updates
are local-only; global skills are separate and manually managed by the user.

For SHIFAA work, `shifaa-project-guardrails` outranks every external skill and
`shifaa-ui-governor` must govern all UI/UX/frontend/mobile work. The approved
SHIFAA baseline and current feature spec always override third-party advice.
SpecKit remains the only project lifecycle. Use
`shifaa-third-party-skill-overlay` with external skills and
`shifaa-speckit-overlay` with local SpecKit skills. External design skills do not
authorize changes to the UI Contract. Treat third-party skills as executable
supply-chain dependencies: review provenance, license, instructions, scripts,
network behavior, and conflicts before adding or updating them.

Use `clean-code-guard`, `test-guard`, and `docs-guard` as second-pass quality
reviews after their respective changes; they do not redesign architecture or
replace SpecKit. Third-party executables remain prohibited by default unless
the user has explicitly approved their local execution. Delegate briefs must
be bounded, delegates perform no Git integration, and the parent agent owns
diff review, verification, commit, push, and the PR lifecycle.

<!-- SPECKIT START -->

For the approved post-006 order, ownership, dependencies, and exclusions, read
docs/governance/SHIFAA-Remaining-Specs-Roadmap.md before opening the assigned
feature plan.

<!-- SPECKIT END -->

## Bounded F012 synthetic-governance patch proposal — 2026-10-14

> Package: F012-GRADUATION-ENGINEERING/2.2.0-proposed
> Appendix version: 2.2.0-proposed
> Status: PROPOSED_UNAPPROVED — NOT_EFFECTIVE
> Approval of exact contents: NOT RECORDED

Preparation of the following nine-path documentation patch is authorized by
Yousef. Approval of its resulting contents, activation, PR integration and any
F012 lifecycle stage are not authorized by that preparation instruction.

Read the proposed [Master activation/input index](docs/governance/SHIFAA-MASTER-F012-Graduation-Amendment-v2.2.0.md#activation-and-version-authority),
[Constitution applicability amendment](.specify/memory/SHIFAA-Constitution-F012-Amendment-v2.2.0.md),
[PRD amendment](docs/governance/SHIFAA-PRD-F012-Graduation-Amendment-v2.2.0.md),
[boundary contract and coverage matrix](docs/architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md#operation-to-journey-coverage-matrix),
[template supplement](.specify/templates/overrides/f012-synthetic-profile-supplement.md),
[evidence overlay](docs/traceability/SHIFAA-F012-Graduation-Evidence-Overlay.md)
and [future readiness register](docs/governance/SHIFAA-Future-Feature-Readiness-Register.md)
alongside this file and the existing F012 addendum. These are the nine patch paths.

All new documents are PROPOSED_UNAPPROVED — NOT_EFFECTIVE. A merged proposal
still bearing NOT_EFFECTIVE is not an activated amendment. Exact approval must
bind final promoted versions/digests through a separately authorized durable
record; approved status, remote-main contents and authority must then be verified.
Read and explicitly supply baseline plus approved amendments/supplement before
any future separately authorized stage; no automatic SpecKit loading is claimed.
If explicit propagation cannot preserve existing gates, stop and identify the
out-of-scope loader/config/canonical change dependency.

The twelve-operation reviewer journey is a preferred candidate for detailed
contract review only. Effective F012 inventory remains ten; F014 retains its
16 operations and fulfilment-worklist ownership. Candidate sufficiency, case
access/assignment authority, emergency semantics and reviewer app ownership
remain unresolved as stated in the matrix. No endpoint, route, role or grant is
created here. Feature 012 remains NOT READY — PRE_SPECIFY_BLOCKED.

Synthetic reviewer designations, rule fixtures and decisions confer no clinical,
professional, legal, facility or production authority. Q1–Q10 remains advisory.
Preserve existing local successor edits, fixture hashes and readiness evidence.
No OPEN item is closed and no frozen F011 historical input changes.

This appendix is additive to the earlier three-file successor. It authorizes only
preparation of the exact nine paths; onboarding/readiness evidence remains
preserved outside the new edit delta. Their later retention/integration needs
explicit scope reconciliation. No pnpm verify, lifecycle command, commit, push,
PR, merge or cleanup is authorized. If a check writes outside scope, stop,
preserve state and report it without cleanup or scope expansion.

## Targeted F012 governance remediation proposal — 2026-10-15

Documentation remediation and supporting F012 records are authorized; approval,
publication, status promotion and lifecycle execution remain separate.
Read the [constitutional impact review](specs/012-prescription-safety-governed-overrides/governance-remediation/constitutional-impact-review.md),
[evidence disposition manifest](specs/012-prescription-safety-governed-overrides/governance-remediation/integration-retention-manifest.json)
and [activation/decision procedure](specs/012-prescription-safety-governed-overrides/governance-remediation/activation-and-decisions.md).
Recommended constitutional candidate is v3.0.0. Existing v2.2.0 filenames remain
draft locators; no rename, promotion or effective version is selected.
Six canonical/template propagation paths and required reviewer dispositions
remain approval-dependent. Supplementary files alone do not satisfy that rule.
No blanket 37-file or 50-path publication scope is authorized. Preserve all
existing readiness bytes and the sibling archive. F012 remains
NOT READY — PRE_SPECIFY_BLOCKED; ten operations remain effective.

## Successor-reference correction — Product Owner direction, 2026-10-15

> Preparation authorized; exact contents PROPOSED_UNAPPROVED — NOT_EFFECTIVE.
> This section supersedes conflicting earlier instructions in this document only upon governed approval and activation; earlier text is retained as historical proposal/evidence. F012 remains NOT READY — PRE_SPECIFY_BLOCKED.

The [canonical Constitution publication procedure](.specify/memory/constitution.md#f012-publication-and-activation-procedure) is the sole proposed constitutional authority and activation locator. Earlier composite-authority, baseline-plus-sidecar precedence and sidecar-led activation instructions are historical proposals, not operative instructions. Constitution 2.1.0 and approved PRD/Master 2.1.3 remain effective until the exact conditional-publication predicate is satisfied. Recommended candidates are Constitution 3.0.0 and PRD/Master 2.2.0; the v2.2.0 sidecar filenames remain historical locators, without renaming or ratification.

For any future separately authorized lifecycle stage, explicitly read the effective canonical Constitution, PRD, Master and applicable templates; verify versions/hashes, actual remote-main authority, attributable exact-content approval, final manifest and activation receipt. Read sidecars and supplement as supporting decisions/evidence only. No automatic SpecKit loading is claimed. Independently check branch/worktree and active-feature pointer; a pointer is not feature authority. No Specify, Plan, Tasks or other lifecycle stage is authorized.

Yousef's current evidence-location direction is preparation authority within Product Owner scope: every feature's official evidence belongs to its owning specs directory. F011 evidence remains in F011 and is referenced without copying or changing it. F012 evidence remains in F012. No generic external vault/cloud destination is mandatory. Earlier external-retention requirements below are superseded proposed policy, not an instruction to relocate evidence. See the [versioned feature-owned integration/retention successor](specs/012-prescription-safety-governed-overrides/governance-remediation/integration-retention-manifest-v2.json); the original manifest and all 37 original readiness records retain their original bytes and hashes.

Review each of the 14 publication candidates individually; retain the other 23 restricted/historical records in their F012 scope without automatic staging. Local existence is not durable, independently recoverable retention. Until access controls, authorized recovery and original-byte checks are established, retain the worktree and mark artifact finalization/cleanup pending. The sibling archive is backup only. Do not add a .gitattributes exception unless exact approved publication of the historical CRLF file requires one. Preserve all F011 historical bytes, manifests and approval limits.

The [P01–P30 questionnaire](specs/012-prescription-safety-governed-overrides/readiness/clinical-pharmacist-review-questionnaire.md) only prepares professional consultation. Every question awaits input. No professional identity, credentials, participation, clinical validation, Medical Director approval or OPEN-CLIN closure is established. The [reviewer candidate](docs/architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md#selected-direction-for-contract-review--not-an-approved-boundary) uses synthetic designations only; effective F012 operations remain ten and twelve remains an unapproved contract-review candidate. All applicable OPEN gates, named owners, evidence requirements and earliest blocked stages remain intact. Spec Kit stays 1.1.3 with custom workflow 2.3.0.

## Compatibility preparation successor — 2026-10-16

> Prospective correction only; NOT APPROVED, NOT EFFECTIVE. Earlier conflicting proposal wording is retained as historical preparation.

The exact six-file compatibility patch was authorized for preparation and applied to the isolated candidate, not ratified. Canonical Constitution 3.0.0 and PRD/Master 2.2.0 remain prospective successors; the prior effective baseline controls pending exact approval, PR A verification and separately authorized PR B activation. Future lifecycle input loading must distinguish immutable mechanism-only fixtures from verified genuine-name nonclinical source-condition matching; source matches never supply complete clinical assessments. The current 43-path prospective inventory is pr-a-source-delta.json beside the source manifest; the older 38-path inventory is historical. This correction grants no staging, Git integration, lifecycle stage or exemption from the existing verification/live-acceptance requirements.

Use the [current source and release-binding manifest](specs/012-prescription-safety-governed-overrides/readiness/real-medicine-research/source-manifest.json) and its separately indexed publication inventory. The canonical Constitution remains the sole normative constitutional locator; supplementary records cannot activate it. P01–P30 remains AWAITING_PROFESSIONAL_INPUT. All applicable OPEN IDs, owners, closure evidence, restrictions and earliest blocked stages are preserved. Effective operations remain ten; R1/R2 and twelve are unapproved candidates. F012 remains NOT READY — PRE_SPECIFY_BLOCKED.
