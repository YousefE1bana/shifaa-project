# SHIFAA — Master Implementation Plan

> **Document ID:** SHIFAA-MASTER  
> **Version:** 2.1.0  
> **Status:** Approved architecture baseline; production authorization blockers remain open  
> **Owner:** Product Owner + Architecture Lead  
> **Approved by:** Yousef Osama  
> **Approved on:** 9-Aug-2026  
> **Approval version:** v2.1.0  
> **Approval record:** [`docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md`](./docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md)  
> **Last verified:** 2026-08-09 (Africa/Cairo)  
> **Companion product source:** [`shifaa-prd.md`](./shifaa-prd.md)

## 0. Operating rules

This document contains the approved settled architecture, its reasoning, the immutable Constitution text, implementation sequence, SpecKit lifecycle, and the synchronized open-item register. It became the implementation baseline when Product Owner Yousef Osama approved v2.1.0 on 9-Aug-2026 and the artifact digests were recorded in the linked approval record. “Settled” means the team implements it unless a dated ADR and Product Owner approval amend it. Legal and clinical facts still require the evidence named in the compliance register.

Source precedence is: law/regulator instruction → Constitution → PRD requirement → this Master → supporting contract → feature specification → implementation. Stop and reconcile any conflict; never select the lower-level interpretation silently.

The architecture is decomposed without weakening this file’s handoff role:

| Artifact | Normative contents |
|---|---|
| [`shifaa-prd.md`](./shifaa-prd.md) | Scope, personas, FR/NFR IDs, acceptance outcomes, open register |
| [`docs/architecture/SHIFAA-Architecture.md`](./docs/architecture/SHIFAA-Architecture.md) | components, monorepo boundaries, runtime/deployment, integrations, event semantics |
| [`docs/architecture/SHIFAA-Data-RLS.md`](./docs/architecture/SHIFAA-Data-RLS.md) | tables, states, constraints, RLS policy matrix, retention classes |
| [`docs/architecture/SHIFAA-API-Catalog.md`](./docs/architecture/SHIFAA-API-Catalog.md) | complete `/v1` REST inventory, auth, idempotency, status/error behavior |
| [`docs/design/SHIFAA-UI-Contract.md`](./docs/design/SHIFAA-UI-Contract.md) | applications, routes, tokens, responsive/RTL/accessibility/state contracts |
| [`docs/compliance/EGYPT-Compliance-Baseline.md`](./docs/compliance/EGYPT-Compliance-Baseline.md) | verified Egyptian sources, obligations, prohibited assumptions, launch gates |
| [`docs/traceability/SHIFAA-Traceability-Matrix.md`](./docs/traceability/SHIFAA-Traceability-Matrix.md) | every FR/NFR to app, data, API, spec, and test |
| [`docs/governance/SHIFAA-Audit-Resolution-P1.md`](./docs/governance/SHIFAA-Audit-Resolution-P1.md) | P1-01 through P1-17 disposition and evidence |

## 1. Architecture outcomes and boundaries

### 1.1 Product topology

SHIFAA is a modular monolith with independently deployable user applications, one Core API, one asynchronous worker, and an isolated AI service. A modular monolith was selected because the domain needs strong transactions across prescriptions, inventory, beds, consent, and audit, while a ten-person team cannot safely operate microservice consistency and observability. Domain modules have explicit ports so they can be extracted later without changing public contracts.

Only the Core API may perform user-driven domain mutations. Browser/mobile clients do not call PostgREST tables, service-role APIs, storage administration, vendors, or AI directly. Supabase Auth issues identities; the API verifies the token, resolves contextual authorization, opens a transaction with request context for RLS, and performs the use case.

### 1.2 Canonical MVP applications

| App | Technology | Users | Scope rule |
|---|---|---|---|
| `apps/patient` | Expo / React Native, native Android/iOS plus web export | patients, guardians, delegates | one shared patient codebase |
| `apps/clinic` | Next.js installable PWA | doctors, nurses, reception, clinic owner | all clinic and prescribing operations |
| `apps/pharmacy` | Next.js installable PWA | pharmacist/director, authorized staff | all pharmacy operations |
| `apps/hospital` | Next.js installable PWA | hospital clinical/operational staff | all hospital operations |
| `apps/lab` | Next.js installable PWA | lab reception, technician, verifier | all laboratory operations |
| `apps/admin` | Next.js installable PWA | five platform-admin roles | governance only |

There is no `doctor-web`, `doctor-companion`, or `donate-web` in the MVP. Doctor mobile convenience is served by the installable clinic PWA and responsive route set. Donations are post-MVP under ADR-016, so neither patient nor admin exposes donation routes in the graduation build. This resolves the former conflict with Constitution Article XI and removes duplicated authentication/release surfaces.

### 1.3 Canonical repository tree

```text
/
├─ apps/
│  ├─ patient/
│  ├─ clinic/
│  ├─ pharmacy/
│  ├─ hospital/
│  ├─ lab/
│  └─ admin/
├─ services/
│  ├─ api/                 # TypeScript/Fastify REST application
│  ├─ worker/              # transactional-outbox consumer and scheduled work
│  └─ ai/                  # Python/FastAPI; isolated mandatory MVP track, staffed by 1–2 people
├─ packages/
│  ├─ auth/                # session clients, AAL checks, no domain authorization
│  ├─ contracts/           # OpenAPI source schemas, generated DTOs, problem types
│  ├─ core/                # pure domain entities, policies, state machines
│  ├─ api-client/          # generated client only; no handwritten endpoints
│  ├─ design-system/       # tokens and accessible primitives
│  ├─ i18n/                # ar-EG/en-EG catalogs, bidi helpers
│  ├─ observability/       # redaction, logging, tracing, metrics
│  ├─ test-kit/            # fixtures, contract/RLS/accessibility helpers
│  └─ config/              # shared lint/TS/test/build configuration
├─ infra/
│  ├─ db/migrations/
│  ├─ db/policies/
│  ├─ db/seeds/            # synthetic only
│  ├─ supabase/
│  ├─ containers/
│  ├─ terraform/
│  └─ runbooks/
├─ specs/                  # SpecKit feature directories
├─ docs/
├─ pnpm-workspace.yaml
├─ turbo.json
└─ pnpm-lock.yaml
```

