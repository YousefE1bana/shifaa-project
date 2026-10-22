# SHIFAA work management

Operational tooling prepared under the Product Owner’s 2026-10-21 GitHub/storage maintenance authorization, based on PR #503 head `b1fe533fd3676acfb0b9e42bcc43bd00ce3f7826`. This is no amendment to SHIFAA authority or integration policy.

Current integration successor: [2026-10-22 reconciliation](integration-2026-10-22.md). PR #503 is now squash-merged; the historical receipts below retain their original preparation context.

[Issue #504](https://github.com/YousefE1bana/shifaa-project/issues/504) owns this work. [SHIFAA Engineering](https://github.com/users/YousefE1bana/projects/1) is a private personal-account Project linked to this repository. Human team setup alone is deferred.

## Classification

The [label manifest](../../.github/labels.json) is the reproducible taxonomy: 45 labels with descriptions and colors. Exactly one `type:*` describes the primary deliverable. Multiple domains/specs require direct evidence. Do not classify from a passing mention in boilerplate.

| Dimension           | Values                                                           | Meaning                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Type                | `bug`, `feature`, `task`, `epic`, `maintenance`, `documentation` | Defect, user capability, bounded engineering work, real umbrella with children, technical upkeep, or primarily documents/evidence         |
| Priority            | `priority:p0`–`p3`                                               | Immediate, next, planned, backlog coordination; optional and justified in the body                                                        |
| Severity            | `severity:s1`–`s4`                                               | Critical exposure/data loss/outage; major broken capability; limited failure/workaround; minor impact. Bugs only; never clinical severity |
| Domain              | `area:*`                                                         | Backend, frontend, mobile, database, DevOps, infrastructure, security, testing, documentation, governance, contracts                      |
| Feature             | `spec:001`–`012`                                                 | Existing owning spec directory; does not mean implemented/accepted. Add future spec labels only with an actual authorized owner           |
| Current constraints | `blocked:governance`, `blocked:external`, `approval:*`           | Name the actual outstanding gate/dependency/acceptance requirement in the body; labels are never approval                                 |
| Other               | `debt:technical`, `needs:triage`, `duplicate`                    | Concrete debt, unresolved classification/reproduction, or duplicate linked to its canonical work                                          |

Unknown priority, severity, effort and dates remain blank. Historical closed work does not receive a present-day blocker merely because its body mentions a historical gate. Metadata corrections preserve state, assignees, historical descriptions and merge records; #504 has an explicit authorized scope successor.

Native Issue Types are **not claimed implemented**. Listing returned Task/Bug/Feature, but REST assignments (including API version 2026-03-10) and GraphQL `updateIssue` independently read back `null` for #504 in this personally owned repository. The effective fallback is `type:*`, including Epic/Maintenance/Documentation. GitHub’s [organization Issue Types guidance](https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/planning-and-tracking-work-for-your-team-or-project) is not authorization to transfer SHIFAA. No OAuth scopes, collaborator permissions or Organization ownership were changed.

## Everyday use

Six [Issue Forms](../../.github/ISSUE_TEMPLATE/) set the type label; bug reports require reproducible steps, expected/actual behavior, environment/revision and safe evidence. Optional priority/severity text does not automatically create labels: a maintainer applies only justified labels. Native type fields are deliberately omitted. The security contact routes to private vulnerability reporting, which was enabled and independently read back `enabled: true`; never submit PHI or credentials.

The [PR template](../../.github/pull_request_template.md) records the linked Issue/spec, exact tested SHA, command/exit/duration/cache state, negatives, retention and human acceptance. A PR author selects its one type label. The [metadata workflow](../../.github/workflows/metadata.yml) validates Issue/PR label events and runs the [stdlib validator tests](../../tools/github-metadata.test.mjs), with pinned actions, read-only permissions and no credentials persisted in checkout. JSON event values are data, never shell source. It changes no labels, project state, approvals or branch protection. The workflow becomes active only after its source is integrated; local execution is not a hosted CI claim.

The workflow is an advisory quality check: a PR can edit the validator and tests executed from its own head. It is not tamper-proof policy enforcement, authorization, or a substitute for review and branch protection.

Focused local command: `node --test tools/github-metadata.test.mjs`. Event validation: `node tools/github-metadata.mjs --validate-github-event <event-json-path>`; exit 0 is valid metadata, 1 is policy rejection, 2 is malformed input/usage. The original root 42-command verification chain is unchanged; Family/Privacy E2E remain separate.

## Project

Saved views: **Engineering backlog** (Table), **Engineering board** (Status), **Engineering roadmap** (Iteration start/end). Fields: Status, optional Priority, Feature / Spec, numeric Effort and native Iteration. Effort is relative engineering size, not a promised duration. No priority, effort, iteration assignment or delivery commitment was invented. #493’s Feature / Spec is 012; cross-repository maintenance has no forced single-feature allocation.

Statuses: Todo, In Progress, Review / acceptance, Blocked, Done. On the 2026-10-22 readback, #493 is Blocked, #504 In Progress, #502 Review / acceptance, and merged PR #503 Done. Done is a coordination disposition, not clinical/legal/production approval or permission to advance SpecKit. A closed/rejected item’s Issue body remains the disposition authority.

Native workflows automatically intake new/updated open SHIFAA Issues/PRs, add sub-issues, initialize Todo, reflect actual closure/merge as Done, and return reopened work to Todo. Status-driven **Auto-close issue is OFF**, as is automatic In Progress on PR linkage. Code-review approval, auto-archive and other unconfigured workflows stay off. No automation closes #493 or interprets human/professional approval. Project access remains private and unchanged; its default repository and repository Projects listing are SHIFAA.

## Integration and retained evidence

The [maintenance receipt](maintenance-2026-10-21.md) and [classification audit](history-classification.csv) distinguish live configuration, local source validation and pending publication/integration. Full private inputs, per-item reasons/body hashes, API responses and storage manifests are indexed from [F001](../../specs/001-identity-onboarding/evidence/work-management-storage-2026-10-21.json), with additive storage references from affected feature owners. Do not upload private Docker backups or raw environment/configuration records.

PR #503 was squash-merged as `4511c2574e50e59609578256eb77b0dd55a6cbd3`. This separate follow-on branch is reconciled onto that main commit; the original tested branch remains reachable through `codex/github-work-management-tested-2b41bcdd`. Publication must satisfy AGENTS.md or have its own exact attributable disposition; the #503-only exception does not transfer. Yousef Osama performs human squash merges. No invitations, onboarding, collaborator changes, team-specific CODEOWNERS, human assignments, Organization transfer or F012 lifecycle is executed here. Issue #493 stays OPEN and clinical/legal gates remain unchanged.
