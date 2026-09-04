# OPEN-PRIV-001 Re-identification Risk Decision Package

| Field               | Value                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Feature             | 008 — Audit, Admin Aggregates, and Observability                                                  |
| Decision            | OPEN-PRIV-001 — minimum-cell threshold and dimensions for admin aggregate disclosure              |
| Package version     | `1.0.0-approved`                                                                                  |
| Prepared            | 2026-09-02                                                                                        |
| Status              | **APPROVED — OPEN-PRIV-001 CLOSED FOR GRADUATION ENGINEERING**                                    |
| Approval roles      | Product Owner / Architecture Lead; Security Lead; Data Lead; Project DPO / Privacy Decision Owner |
| Protected operation | Existing catalogued `getAdminSummary` operation only                                              |

> Yousef Osama approved this policy for the current graduation-project
> engineering scope under all four approval roles listed above. This closes
> OPEN-PRIV-001 for `SPEC_APPROVED`; it does not activate an aggregate metric,
> authorize implementation, or approve production release.

## 1. Approved decision

Feature 008 shall use the following disclosure-control baseline for the
existing `getAdminSummary` operation:

- count distinct protected subjects, not rows or events;
- suppress every person-derived cell containing **0 through 10** distinct
  protected subjects;
- release an exact count beginning at **11** only when the complete response
  also passes combination, complementary-suppression, and linked-release checks;
- expose only fixed, server-owned distinct-subject aggregate cards and the narrowly allowed
  dimensions and combinations in this package;
- prohibit arbitrary queries, drill-down, overlapping/rolling periods, rare
  dimensions, and every patient-level or audit-detail disclosure;
- fail closed unless an approved, integrity-checked policy configuration is
  active.

The approved minimum releasable cell size is therefore **11** for the current
graduation engineering scope.

## 2. Authority, scope, and non-scope

### 2.1 Binding repository authority

This package is constrained by:

- `docs/governance/SHIFAA-Remaining-Specs-Roadmap.md`;
- `shifaa-prd.md`;
- `docs/architecture/SHIFAA-API-Catalog.md`;
- `docs/architecture/SHIFAA-Data-RLS.md`;
- `docs/design/SHIFAA-UI-Contract.md`;
- `specs/008-audit-admin-aggregates-observability/spec.md`.

Where this policy conflicts with a higher-authority canonical repository
document, the higher authority wins and the affected release remains disabled
pending reconciliation. The closure record does not override source precedence.

### 2.2 In scope

- Disclosure control for the minimum-cell-protected aggregate counts returned
  by the existing `GET /v1/admin/dashboard-summary` / `getAdminSummary`
  operation.
- The approved threshold, dimension allowlist, suppression behavior,
  configuration contract, and deterministic review/test vectors.
- Risk to a natural person from singling out, linkage, inference, repeated
  releases, differencing, or misuse of dashboard aggregates.

### 2.3 Out of scope

This package does **not**:

- add an API operation, query parameter, filter, report, export, or drill-down;
- define the eventual dashboard metrics or source queries;
- authorize patient-level analytics or raw PHI in logs, audit, metrics, traces,
  caches, or exports;
- change audit access, RLS, AAL2, purpose-of-use, or DPO permissions;
- approve public release or sharing outside the authorized admin dashboard;
- assert that thresholding makes data anonymous;
- define an Egyptian legal conclusion or replace DPO/legal review;
- assign SEC-004 or audit hash chaining to Feature 008;
- modify or absorb `security/sec-001-002-remediation`;
- authorize implementation, SpecKit planning, task generation, analysis, issue
  creation, or lifecycle advancement.

## 3. Data and release model assessed

### 3.1 Release surface

The assessed surface is one fixed server response used by the admin dashboard.
The client may render only the cells returned by that response. The client does
not select arbitrary dimensions, date ranges, categories, or grouping clauses.

Every response is treated as one **release set**. All cards, totals, subtotals,
localized representations, accessibility text, metadata, and simultaneously
available prior snapshots are assessed together before any exact count is
released.

### 3.2 Protected statistical unit

Each approved metric must declare one protected statistical unit:

| Metric basis                                                      | Required protected unit                 | Counting rule                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Patient activity or patient-owned records                         | `patient`                               | Count distinct internal patients represented by the cell                                                 |
| Workforce, administrator, actor, or other natural-person activity | `person`                                | Count distinct internal persons represented by the cell                                                  |
| Repeated events or records                                        | The natural person behind the records   | Deduplicate before threshold evaluation; do not release the event/record count                           |
| Truly non-person operational entities                             | Explicitly approved `non_person_entity` | No exemption by assumption; Data Lead and DPO must approve the classification and zero policy per metric |