Allowed dependency direction is `apps/services → api-client/design-system/auth/i18n → contracts/core`; `core` imports no UI, database, network, Supabase, vendor, or framework package. Applications never import another application. Packages do not expose deep internal paths. Dependency cycles fail CI.

## 2. Settled technical decisions

### 2.1 Runtime and toolchain

- Node.js 24 LTS, Corepack-managed pnpm, TypeScript strict mode, and Turborepo are the JavaScript baseline. Exact patch versions, OCI image digests, lockfiles, and SBOM become authoritative only when the Phase-0 scaffold closes OPEN-TECH-001; this document does not claim those currently absent files exist.
- Next.js powers dense staff PWAs; Expo powers the patient native/web app. Shared UI means shared tokens/primitives, not forced reuse of web DOM components inside native screens.
- `services/api` uses Fastify with JSON Schema generated from `packages/contracts`. REST/OpenAPI 3.1.1 is the sole external application protocol. gRPC is deliberately absent from the MVP, so there is no parallel inventory to drift.
- PostgreSQL 17 is the system of record. Supabase Auth, Storage, and Realtime are self-hosted components behind the same deployment boundary. User-facing domain tables are never directly exposed.
- `services/ai` uses Python/FastAPI because Arabic NLP and evaluation libraries are Python-first. It is called only from the Core API over an authenticated internal route and can be disabled without breaking core journeys.

### 2.2 Identity and authorization

- `auth.users.id` is the authentication subject; a typed `identity.identities` record holds encrypted national ID/passport/UNHCR attributes. Identity documents are proofing data, not login names.
- Authorization is contextual: actor + action + facility + resource + patient-care relationship + authentication assurance. App metadata is a cache hint only; database membership and grant state remain authoritative.
- Every user request faces API policy enforcement and forced PostgreSQL RLS. The database session sets signed/request-scoped actor and facility variables. Table owners and `BYPASSRLS` roles are not used by normal API transactions.
- Workforce and admin actions requiring sensitive data use AAL2. Recovery cannot downgrade MFA.

### 2.3 Sensitive data protection

- `pgsodium` is not used: Supabase documents it as pending deprecation and warns about transparent-column-encryption complexity. Designated fields use application-layer AES-256-GCM envelope encryption with a managed KMS/HSM key outside PostgreSQL; exact-match discovery uses a separate HMAC-SHA-256 blind index with a distinct key.
- Storage objects are private, use non-semantic random keys, short-lived signed downloads, malware/type/size scanning, and object-access audit.
- Audit is append-only, partitioned, hash-chained, and periodically exported to write-once object retention. Clinical and financial corrections append superseding versions.

### 2.4 Events, retries, and notifications

The unresolved `pg_net`/five-second design is retired. A domain mutation and its `platform.outbox_events` row commit in the same transaction. `services/worker` claims events with `FOR UPDATE SKIP LOCKED`, uses exponential backoff with jitter, and moves exhausted events to `dead_letter`. Each consumer writes `event_receipts` under a unique `(event_id, consumer)` constraint. Provider idempotency keys and a unique notification `(template_version, source_event, recipient, channel)` prevent duplicate delivery. Ordering is guaranteed only per aggregate key; no global ordering is claimed.

### 2.5 API conventions

- Base path `/v1`; UTF-8 JSON; RFC 3339 timestamps; EGP as integer piasters with `currency: "EGP"`; explicit UCUM-like units for observations/quantities.
- Errors use RFC 9457 `application/problem+json`; every error type is listed in the API catalog.
- `Idempotency-Key` is required on every mutation except one-time verification/consent token consumption where replay has its own terminal-result rule. Scope is non-null idempotency principal + method + route template + key. Authenticated requests use internal actor ID; pre-auth/provider requests use the server-derived HMAC/provider scope in the API catalog. The canonical request hash detects key reuse with a changed body.
- Cursor pagination is mandatory for mutable collections. `If-Match`/version is required for state that can be concurrently edited (beds, inventory packs, schedules, clinical content, role grants).
- No endpoint exists in production unless present in the API catalog and generated OpenAPI contract; no catalogued endpoint ships without authorization and contract tests.

### 2.6 Clinical safety

The alert model is three-tier rather than the contradictory two-tier `Warning/Complete Block` model:

| Tier | Normal action | Override evidence |
|---|---|---|
| Informational | proceed | acknowledgement not required unless content says otherwise |
| Warning | interrupt; prescriber may proceed | structured reason, justification, monitoring plan where applicable |
| Contraindicated | normal signing prohibited | replacement or governed break-glass |

Break-glass is a SHIFAA safety policy, not represented as an Egyptian statutory rule. It requires independent licensed clinical-pharmacist approval before routine dispense/administration. The emergency pathway additionally requires two physicians and immediate pharmacist review; its time window is a signed facility policy. Clinical rules and test sets require joint senior-physician/medical-director and clinical-pharmacist approval. This incorporates evidence that indiscriminate hard stops can cause treatment delay while preserving an exceptionally high bar for contraindications.

### 2.7 Egyptian pharmacy behavior

