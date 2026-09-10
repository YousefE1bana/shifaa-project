# [FEATURE] Requirements and Release Checklist

> Each checked item links to evidence. A statement such as “done,” “verified,” or “approved” without artifact/version/digest, reviewer where required, and date is not evidence.

## Traceability and scope

- [ ] CHK000 Every target ID is `ACTIVE` in the cited current PRD version; no deferred, retired, reserved, or unknown ID entered spec/plan/tasks. Any re-entry ADR predates this feature and its synchronized scope updates are linked.
- [ ] CHK001 Every target FR/NFR is in spec metadata, plan, tasks, implementation, test, and trace matrix.
- [ ] CHK002 Every remote operation is in API catalog and OpenAPI; every operation cites FR/NFR IDs.
- [ ] CHK003 Every table/state/RLS rule is in data-model and migration/policy tests.
- [ ] CHK004 Scope and non-goals match PRD; additions passed change control.

## Egyptian legal/privacy

- [ ] CHK005 Primary/official sources support legal claims; policy/inference/open items are labeled.
- [ ] CHK006 Processing inventory, lawful basis, Arabic-first notice/consent, recipients, retention, residency, processor, DPO, and DSR impacts are complete.
- [ ] CHK007 Applicable PDPC/EDA/MoHP/MOSS/UHI/CBE/facility/professional evidence is attached or the feature remains blocked.
- [ ] CHK008 Prohibited logging/analytics, encryption, breach, retention, and vendor controls pass tests/review.

## Safety and governance

For CHK009, CHK011, and CHK012, record `N/A — <objective reason>` in the evidence artifact when the feature has no clinical, emergency-contact, or AI behavior. Do not mark an inapplicable control as silently passed.

- [ ] CHK009 If clinical: code/content/override/test set carries required physician and clinical-pharmacist signatures; otherwise evidence records objective N/A.
- [ ] CHK010 Separation of duties is enforced and self-approval negative tests pass.
- [ ] CHK011 If Emergency Contacts are reachable: only the approved active-SOS minimum template can reach them; otherwise evidence records objective N/A.
- [ ] CHK012 If AI is used: it remains advisory, red flags run first, and evaluation/rollback/kill-switch evidence is attached; otherwise evidence records objective N/A.

## Engineering quality

- [ ] CHK013 Constitution Articles I–XV pass or are objectively N/A.
- [ ] CHK014 State transitions, transaction boundaries, idempotency, races, retries, DLQ, and rollback/roll-forward pass.
- [ ] CHK015 API/RLS negative authorization and data-minimization tests pass.
- [ ] CHK016 Arabic/English/RTL, WCAG 2.2 AA, reference viewports/devices, loading/empty/error/offline/stale/success states pass.
- [ ] CHK017 Performance, observability/redaction, security, backup/restore, and incident evidence meets applicable NFRs.

## Release decision

| Gate | Reviewer | Artifact/version/digest | Decision/date | Open blocker |
|---|---|---|---|---|
| Product/QA | [name] | [evidence] | [decision] | [OPEN/NONE] |
| Architecture/Security | [name] | [evidence] | [decision] | [OPEN/NONE] |
| Legal/DPO | [name] | [evidence] | [decision] | [OPEN/NONE] |
| Clinical | [names] | [evidence] | [decision] | [OPEN/NONE] |
| Design/Accessibility | [name] | [evidence] | [decision] | [OPEN/NONE] |