For a person-derived metric, the released measure itself is the distinct
protected-subject count. Row count, event count, encounter count, audit-event
count, and record count are prohibited even when the distinct-subject threshold
is met; otherwise one subject could dominate the released measure.

### 3.3 Adversaries and knowledge assumed

The assessment assumes a motivated intruder or insider who:

- has legitimate access to the admin summary but not necessarily detail data;
- knows local facilities, staff, patients, public events, schedules, or unusual
  service patterns;
- can save screenshots and compare Arabic and English views;
- can compare successive releases and other authorized reports;
- can combine totals, subtotals, categories, or externally known facts;
- may attempt to infer whether a particular person is present in a cell;
- may intentionally choose observation times that isolate a person;
- may collude with another legitimate user or misuse knowledge obtained in a
  different role.

The assessment does not assume that identifiers must be visible for harm to
occur. Singling out, membership inference, and attribute inference are harms
even where a name is absent.

## 4. Documented re-identification-risk assessment

### 4.1 Method

Risk is evaluated for singling out, linkability, and inference, including the
effect of repeated and linked releases. The scoring scale is:

- likelihood: 1 rare, 2 unlikely, 3 possible, 4 likely, 5 almost certain;
- impact: 1 negligible through 5 severe;
- score: likelihood multiplied by impact;
- rating: 1–4 low, 5–9 moderate, 10–16 high, 17–25 critical.

Residual scores assume every control in this package is implemented and
verified. They are not statements that the controls currently exist.

| ID  | Re-identification path                                                             | Inherent L×I | Required controls                                                                                                          | Residual L×I | Residual rating |
| --- | ---------------------------------------------------------------------------------- | -----------: | -------------------------------------------------------------------------------------------------------------------------- | -----------: | --------------- |
| R1  | A small count singles out a known patient or worker                                |       4×5=20 | Suppress 0–10 distinct subjects; prohibit detail and rare dimensions                                                       |        1×5=5 | Moderate        |
| R2  | Local/public knowledge links a facility, place, date, or rare category to a person |       4×5=20 | Prohibit exact facility, geography, exact time, clinical and demographic dimensions                                        |        1×5=5 | Moderate        |
| R3  | Totals and subtotals reveal a suppressed cell by subtraction                       |       5×5=25 | Complementary suppression across the whole response and linked cards                                                       |        1×5=5 | Moderate        |
| R4  | Repeated, rolling, or overlapping snapshots reveal additions/removals              |       4×5=20 | Closed non-overlapping periods; immutable snapshots; linked-release review                                                 |        1×5=5 | Moderate        |
| R5  | Many rows for one subject falsely satisfy the threshold                            |       4×5=20 | Count distinct protected subjects and test duplicate-heavy inputs                                                          |        1×5=5 | Moderate        |
| R6  | Many dimensions create a unique or rare intersection                               |       5×5=25 | Fixed templates, allowlisted combinations, maximum two dimensions                                                          |        1×5=5 | Moderate        |
| R7  | Arabic/English or accessible UI variants disclose inconsistent values              |       3×4=12 | One server decision reused identically by all presentations                                                                |        1×4=4 | Low             |
| R8  | Errors, logs, cache keys, metrics, traces, or metadata leak suppressed counts      |       3×5=15 | Redacted generic states; no raw count in side channels; private/no-store                                                   |        1×5=5 | Moderate        |
| R9  | A privileged insider combines the summary with other knowledge or access           |       3×5=15 | Existing authorization, AAL2/purpose controls where canonical, audit, same dashboard suppression for every role, no bypass |        1×5=5 | Moderate        |
| R10 | An unapproved or tampered configuration weakens disclosure control                 |       4×5=20 | Versioned policy, approved digest, recorded approval roles, integrity validation, fail closed                              |        1×5=5 | Moderate        |
| R11 | One subject dominates a released event/record count despite `k >= 11`              |       4×5=20 | Person-derived measures are distinct-subject counts only; event/record measures are rejected                               |        1×5=5 | Moderate        |

### 4.2 Overall assessment

The inherent risk is **critical** because health-related and workforce
aggregates can expose participation or activity through small cells, local
knowledge, and subtraction. The proposed controls reduce the assessed residual
risk to **moderate**, not zero.