- EPTTS receiving and dispense verification are separate events. The receipt scan creates/locates the serialized pack; fulfilment identifies that exact pack again and records its movement.
- EPTTS Phase 1 is file/manual exchange; EDA’s published FAQ says no API is available. The EPTTS adapter supports published file formats and a future API without changing the domain.
- Pack-level GTIN/serial/batch/expiry is preserved through partial dispensing. A strip is not invented as independently serialized unless its scanned code proves it.
- Pharmacy Law 127/1955 Article 19 limits a pharmaceutical-institution director to one institution. Article 30 addresses pharmacy ownership/partnership limits. The database prevents conflicting active directorships recorded inside SHIFAA; activation additionally requires manual/authority evidence for institutions outside the platform. It does not claim global visibility or misstate the rule as “one pharmacist can own only one pharmacy.”
- Controlled medicines remain behind OPEN-LEGAL-003 and OPEN-CLIN-002; SHIFAA does not claim its digital prescription replaces statutory forms/registers.

### 2.8 Emergency privacy

Emergency Contacts are not clinical subscribers. They receive only the life-safety template in PRD FR-FAM-006 during an active SOS incident. Lab, interaction, admission, and medication events route to the patient, authorized guardian/delegate, and care team as applicable—never the Emergency Contact. Emergency share links are independent, short-lived, revocable, and audited.

### 2.9 Payments, disability entitlement, and donations

- Cash on arrival is the MVP’s enabled payment method. A disability card is an entitlement credential, not payment or insurance; a facility verifies the applicable benefit.
- Digital payment uses a CBE-licensed PSP hosted/tokenized flow. SHIFAA does not store cardholder secrets or custody funds.
- Donations/Four-Eyes donation workflow is excluded from the graduation MVP. No donation routes, migrations, jobs, UI, fundraising, collection, custody, receipts, or disbursements are implemented. The 2026-07-03 verbal legal review is retained only as historical input; because the capability is out of scope, no further legal sign-off is required for MVP completion. Post-graduation re-entry is licensed-partner-only under ADR-016.
- Four-eyes governance itself remains mandatory for the in-scope role-grant, facility-approval, and clinical-content decisions in `FR-ADMIN-004`.

### 2.10 Egypt deployment profile

Development and CI use synthetic data locally. Staging uses synthetic or irreversibly anonymized data. Production PHI uses containerized SHIFAA and self-hosted Supabase/PostgreSQL/object storage in an Egypt-resident, organization-controlled environment unless PDPC authorization explicitly approves another topology. Managed Supabase’s currently listed regions do not include Egypt, so it is not the production default.

The production logical topology is two or more stateless API/worker replicas behind a TLS load balancer, highly available PostgreSQL with encrypted primary/standby and point-in-time recovery, private object storage, centralized secrets/KMS, metrics/traces/logs, and an off-site backup only in an approved destination. The chosen Egyptian infrastructure provider, processors, and sub-processors are evidence under OPEN-LEGAL-001—not an architectural invitation to relocate data without approval.

## 3. Project Constitution — 15 immutable articles

The following articles are copied into [`.specify/memory/constitution.md`](./.specify/memory/constitution.md). A constitutional amendment requires a version bump, rationale, Product Owner approval, impact review of all templates/specs, and migration plan.

**I. Least Privilege and Default Deny.** Every action is authorized for the minimum actor, purpose, patient, facility, resource, field set, and time. Missing policy means deny.

**II. Identity Is Internal and Typed.** The authentication subject is an internal UUID. National ID, passport, UNHCR card, email, and phone are typed attributes, never the global primary key or exposed credential.

**III. Care Relationships Are Canonical.** Self, Guardianship, and Delegation are the only care-management relationship types. Emergency Contact is separate. Every grant is explicit, scoped, reviewable, and revocable.

**IV. Facilities Use Owner/Sub-user Memberships.** Every workforce action resolves a facility membership and is attributed to a named authenticated person. Shared accounts are forbidden.

**V. Medical Data Follows the Patient With Purpose Limits.** Longitudinal safety data is patient-centric; access still requires a care, consent, emergency, or legal basis. Cross-facility continuity never means universal staff visibility.

**VI. Clinical Safety Requires Dual Governance.** Clinical decision-support code, content, severity, exceptions, and test vectors require written senior-physician/medical-director and clinical-pharmacist approval. Unknown is displayed as unknown; it is never silently safe.

**VII. Regulated Activity Is Gated by Evidence.** Sensitive-data processing, controlled medicines, payments, donations, facility licensing, and official integrations cannot enter production on verbal assurance or an inferred rule.

**VIII. Separation of Duties Is Structural.** A person cannot approve their own facility, role grant, clinical-content publication, contraindicated override, or donation nomination. The database enforces the separation where representable.

**IX. Privileged Access Requires MFA and Purpose.** Workforce/admin sensitive operations require AAL2, reason capture where catalogued, short sessions, and attributable audit. Recovery cannot bypass MFA.

**X. Domain Logic Is Portable.** Core policies and state machines have no vendor/framework dependency. Every external system is behind a tested port/adapter.

**XI. One Authoritative App Per User Surface.** MVP has one patient app and one staff app per facility type. A second app for the same operational surface requires a constitutional amendment and must not duplicate auth, contracts, or domain logic.

**XII. Consent and Privacy Are Arabic-first and Granular.** Privacy information and consent are specific, affirmative, separable, versioned, recorded, and withdrawable. Collection is limited to an inventoried purpose and retention class.

**XIII. Accessibility and Localization Ship With the First Screen.** Arabic/RTL and English/LTR parity, WCAG 2.2 AA, keyboard and screen-reader support, scalable text, contrast, touch targets, and reduced motion are release criteria, not later enhancements.

**XIV. Safety-Critical UI Prioritizes Clarity.** Prescribing alerts, emergency actions, critical results, identity approval, and financial approval use stable layouts, plain language, redundant text/icon cues, and no decorative motion that delays action.