The threshold is only one layer. It does not prevent linkage or differencing by
itself, and it does not convert the result into anonymous or publicly releasable
data. Yousef Osama accepts the stated residual risk for the restricted
graduation-engineering admin-dashboard context under the four recorded approval
roles. This is not production residual-risk acceptance.

### 4.3 Approved threshold rationale

The approved threshold releases at 11 distinct protected subjects and
suppresses 0–10. The rationale is:

1. SHIFAA handles health-related information, where identification or
   participation inference can have severe consequences.
2. A threshold of 11 is consistent with a conservative health-data convention
   in which cells from 1 through 10 are suppressed. This is comparative
   evidence, not governing law for SHIFAA.
3. The threshold is stronger than examples that suppress only 1–4, while still
   permitting useful fixed operational counts where sufficient subjects exist.
4. Distinct-subject counting avoids a false sense of safety from many events
   generated by one person.
5. Including zero in the suppressed band prevents the UI from distinguishing
   “nobody” from “a small number,” which otherwise supports presence or absence
   inference.
6. Complementary and linked-release controls address attacks that a primary
   threshold cannot stop.

The number 11 remains governed. A future policy amendment may increase it or
require metric-specific higher thresholds. Any policy-level change requires
regeneration of the expected boundary vectors and approval of a new package
digest.

## 5. Permitted dimensions and combinations

### 5.1 Governing rule

No dimension is permitted merely because it appears in this section. A metric
must be explicitly listed in the approved configuration, and its own dimension
allowlist may be narrower than the global allowlist. Unknown metrics,
dimensions, categories, or combinations fail closed.

### 5.2 Approved permitted dimensions

| Dimension                        | Approved permission     | Constraints                                                                                                       |
| -------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| No dimension                     | Permitted               | One fixed system-wide aggregate cell                                                                              |
| `calendar_month_utc`             | Permitted               | Completed UTC calendar months only; no current/open month; the only approved time grain                           |
| `facility_type`                  | Permitted               | Closed canonical values only: `clinic`, `pharmacy`, `hospital`, `laboratory`; no facility identifier or location  |
| `approved_workflow_status_class` | Conditionally permitted | Closed, coarse, per-metric mapping approved in the same configuration; raw/free-form status values are prohibited |

The workflow-status name above is a policy abstraction, not a new API field or
canonical domain value. No status grouping is usable until a later approved
per-metric configuration lists the exact source-to-group mapping.

### 5.3 Approved permitted combinations

Only these combinations may be configured:

1. no dimension;
2. one completed UTC calendar-month dimension;
3. `facility_type` only;
4. one approved workflow-status class only;
5. one completed time dimension plus `facility_type`;
6. one completed time dimension plus one approved workflow-status class.

At most two dimensions may be present, and at most one may be categorical.
Every other combination is prohibited by default.

### 5.4 Prohibited dimensions and combinations

The following are prohibited for Feature 008 admin-summary disclosure:

- facility identifier, facility name, licence number, address, governorate,
  city, district, map cell, coordinates, or any other geography;
- patient, person, user, actor, resource, event, encounter, export, or audit
  identifier, including stable hashes or pseudonyms;
- exact date, exact time, hour, day, week, quarter, year, arbitrary range,
  rolling period, sliding window, cumulative period, or overlapping period;
- age, date of birth, age band, sex, gender, nationality, identity-document
  type, disability, child/dependent status, family relationship, guardian, or
  delegate status;
- diagnosis, condition, medication, allergy, laboratory result, pregnancy,
  encounter reason, specialty, procedure, note, free text, or other clinical
  characteristic;
- raw workflow status, rare/ad hoc category, user-supplied label, or a category
  not fixed in the approved configuration;
- `facility_type` combined with workflow status;
- two categorical dimensions or three or more dimensions;
- rates, percentages, ratios, averages, minima, maxima, medians, quantiles, or
  any statistic other than an approved count;
- arbitrary filters, search, sorting, pagination, drill-down, or export from the
  dashboard summary;
- any combination of the summary with audit-event list/detail filters;
- any role-specific or locale-specific bypass of suppression.

## 6. Suppression and differencing protections

### 6.1 Primary suppression

For person-derived metrics:

- `distinct_subject_count` from 0 through 10: return a suppression state, never
  the exact value;
- `distinct_subject_count` of 11 or more: eligible for release, subject to every
  remaining check;
- invalid, negative, non-integral, missing, or indeterminate counts: fail closed
  as unavailable; never coerce into a releasable value.

The outward state must not distinguish zero from 1–10. It may use a generic
localized message such as “suppressed for privacy,” but must not expose a
numeric range, hidden raw value, or machine-readable exact count.

### 6.2 Complementary suppression

Primary suppression is insufficient where visible totals or sibling cells can
reveal the hidden value. Before release, the server must:

1. construct the complete response release set;
2. identify every primary-suppressed cell;
3. model row, column, category, and card equations available to the recipient;
4. for every declared additive equation whose child set contains a suppressed
   cell, suppress that equation's declared parent-total cell;
5. process equations by ascending stable `equation_id` and repeat to a fixed
   point, because a parent can itself be a child in another equation;
6. validate that no suppressed cell is exactly derivable from remaining visible
   cells across the linked-release group;
7. reject the entire linked-release group if an equation is undeclared,
   ambiguous, cyclic, lacks one unique parent, or still permits exact
   derivation.

This policy always protects a small child by suppressing the parent total,
never by choosing among sibling cells. Each internal `cell_id`, `equation_id`,
unique parent, ordered child set, and linked-release group is fixed in the
approved configuration and is not returned as a patient-related selector. The
result is deterministic for a policy version and release set: retries and
locales suppress the same cells. Where no safe parent-total solution exists,
the group is rejected rather than choosing an alternative at runtime.

### 6.3 Linked-release and differencing control

- All cards in one response are evaluated together.
- Arabic and English presentations use the same server response and suppression
  decisions.
- A completed UTC calendar-month snapshot is immutable once released under a
  policy version.
- Open periods, quarter/year/cumulative totals, rolling windows, arbitrary
  ranges, alternate time grains, and overlapping time buckets are prohibited.
- Current and prior approved snapshots that can be accessed together are
  included in the linked-release check.
- A new metric, category mapping, total, or subtotal requires a later per-metric
  risk review and approved configuration within this policy. A new time grain
  is a policy-level change and requires an approved package amendment.
- Where a safe deterministic complementary-suppression set cannot be found, the
  entire affected card fails closed.

### 6.4 Side-channel protections

Suppressed or rejected values must not appear in:

- response metadata, headers, ETags derived from raw values, error details, or
  timing-dependent branches intended to reveal count size;
- web/mobile hidden elements, tooltips, accessibility labels, test IDs, or
  analytics payloads;
- logs, traces, metrics labels, cache keys, audit payloads, outbox events, or
  support diagnostics;
- localized strings or alternate role-specific renderings.

Summary responses must be treated as private and not stored by shared caches.
Observability may record policy version, decision class, and reason code, but
not a suppressed exact count or subject identifier.

### 6.5 Controls explicitly not selected

This policy does not introduce random noise, differential privacy, or a
privacy budget. Those mechanisms need separate utility analysis, parameter
governance, composition accounting, and canonical authorization. They must not
be silently added as a substitute for the controls above.

## 7. Approved policy configuration contract

The following is a non-executable contract shape for review. It does not create
a file format, API schema, database table, or implementation requirement by
itself.

```yaml
policy_id: OPEN-PRIV-001
package_version: 1.0.0-approved
policy_status: approved # approved | retired
effective_at: 2026-09-01T22:50:25Z
package_sha256_reference: ./OPEN-PRIV-001-reidentification-risk-decision-package.sha256

threshold:
  minimum_releasable_distinct_subjects: 11
  primary_suppression_min: 0
  primary_suppression_max: 10
  person_derived_zero_policy: suppress

release_rules:
  fixed_server_templates_only: true
  completed_periods_only: true
  immutable_closed_snapshots: true
  max_dimensions: 2
  max_categorical_dimensions: 1
  complementary_suppression: required
  linked_release_check: required
  locale_and_role_bypass: prohibited

allowed_time_dimensions:
  - calendar_month_utc

allowed_categorical_dimensions:
  facility_type:
    values: [clinic, pharmacy, hospital, laboratory]
  approved_workflow_status_class:
    values: [] # fail closed until an exact per-metric mapping is approved

allowed_combinations:
  - []
  - [calendar_month_utc]
  - [facility_type]
  - [approved_workflow_status_class]
  - [calendar_month_utc, facility_type]
  - [calendar_month_utc, approved_workflow_status_class]

metrics: [] # approved policy state: no aggregate metric is activated yet
linked_release_groups: [] # every additive relationship must be declared

approval_record:
  signer: Yousef Osama
  decision: APPROVED
  scope: graduation_engineering
  roles:
    - product_owner_architecture_lead
    - security_lead
    - data_lead
    - project_dpo_privacy_decision_owner
  recorded_at: 2026-09-01T22:50:25Z
```