**XV. AI Advises; Licensed Humans Decide.** AI cannot diagnose, prescribe, dose, promise care, or execute a consequential clinical state change. Approved deterministic red flags run first; AI input is minimized; every output shows uncertainty/source/version and remains reviewable and reversible.

## 4. Domain and data architecture

The exact table/state/RLS contract is in [`docs/architecture/SHIFAA-Data-RLS.md`](./docs/architecture/SHIFAA-Data-RLS.md). The domains are:

1. `identity`: profiles, encrypted identities, verification cases, care relationships, emergency contacts, facilities, licenses, memberships, role grants, DPO designation, disability entitlement credentials.
2. `consent`: notices, purpose versions, consent records, withdrawals, data-subject requests/events, processing inventory.
3. `clinical`: appointments, queues, encounters, conditions, allergies, observations, prescriptions/items, detected issues, overrides, medication statements/doses/refills, vaccinations, referrals.
4. `pharmacy`: products, catalog versions, serialized packs, inventory movements, fulfilments, substitutions, EPTTS batches.
5. `hospital`: arrivals, triage assessments, wards, beds, bed holds/assignments, admissions, transfers, discharge versions.
6. `lab`: orders/items, specimens, result versions, critical policies, recipient acknowledgements/escalation.
7. `trust`: reviews/reports, complaints, messages.
8. `finance`: MVP payment intents only; donation cases, approvals, disbursements, and impact are reserved post-MVP contracts and have no graduation migrations.
9. `platform`: idempotency records, outbox, receipts, notifications, feature flags, AI runs/model releases/evaluations/signatures.
10. `audit`: access/action events, signature evidence, export batches.

Primary keys are UUID v4. Tables use `snake_case`; timestamps are `TIMESTAMPTZ`; states use constrained enums/checks plus transition functions; mutable resources carry integer `version`; clinical/financial/audit history is not hard deleted. A profile erasure decision pseudonymizes identifiers only after the approved retention/legal hold policy permits it.

## 5. API surface

[`docs/architecture/SHIFAA-API-Catalog.md`](./docs/architecture/SHIFAA-API-Catalog.md) is the complete operation-level inventory for the currently approved scope. It includes patient/staff worklists, professional-license review, privacy/DSR, relationships, facilities/workforce, discovery/SOS/stock, clinic/referrals, prescribing/medication, pharmacy receipt/return/dispense/EPTTS, hospital arrival/admission/transfer/discharge, lab lifecycle/catalog/critical loop, trust/admin/audit/content/notification governance, care payments, mandatory AI execution/release governance, and internal callbacks. Six donation operations are preserved only in a clearly non-MVP reserved appendix and are excluded from implementation and MVP coverage. Full payload schemas remain OPEN-TECH-002.

The catalog’s `Completeness rule` is normative: a requirement needing a remote operation must map to at least one endpoint; a local-only or background behavior must map to its owning endpoint/event and be marked accordingly. CI compares OpenAPI operation IDs and FR references with the trace matrix. gRPC is `N/A` for MVP and cannot be added as an undocumented second contract.

## 6. UI system

[`docs/design/SHIFAA-UI-Contract.md`](./docs/design/SHIFAA-UI-Contract.md) defines exact tokens, typography, spacing, breakpoints, component anatomy, application navigation, screen/state inventory, RTL mirroring, accessibility, and visual-regression viewports. Code uses only shared design tokens and approved primitives.

The earlier “icons/color with zero reading” acceptance rule is retired because color/icon alone conflicts with accessible communication. Every state uses text or an accessible label plus optional icon and semantic color. Patient surfaces may use restrained motion; clinical, emergency, approval, and finance-decision surfaces obey Constitution XIV.

Pixel-identical independent builds additionally require approved screen compositions and reference snapshots. Those assets do not currently exist, so OPEN-UX-001 explicitly blocks any claim that pixel-perfect convergence is already achieved. The documentation now makes the missing evidence visible instead of claiming it.

## 7. Security, privacy, and compliance controls

The legal source analysis is in [`docs/compliance/EGYPT-Compliance-Baseline.md`](./docs/compliance/EGYPT-Compliance-Baseline.md). Minimum implementation controls are:

- processing inventory and data-flow map before collection;
- Arabic-first notice and granular consent, with lawful basis recorded independently of consent;
- PDPC license/permit and registered DPO evidence before production sensitive data;
- approved cross-border destinations/processors or Egypt-resident deployment;
- data-subject request workflow and reasoned response evidence;
- 72-hour regulator and three-working-day subject breach timers;
- vendor DPAs, least-data payloads, secrets rotation, and kill switches;
- OWASP ASVS/API tests, RLS negative tests, encryption/backup/restore verification;
- medical/facility/pharmacy licensing validation and content/version governance;
- CBE-licensed payment routing with no SHIFAA custody/card storage.

HIPAA is not Egyptian law and is not claimed as compliance. Its minimum-necessary emergency disclosure guidance is used only as a conservative design benchmark alongside Egyptian confidentiality and PDPL purpose-minimization duties.

## 8. Reliability, performance, and observability

- Availability target 99.9% monthly; RPO 15 minutes; RTO 60 minutes. Quarterly restore and annual region/provider exit tests are release evidence.
- API read p95 ≤400 ms, mutation p95 ≤800 ms, SOS p95 ≤2 s excluding external vendors. Slow query, capacity, saturation, error, and outbox-lag SLOs page the on-call contact.
- Realtime is used only where user value requires push (bed/queue/chat/notification badges). Reconnect always performs authoritative HTTP reconciliation; UIs show last updated and stale state.
- Logs are structured and redacted. Free-text clinical content, identity values, tokens, signed links, document images, and full request bodies are prohibited in telemetry.
- Correlation IDs span client, API, database audit, worker, vendor adapter, and AI. Metrics use low-cardinality, pseudonymous dimensions.

## 9. Testing and definition of done