### 7.1 Required per-metric entry

Every metric entry must contain:

| Field                        | Contract                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `metric_id`                  | Stable, non-PHI identifier from the canonical approved metric set                                                                       |
| `description`                | Human-readable definition and operational purpose                                                                                       |
| `source_entities`            | Exact canonical sources; no free-form runtime source                                                                                    |
| `protected_unit`             | `patient`, `person`, or explicitly approved `non_person_entity`                                                                         |
| `distinct_subject_key_class` | Internal key class used only for deduplication; never returned or logged                                                                |
| `measure`                    | `distinct_subject_count` for person-derived metrics; `approved_non_person_entity_count` only after explicit classification and approval |
| `allowed_dimensions`         | Metric-specific subset of the global allowlist                                                                                          |
| `allowed_combinations`       | Metric-specific subset of the global combinations                                                                                       |
| `status_mapping`             | Required exact coarse mapping if workflow status is used; otherwise absent                                                              |
| `zero_policy`                | `suppress` for person-derived metrics; explicit later approved configuration for a non-person metric                                    |
| `higher_threshold`           | Optional integer greater than 11 where sensitivity requires it                                                                          |
| `linked_release_group`       | Identifier grouping every mutually derivable card/snapshot                                                                              |
| `cell_id`                    | Stable internal identifier used by the suppression graph; not an API selector                                                           |
| `owner`                      | Accountable data owner                                                                                                                  |
| `approval_artifact_digest`   | Digest of the exact signed approval covering this metric                                                                                |

An empty metric list means no aggregate is activated or authorized for release.
It does **not** block OPEN-PRIV-001 closure, `SPEC_APPROVED`, or planning because
the policy-level risk decision is complete. Global allowlisting does not
implicitly authorize a metric. Each individual metric and any workflow-status
mapping remain fail-closed until a later approved configuration supplies every
required entry.

Every linked-release group must list its cells and every additive equation as:

```yaml
- equation_id: stable_non_phi_identifier
  parent_cell_id: one_unique_total
  child_cell_ids: [ordered_mutually_exclusive_child_ids]
```

For person-derived equations, child populations must be mutually exclusive so
that distinct-subject counts are additive. If additivity cannot be proven from
the approved definition, the equation and affected group are invalid and fail
closed.

### 7.2 Activation and integrity rules

A policy configuration can activate an individual metric only when:

- `policy_status` is `approved`;
- all required policy approval roles are recorded for the approved package;
- `effective_at` is present and not backdated around an unreviewed release;
- the runtime configuration's `package_sha256` reference equals the approved
  Markdown-package digest;
- the runtime configuration bytes independently match the separate
  `runtime_config_sha256` recorded in the detached approval/deployment record;
- the specific metric has a complete, later approved per-metric entry;
- all dimension values and combinations are subsets of this approved contract;
- no approval condition remains unresolved.

Missing, malformed, expired, retired, conditionally approved, partially signed,
or digest-mismatched configuration must fail closed for disclosure. An empty
`metrics` list is the approved initial inactive state: it keeps every metric
disabled but does not reopen OPEN-PRIV-001 or block planning.

### 7.3 Configuration change control

Changing any of the following policy-level controls requires a new package
version, risk assessment, deterministic expected vectors, and renewed approval:

- threshold or zero policy;
- global dimension allowlist, canonical `facility_type` values, combination, or
  time grain;
- complementary-suppression or linked-release algorithm;
- snapshot or retention behavior affecting differencing;
- approval or integrity-validation rules.

Adding an individual metric, source definition, protected unit, higher
threshold, linked-release group, or status mapping within these approved global
controls requires a later approved per-metric configuration. Such a
configuration does not reopen OPEN-PRIV-001, but the metric remains fail-closed
until that approval exists.

## 8. Deterministic boundary and attack test vectors

These are decision vectors, not an implementation task list. Each future test
must use fixed fixtures and compare the complete response, side channels, and
all linked cells. `SUPPRESS` means no exact value is observable. `REJECT` means
the requested/configured release fails closed.