A feature is `DONE` only when:

1. its SpecKit artifacts pass the gates in Section 11;
2. every targeted FR/NFR has deterministic Given/When/Then acceptance criteria and test vectors;
3. API schema, generated client, migrations, RLS, and UI states match the approved contracts;
4. unit, integration, contract, RLS-negative, E2E, accessibility, visual, security, and failure/degraded-path tests pass as applicable;
5. Arabic and English flows pass at specified viewports/devices;
6. telemetry contains required operational evidence and no prohibited data;
7. migration has forward, rollback/roll-forward, backup, and data validation steps;
8. governed legal/clinical/security/design approvals are attached, not merely marked complete;
9. the trace matrix and open register are updated in the same change; and
10. no P0/P1 defect or production-blocking open item remains for the shipped behavior.

## 10. Delivery plan

| Phase | SpecKit features | Exit gate |
|---|---|---|
| 0 — Governance/contracts | constitution, compliance, design foundations, contracts, synthetic fixtures, CI | all baseline artifacts approved |
| 1 — Foundation | identity/auth, privacy/consent/DSR, Family Care, facilities/RBAC/RLS, audit/outbox/notifications | cross-tenant and relationship E2E pass |
| 2 — Discovery/SOS | facility discovery/capacity, SOS match, ER share, emergency-contact consent/privacy | emergency privacy and stale-capacity tests pass |
| 3 — Clinic/safety | scheduling, queue, encounters, referrals, allergies, prescribing, clinical-content governance | dual sign-off plus safety test set passes |
| 4 — Pharmacy | product import, receive, inventory, EPTTS file adapter, fulfilment/substitution/refill | exact-pack/partial-dispense audit passes |
| 5 — Hospital/lab | arrival/triage, beds, admission/transfer/discharge; lab order/specimen/result/critical loop | bed race and critical acknowledgement E2E pass |
| 6 — Longitudinal/trust | vaccination, chronic observations, dose/adherence, disability credential, reviews/complaints/chat | approved content and accessibility tests pass |
| 7 — AI Triage parallel track | mandatory `FR-AI-001..005`, ring-fenced to one-to-two people; access-controlled seeded-synthetic environment, structured allow-listed inputs, deterministic red flags, advisory outputs, Arabic evaluation, monitoring/rollback | OPEN-AI-001 technical and clinical acceptance passes |
| 8 — Release | integrated journeys, load/security/privacy/DR/UAT | release-signature set complete |

This order places SOS/Core foundations before dependent hospital behavior. Work may run in parallel only when contracts and dependencies are already approved; calendar pressure does not permit implementing an undefined dependency.

## 11. Mandatory SpecKit specification lifecycle