| ID              | Fixture / attack                                                                                                                                      | Expected decision                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| TV-PRIV-001-001 | Person-derived cell with 0 distinct subjects                                                                                                          | `SUPPRESS`; indistinguishable from 1–10                                                              |
| TV-PRIV-001-002 | Cell with 1 distinct subject                                                                                                                          | `SUPPRESS`                                                                                           |
| TV-PRIV-001-003 | Cell with 10 distinct subjects                                                                                                                        | `SUPPRESS`                                                                                           |
| TV-PRIV-001-004 | Cell with 11 distinct subjects; no linked derivation risk                                                                                             | Release exact 11                                                                                     |
| TV-PRIV-001-005 | Cell with 12 distinct subjects; no linked derivation risk                                                                                             | Release exact 12                                                                                     |
| TV-PRIV-001-006 | 20 events belonging to one patient                                                                                                                    | `SUPPRESS`; protected count is 1, not 20                                                             |
| TV-PRIV-001-007 | 15 events belonging to 10 patients                                                                                                                    | `SUPPRESS`; protected count is 10                                                                    |
| TV-PRIV-001-008 | 40 events belonging to 11 patients                                                                                                                    | Eligible person-derived measure is 11 distinct patients; event count 40 is not released              |
| TV-PRIV-001-009 | Allowed `facility_type=hospital`, protected count 10                                                                                                  | `SUPPRESS`                                                                                           |
| TV-PRIV-001-010 | Allowed completed month + `facility_type`, protected count 11, no linked risk                                                                         | Release exact approved count                                                                         |
| TV-PRIV-001-011 | Dimension is exact `facility_id`                                                                                                                      | `REJECT`, regardless of count                                                                        |
| TV-PRIV-001-012 | Dimension is governorate, city, district, or coordinates                                                                                              | `REJECT`, regardless of count                                                                        |
| TV-PRIV-001-013 | Combination is `facility_type` + workflow status                                                                                                      | `REJECT`; two categorical dimensions                                                                 |
| TV-PRIV-001-014 | Combination has three dimensions                                                                                                                      | `REJECT`                                                                                             |
| TV-PRIV-001-015 | Current/open month                                                                                                                                    | `REJECT`                                                                                             |
| TV-PRIV-001-016 | Rolling 30-day or arbitrary date range                                                                                                                | `REJECT`                                                                                             |
| TV-PRIV-001-017 | Quarter, cumulative total, alternate grain, or two overlapping periods whose difference isolates a small cell                                         | `REJECT` the prohibited time definition before release                                               |
| TV-PRIV-001-018 | Declared equation `T=A+B`; A=10, B=90, T=100                                                                                                          | Suppress A by primary rule and T by parent-total rule; release B=90                                  |
| TV-PRIV-001-019 | Declared equation `T=A+B+C`; A=9, B=11, C=80, T=100                                                                                                   | Suppress A and T; release B=11 and C=80                                                              |
| TV-PRIV-001-020 | Linked cards reuse declared parent T=100 and child X=7 with sibling Y=93                                                                              | Suppress X and T in every card; release Y=93; differing card/locale choices fail the vector          |
| TV-PRIV-001-021 | Same release rendered in Arabic and English                                                                                                           | Identical values, suppression set, ordering rule, and reason class                                   |
| TV-PRIV-001-022 | User has a more privileged role or DPO role                                                                                                           | No dashboard suppression bypass; canonical route authorization remains independently enforced        |
| TV-PRIV-001-023 | Unknown metric, dimension, category, or combination                                                                                                   | `REJECT`                                                                                             |
| TV-PRIV-001-024 | Missing approval reference, conditional approval, different digest, or non-approved policy status                                                     | No release; configuration is inactive even though the canonical policy gate is closed                |
| TV-PRIV-001-025 | Negative, fractional, null, indeterminate, or overflow count                                                                                          | Fail affected cell/card closed; no coercion                                                          |
| TV-PRIV-001-026 | Response error, log, trace, metric, cache key, ETag, tooltip, or accessibility label inspected after suppression                                      | No exact suppressed count or subject identifier anywhere                                             |
| TV-PRIV-001-027 | Retry the same immutable snapshot under the same policy version                                                                                       | Byte-equivalent disclosure decisions; no alternating complementary cells                             |
| TV-PRIV-001-028 | Previously released closed snapshot is recomputed after late data arrival                                                                             | Do not mutate the released snapshot; require governed new-version handling and linked-release review |
| TV-PRIV-001-029 | Workflow status dimension has no approved closed mapping                                                                                              | `REJECT`                                                                                             |
| TV-PRIV-001-030 | Attempted drill-down, search, pagination, filter, or export from the summary                                                                          | `REJECT`; no such operation is authorized                                                            |
| TV-PRIV-001-031 | Non-person metric lacks explicit protected-unit classification or zero-policy approval                                                                | `REJECT`                                                                                             |
| TV-PRIV-001-032 | Approved per-metric threshold is 20 and protected count is 19                                                                                         | `SUPPRESS`; the higher metric-specific threshold wins                                                |
| TV-PRIV-001-033 | A person-derived metric requests event, encounter, record, or audit-row count for 11 subjects                                                         | `REJECT` the measure; only the distinct-subject count may be released                                |
| TV-PRIV-001-034 | Additive relationship is missing an equation, has two possible parents, has non-exclusive children, or remains derivable after fixed-point processing | `REJECT` the entire linked-release group                                                             |

### 8.1 Mandatory boundary assertions

Human approval must explicitly confirm these boundary semantics:

- the release boundary is `k >= 11`, not `k > 11`;
- the suppressed band is inclusive `0 <= k <= 10`;
- `k` is the distinct protected-subject count and, for person-derived metrics
  in this package, the only releasable measure; it is never a row/event count;
- eligibility at 11 does not override dimension or differencing checks;
- every policy/configuration error fails closed;
- no role or locale bypass exists.

## 9. Operational implications for later planning

This section records consequences of the approved policy without authorizing
implementation and without activating any metric. Later planning must preserve
the following implications:

- **Database/RLS:** raw aggregation sources remain protected by canonical RLS.
  Thresholding is not an RLS substitute, and no client-side aggregation is
  permitted. Deduplication keys remain server-side and are never disclosed.
- **Audit:** a future disclosure decision may record non-PHI policy metadata
  such as metric ID, policy version, release/suppress/reject class, and reason
  code. It must not record suppressed exact counts or subject identifiers.
- **Outbox:** the summary creates no new outbox event in this decision package.
  Suppressed values must not be copied into existing outbox payloads.
- **Observability:** future metrics may count suppression/rejection decisions by
  bounded reason code and policy version. They must not use patient/person IDs,
  raw counts, arbitrary dimensions, or PHI-bearing labels.
- **Caching:** shared/public caching is prohibited; any future private cache must
  preserve policy version, authorization context, immutable snapshot semantics,
  and side-channel constraints.
- **Availability:** privacy checks fail closed. An inability to calculate a safe
  release is not permission to return an unsuppressed fallback.

These implications must be reconciled with the canonical planning artifacts.

## 10. Recorded policy determinations

Yousef Osama approved the complete candidate and supplied the policy-level
clarification represented in version `1.0.0-approved`:

1. The minimum releasable distinct-subject count is 11.
2. Zero through 10 are suppressed together.
3. `approved_workflow_status_class` remains conditionally permitted but unusable
   until a later approved per-metric configuration supplies its exact mapping.
4. Completed UTC calendar month is the only approved time grain.
5. Facility type and the listed combinations are approved only within the
   policy and per-metric constraints; no facility identifier or geography is
   permitted.
6. The deterministic parent-total complementary-suppression algorithm and
   linked-release fail-closed rule are approved.
7. Each later metric configuration must declare its complete linked-release
   inventory before activation.
8. Moderate residual risk is accepted for the current access-controlled,
   synthetic-data graduation engineering scope only.

## 11. Approval record

### 11.1 Approved scope

The approval covers the documented re-identification assessment, `k=11`, 0–10
suppression, distinct-subject counting, permitted and prohibited dimensions and
combinations, complementary and linked-release protections, configuration
contract, and deterministic vectors.

`metrics: []` is the approved inactive initial configuration. It does not block
OPEN-PRIV-001 closure or planning. Each individual metric and status mapping
remains fail-closed until a later approved configuration activates it.

### 11.2 Immutable approval rows