The repository uses GitHub Spec Kit’s `scope eligibility → specify → plan → tasks → implement` model with SHIFAA-specific gates. Complex epics are decomposed into independent vertical slices; every slice has its own artifacts and immutable requirement mapping. The checked-in workflow follows the [official custom-workflow schema](https://github.github.com/spec-kit/reference/workflows.html), uses its documented `>=0.7.2` minimum, and selects the officially supported [`codex` integration](https://github.github.com/spec-kit/reference/integrations.html) explicitly by default. On 2026-08-09, `specify workflow info` on the review host’s installed Spec Kit 0.11.8 parsed the file and reported all ten ordered steps. The exact release/tag and reproducible lock evidence remain blocked by `OPEN-TECH-001`.

### 11.1 Directory and metadata

Each feature lives at `specs/NNN-short-name/` and contains:

```text
spec.md                     # product behavior and acceptance contract
plan.md                     # architecture/data/API/UI/security plan
research.md                 # primary-source decisions and unresolved facts
data-model.md               # exact tables, fields, constraints, states, RLS
contracts/openapi.yaml      # only operations changed/added by this feature
quickstart.md               # deterministic local verification
tasks.md                    # dependency-ordered executable tasks
checklists/requirements.md  # completion evidence
```

Every `spec.md` begins with: feature ID, title, targeted FR/NFR IDs, **scope eligibility (`ACTIVE` plus PRD version/evidence)**, target app/service/package, owner, reviewers, risk class, status, dependencies, regulatory domains, clinical sign-off requirement, created/updated dates, and parent roadmap entry when applicable.

Before `/speckit.specify`, every target ID MUST be present in the current PRD and classified active for the graduation MVP. `DEFERRED_POST_MVP`, `RETIRED`, unknown, or reserved IDs abort the workflow before artifact generation. A deferred ID becomes eligible only after a Product Owner-approved dated re-entry ADR and synchronized PRD, Master, traceability, API/data/UI scope updates; a feature prompt cannot perform that re-entry implicitly.

Allowed status progression is `DRAFT → RESEARCHED → SPEC_REVIEW → SPEC_APPROVED → PLANNED → PLAN_APPROVED → TASKED → IMPLEMENTING → VERIFYING → RELEASE_APPROVED → RELEASED`; `BLOCKED` is an overlay carrying an open-item ID. Only named gate owners change approval states.

### 11.2 Required `spec.md` sections

1. Metadata and traceability table.
2. Problem, actors, scope, non-goals, dependencies.
3. Egyptian regulatory/legal validation checklist: legal basis, sensitive/child data, Arabic-first notice/consent, retention class, residency/transfers/processors, licensing/clinical content, notification disclosure, payments/EDA/MOSS/UHI relevance, open-item IDs.
4. User journeys and alternate/degraded paths.
5. Domain model: exact data ownership, states/transitions, invariants, and concurrency.
6. Data contract: tables/columns/types/nullability/defaults/keys/checks/indexes, migration/rollback, retention, encryption, and complete per-action RLS policies.
7. API contract: method/path/operation ID, actors, headers, path/query/body schemas, success schema, RFC 9457 errors, idempotency, concurrency, pagination, rate limit, audit, emitted events.
8. UI/UX matrix: application/route, viewport, Arabic/English, loading/empty/error/offline/stale/success/permission states, focus/keyboard/screen-reader behavior, safety override and confirmation behavior, visual baseline ID.
9. Notifications/events: source, recipient policy, minimum payload, template version, retry/deduplication/dead-letter/acknowledgement.
10. Security/privacy/threat cases and prohibited logging/analytics.
11. Deterministic Given/When/Then acceptance criteria and concrete test vectors, including negative authorization, race, replay, vendor failure, and clinical override cases.
12. Rollout, feature flag, observability/SLO, rollback, incident owner.
13. Evidence and approvals; unresolved items remain explicit and block the appropriate gate.

The checked-in [feature spec template](./.specify/templates/spec-template.md) is normative and contains these fields.

### 11.3 Gates

| Gate | Required reviewers | Evidence to pass |
|---|---|---|
| Research gate | Product + domain owner; Legal/DPO for regulated claims | primary sources linked; fact/inference/policy/open separated |
| Specification gate | Product Owner + QA + affected domain lead | FR/NFR coverage, journeys, edge/degraded states, acceptance vectors |
| Clinical gate | Medical Director + Clinical Pharmacist; Lab/Pediatric lead where applicable | signed content/version/test set and override/escalation policy |
| Legal/privacy gate | Legal counsel + registered DPO | checklist, lawful basis, retention/residency/processor evidence or blocking flag |
| Architecture/data gate | Architecture + Backend + Security | dependency direction, exact API/data/RLS/events, threat model, migration |
| Design/accessibility gate | Product + Design + Accessibility reviewer | approved screen baseline, Arabic/English, responsive/a11y states |
| Plan gate | Architecture + QA + owning engineer | constitution check, tasks/test/evidence plan, no unresolved design decisions hidden in tasks |
| Release gate | Product + QA + Security + relevant legal/clinical owner | CI evidence, traceability, rollback/DR, no applicable blockers |

### 11.4 Command sequence

1. The scope-eligibility gate verifies each requested ID is `ACTIVE` in the current PRD; any deferred/reserved/retired/unknown ID aborts before files are generated.
2. `/speckit.specify` produces `spec.md` from the eligible immutable PRD IDs.
3. `/speckit.clarify` is mandatory whenever a template field is `NEEDS CLARIFICATION`; it may not silently select legal, clinical, UX, or vendor choices.
4. Run specification and research gates; rejected specs return to `DRAFT` with named findings.
5. `/speckit.plan` produces `plan.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, and `quickstart.md`.
6. Run Constitution, legal/privacy, clinical, architecture/data, and design gates as applicable. An unmet production-only gate remains an explicit `BLOCKED` overlay and its capability stays feature-flagged off; it does not prevent approved synthetic-data engineering unless the blocker applies to the plan, safety fixtures, or implementation itself.
7. `/speckit.tasks` produces tasks ordered by dependency and user story. Each task cites active FR/NFR IDs and a file path; test/evidence tasks are mandatory.
8. `/speckit.analyze` must report zero CRITICAL inconsistencies before implementation.
9. `/speckit.implement` is executed in bounded task ranges. Completed checkboxes require the named verification output.
10. Verification updates the trace matrix and attaches evidence. Release gate moves the feature to `RELEASED`.

No prompt, issue, or code comment can override an open legal/clinical gate. A scope change returns the feature to the earliest affected gate.

## 12. Governance and sign-off

Product Owner approves scope and UI baseline. Architecture Lead approves system/contracts. Security Lead approves threat/control evidence. QA Lead approves deterministic coverage. Registered DPO and legal counsel approve privacy/regulatory evidence. Medical Director and Clinical Pharmacist jointly approve clinical safety; Lab Director/Pediatric reviewer approve their content. Facility representatives approve workflow UAT. Names are assigned through OPEN-TEAM-001.

Signatures are recorded as immutable approval rows with artifact digest, version, role, signer identity, decision, timestamp, and comment. “Someone reviewed it” is not release evidence.

## 13. ADR register

Historical scope notes referred to isolated AI as “ADR-009.” In this canonical 2.x register, ADR-009 is already the clinical-alert/break-glass decision and is not renumbered; the isolated AI architecture and closed MVP-scope decision are ADR-014. Donation deferral is ADR-016.

| ADR | Decision | Reason / rejected alternative |
|---|---|---|
| ADR-001 | Modular monolith plus isolated AI service | preserves transactions and operational simplicity; microservices rejected for team/consistency cost |
| ADR-002 | Internal UUID auth subject; typed encrypted identity | prevents phone/document lifecycle from changing record identity; National-ID-as-login rejected |
| ADR-003 | One patient app and one app per facility type | eliminates duplicate auth/contracts/release surfaces; doctor companion and donate app removed from MVP |
| ADR-004 | REST/OpenAPI 3.1.1 only | one inspectable client contract; gRPC rejected for MVP duplication and browser/mobile needs |
| ADR-005 | Core API mediates domain data; RLS remains independent | avoids direct-client policy sprawl while retaining database defense-in-depth |
| ADR-006 | Transactional outbox + worker | atomicity, retries, DLQ, deduplication; `pg_net` five-second webhook design retired |
| ADR-007 | Application envelope encryption + HMAC blind index | `pgsodium` pending deprecation; deterministic encryption/frequency leakage rejected |
| ADR-008 | Egypt-resident production default | managed Supabase has no Egypt region and PDPL cross-border transfer needs PDPC basis |
| ADR-009 | Three-tier clinical alerts with governed break-glass | reconciles unsafe silent override and harmful indiscriminate hard stops |
| ADR-010 | EPTTS file/manual adapter; receiving and dispense separate | matches published Phase-1 interface and physical inventory events; fake live API rejected |
| ADR-011 | Disability card as entitlement credential | MOSS describes proof/benefits, not a financial instrument; “third payment option” retired |
| ADR-012 | Hosted/tokenized CBE-licensed PSP only | minimizes card scope and prohibits SHIFAA fund custody |
| ADR-013 | Arabic-first bilingual WCAG 2.2 AA | PDPC language guidance and accessible healthcare operation; deferred accessibility rejected |
| ADR-014 | AI Triage is mandatory graduation-MVP scope in an isolated one-to-two-person service track | retains the project’s differentiating triage capability without putting core delivery on the AI path; an access-controlled seeded-synthetic environment, structured inputs that reject identifiers/free text, deterministic red flags first, advisory/no-diagnosis output, human confirmation, no input training, and kill switch make the graduation track executable without additional production legal review |
| ADR-015 | UUID v4 primary keys | native, non-semantic, adequate scale; ordered identifiers offer no decisive MVP benefit |
| ADR-016 | Donations/Four-Eyes donation workflow is post-MVP and licensed-partner-only on re-entry | the separate fundraising/custody/AML/KYC/receipt/disbursement product does not advance the core care touchpoints; generic four-eyes governance remains in MVP, while any future donation capability requires an executed licensed-partner and CBE-licensed-PSP operating model in which SHIFAA never holds funds |

## 14. Decision register and open items

The closed decisions and remaining-open table mirror PRD Section 10 verbatim. Closed IDs remain immutable audit history and are not reused. For remaining items, status is not evidence; the closure artifact is required.

### 14.1 Closed scope decisions

| Former open ID | Closed | Binding decision | Why this is the final MVP call | Post-graduation re-entry condition |
|---|---|---|---|---|
| OPEN-PRODUCT-002 | 2026-08-09 by Product Owner directive | **AI Triage stays in mandatory graduation-MVP scope** as the isolated one-to-two-person ADR-014 track. `FR-AI-001..005` count toward MVP completion. | It is a high-value differentiator that can be built independently without weakening the core path. The graduation build is non-public and access-controlled, uses seeded synthetic personas, accepts allow-listed structured inputs that reject identifiers/free text, runs deterministic red flags first, is advisory/no-diagnosis, cannot mutate clinical state without a licensed-human confirmation, does not train on inputs, and has a kill switch; therefore no additional production legal opinion is required for the graduation demonstration. | Real-PHI or public-production enablement requires the applicable legal/privacy basis, processor terms, clinical approval, production evaluation, monitoring, and rollback evidence; this does not reopen the MVP scope decision. |
| OPEN-LEGAL-004 | 2026-08-09 by Product Owner directive | **Donations/Four-Eyes donation workflow moves to post-MVP and is not implemented for graduation.** `FR-FIN-001..003` are reserved, excluded IDs. Generic four-eyes governance under `FR-ADMIN-004` remains in MVP. | Donation collection creates a separate fundraising, custody, AML/KYC, receipt, reconciliation, and disbursement product that does not advance the four core care touchpoints. The 2026-07-03 verbal legal review is recorded as historical input but is unnecessary for—and does not authorize—an out-of-scope production flow. | Re-entry requires an executed operating agreement with a licensed Egyptian fundraising/care-finance partner and CBE-licensed PSP. The partner must own collection, KYC/AML, custody, receipts, and disbursement; SHIFAA may provide workflow/integration only, must not hold funds, and must approve a new dated scope ADR before implementation. |

### 14.2 Remaining open items

| ID | Decision/evidence required | Owner | Next step / closure evidence | Blocks | Earliest blocked lifecycle stage |
|---|---|---|---|---|---|
| OPEN-LEGAL-001 | PDPC controller/processor/sensitive-data licenses or permits; DPO appointment/category; cross-border basis and approved destinations/processors | Legal counsel + registered DPO | Submit processing inventory and architecture to PDPC/counsel; archive written approvals and processor terms | Any production PHI | RELEASE_APPROVED |
| OPEN-LEGAL-002 | Egyptian retention periods for each medical, prescription, lab, identity, consent, audit, and finance class | Legal counsel + DPO + Medical Director | Produce signed retention schedule citing controlling instruments | Production retention/deletion automation | RELEASE_APPROVED |
| OPEN-LEGAL-003 | Controlled-drug/e-prescription workflow and whether any digital record substitutes for original statutory books/forms | EDA/MoHP liaison + Legal + Chief Pharmacist | Obtain written authority interpretation and current schedules/process rules | Controlled-drug production flow | RELEASE_APPROVED for controlled paths |
| OPEN-LEGAL-005 | Official disability-card verification interface and exact public/private facility benefits | MOSS liaison + Legal | Obtain interface/verification instructions and benefit applicability in writing | Automated entitlement decision | RELEASE_APPROVED for automated entitlement |
| OPEN-LEGAL-006 | Guardianship age/capacity transition trigger, evidence, approver, and treatment of adults lacking capacity | Legal counsel + DPO + Product Owner | Obtain written Egyptian-law analysis; approve a state/event matrix and test vectors | Automatic guardianship/dependent transition | SPEC_APPROVED for FR-FAM-003 |
| OPEN-LEGAL-007 | Official/certified Arabic Gazette copies and counsel-verified article mapping for Law 151/2020 and Executive Regulations Decision 816/2025 | Legal counsel + registered DPO | Archive controlling Arabic texts; map each compliance proposition to exact article; sign legal-validation memo | Treating article-level PDPL interpretations as production evidence | RELEASE_APPROVED for production PHI |
| OPEN-PRIV-001 | Minimum-cell-size threshold and dimensions for admin aggregate disclosure | Registered DPO + Security Lead + Data Lead | Perform documented re-identification-risk assessment; approve threshold/config/test set | FR-ADMIN-003 dashboard aggregates | SPEC_APPROVED for FR-ADMIN-003 |
| OPEN-VENDOR-001 | Valify commercial terms, DPA, SLA, Egypt processing location, production credentials, and fallback | Procurement + Security + DPO | Complete vendor assessment and signed contract | Automated National ID verification | RELEASE_APPROVED for automated proofing |
| OPEN-VENDOR-002 | SMS/OTP provider selection, sender registration, Arabic delivery, DPA, SLA, receipts, and failover | Procurement + Platform Lead + DPO | Score candidates and sign primary/secondary contracts | Production SMS/OTP | RELEASE_APPROVED for SMS/OTP |
| OPEN-VENDOR-003 | CBE-licensed PSP and hosted/tokenized integration terms | Finance Owner + Security + Legal | Verify CBE status and sign PSP agreement | Digital payments | RELEASE_APPROVED for digital payments |
| OPEN-CLIN-001 | Joint approval of interaction/allergy rules and break-glass policy | Medical Director + Chief Pharmacist | Sign versioned clinical-content bundle and deterministic test set | Prescription safety release | RELEASE_APPROVED for prescribing |
| OPEN-CLIN-002 | Current controlled/NTI product lists and facility emergency exception window | Medical Director + Chief Pharmacist + Legal | Publish signed, effective-dated lists/policy | Controlled/NTI paths | RELEASE_APPROVED for controlled/NTI paths |
| OPEN-CLIN-003 | Lab critical thresholds, vaccination schedule/catch-up rules, and escalation SLAs | Medical Director + Lab Director + Pediatric Reviewer | Publish signed per-domain content versions | Related modules | RELEASE_APPROVED for affected modules |
| OPEN-PHARM-001 | Inventory-freshness threshold by product/facility and exact stale-to-unknown transition | Chief Pharmacist + Product Owner + SRE Lead | Analyze update cadence and harm cases; approve configuration, display rules, and boundary test vectors | Patient pharmacy-stock projection | SPEC_APPROVED for FR-PHARM-006 |
| OPEN-AI-001 | Graduation-MVP model/provider, access-controlled seeded-synthetic environment, structured allow-listed input schema, Arabic evaluation set, red-flag/harm thresholds, monitoring, and rollback | AI Lead + Medical Director + Security Lead | Check in the model card and locked evaluation set; pass no-public-access, direct-identifier/free-text rejection, red-flag-first, harmful-output, human-confirmation, timeout, and kill-switch tests; record technical/clinical acceptance | Graduation AI acceptance, not AI scope | VERIFYING for Phase 7 |
| OPEN-UX-001 | Approved Figma/source-of-truth screen compositions and visual-regression baselines for every P0 state | Product Owner + Design Lead | Approve linked designs at required viewports; export immutable baseline IDs | Claim of pixel-identical builds | PLAN_APPROVED for affected UI |
| OPEN-UX-002 | Visual-regression tolerance, renderer/browser/font matrix, and diff-review rule | Product Owner + Design Lead + QA Lead | Approve deterministic render environment, numeric thresholds, masks, and review evidence | Automated visual acceptance | VERIFYING for affected UI |
| OPEN-PRODUCT-001 | Persona and workflow validation with 5–8 target users | Product Owner + UX Research Owner | Complete interviews; archive script, anonymized evidence, and accepted changes | UAT baseline, not Foundation engineering | RELEASE_APPROVED/UAT |
| OPEN-SEC-001 | Refresh-token idle lifetime, absolute lifetime, family revocation/reuse response, and reauthentication interval | Security Lead + Architecture Lead | Threat-model patient/workforce/admin sessions; approve exact values and deterministic expiry/reuse tests | Production session policy | SPEC_APPROVED for auth/session implementation |
| OPEN-TEAM-001 | Named owners, reviewers, supervisor/TA, and on-call/security contacts | Product Owner | Fill RACI and obtain acknowledgement | Attributable approvals and release governance | SPEC_APPROVED |
| OPEN-TECH-001 | Exact dependency versions, runtime/toolchain files, OCI base-image digests, lockfiles, and SBOM baseline | Architecture Lead + Platform Lead | Create the Phase-0 repository scaffold; pin and sign/checksum all versions/digests; archive a clean reproducible-build log | Claim of byte/reproducible builds | IMPLEMENTING |
| OPEN-TECH-002 | Generated full OpenAPI payload schemas, physical PostgreSQL DDL/RLS migrations, and generated API clients for the active graduation operation inventory | API Lead + Data Lead + QA Lead | Complete feature specs in dependency order, merge generated contracts/migrations/clients, and pass active-catalog/OpenAPI/DDL/trace consistency CI; reserved post-MVP operations must be absent | Code-generation-identical implementation beyond each approved feature contract | IMPLEMENTING for the affected feature |
| OPEN-TECH-003 | Reference Android device/OS/build, web browser versions, network profile harness, dataset size, and performance/accessibility test environment | QA Lead + Platform Lead + Product Owner | Approve reproducible test profiles; check in configs; archive baseline run | Deterministic NFR-PERF-001/002 and device accessibility evidence | VERIFYING |

## 15. Change history

| Date | Version | Change |
|---|---|---|
| 2026-08-09 | 2.1.0 | Closed the two scope decisions: AI Triage is mandatory graduation-MVP scope in an isolated one-to-two-person synthetic-data track; Donations/Four-Eyes donation flow is deferred to a licensed-partner-only post-graduation re-entry. Formally approved by Product Owner Yousef Osama on 9-Aug-2026. |
| 2026-08-09 | 2.0.0 | Replaced contradictory planning text with one canonical app/package tree, complete operation ownership/worklists, corrected Egypt compliance baseline, transactional event model, SpecKit lifecycle, dependency-ordered phases, dual clinical governance, and synchronized stage-owned open items. |