| Signer       | Approval role                        | Decision   | Scope                  | Recorded at (UTC)      | Evidence reference                                           |
| ------------ | ------------------------------------ | ---------- | ---------------------- | ---------------------- | ------------------------------------------------------------ |
| Yousef Osama | Product Owner / Architecture Lead    | `APPROVED` | Graduation engineering | `2026-09-01T22:50:25Z` | Direct instruction by Yousef Osama in the current Codex task |
| Yousef Osama | Security Lead                        | `APPROVED` | Graduation engineering | `2026-09-01T22:50:25Z` | Direct instruction by Yousef Osama in the current Codex task |
| Yousef Osama | Data Lead                            | `APPROVED` | Graduation engineering | `2026-09-01T22:50:25Z` | Direct instruction by Yousef Osama in the current Codex task |
| Yousef Osama | Project DPO / Privacy Decision Owner | `APPROVED` | Graduation engineering | `2026-09-01T22:50:25Z` | Direct instruction by Yousef Osama in the current Codex task |

No external cryptographic signature or statutory DPO registration is claimed by
these engineering approval rows. Production privacy/legal authorization remains
subject to the unchanged production gates.

### 11.3 Approval basis and canonical digest

The reviewed basis was candidate version `0.1.0-candidate`, canonical SHA-256
`0f3db76d4c49dc524d4d5ab8b2b31c2f4c01d3204c4952c5b277193690b826f8`, plus
Yousef Osama's explicit policy correction recorded in sections 7 and 11.1.

Version `1.0.0-approved` is frozen after inserting the approval rows and policy
correction. Its canonical digest is SHA-256 over this entire Markdown file,
encoded as UTF-8 without a byte-order mark and with line endings normalized to
LF. The generated digest is stored in the adjacent
`OPEN-PRIV-001-reidentification-risk-decision-package.sha256` sidecar so the
package does not contain a self-referential hash.

### 11.4 Closure checklist

- [x] All four requested approval roles are recorded under Yousef Osama's name.
- [x] The decision is unconditional for the current graduation engineering
      scope.
- [x] The approved policy scope and deterministic vectors are complete.
- [x] `metrics: []` is recorded as an inactive configuration, not a closure or
      planning blocker.
- [x] Individual metrics and status mappings remain fail-closed pending later
      approved configuration.
- [x] The canonical governance register and Feature 008 specification are
      synchronized with this closure.
- [x] Implementation remains unauthorized in this approval record.

**Current approval state:** `APPROVED`; OPEN-PRIV-001 is `CLOSED` for the current
graduation-project engineering scope.

## 12. Reference basis

### 12.1 Canonical SHIFAA references

The repository documents listed in section 2.1 are the binding scope and
authority for Feature 008. The synchronized PRD records OPEN-PRIV-001 closed for
graduation engineering by this approved assessment, threshold/configuration,
and deterministic test set.

### 12.2 External comparative guidance

The following official sources informed the risk method and approved controls.
They are advisory comparisons only; they are not represented as Egyptian law or
as approval for SHIFAA:

- UK Information Commissioner's Office, “How do we ensure anonymisation is
  effective?” — motivated-intruder, singling-out, linkability, inference,
  k-anonymity, generalisation, and suppression guidance:
  <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/how-do-we-ensure-anonymisation-is-effective/>
- UK Office for National Statistics, “Policy on protecting confidentiality in
  tables of birth and death statistics” — differencing, linked-table, and
  secondary-suppression risks:
  <https://www.ons.gov.uk/methodology/methodologytopicsandstatisticalconcepts/disclosurecontrol/policyonprotectingconfidentialityintablesofbirthanddeathstatistics>
- UK Government Analysis Function, “Statistical disclosure control for tables
  produced from administrative data” — statistical-unit definition, repeated
  records, and linked-output risk:
  <https://analysisfunction.civilservice.gov.uk/policy-store/sdc-for-tables-produced-from-administrative-data/>
- UK Health Security Agency, “HIV and STI data publication guidelines” — health
  data small-cell and primary/secondary masking examples:
  <https://www.gov.uk/government/publications/hiv-and-sti-data-sharing-policy/ukhsa-hiv-and-sti-data-publication-guidelines>
- US Centers for Medicare & Medicaid Services, CMS-9915-F — comparative health
  data examples including suppression of cells from 1 through 10:
  <https://www.cms.gov/CCIIO/Resources/Regulations-and-Guidance/Downloads/CMS-Transparency-in-Coverage-9915F.pdf>

External guidance was reviewed on 2026-09-02. Its use does not displace the
recorded SHIFAA approval roles or the canonical baseline.

---

**Lifecycle effect:** OPEN-PRIV-001 is closed for graduation engineering.
Planning, task generation, analysis, and issue creation may proceed under the
canonical lifecycle. Implementation remains separately unauthorized.
