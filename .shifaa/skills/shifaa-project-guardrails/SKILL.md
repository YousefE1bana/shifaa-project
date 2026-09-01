---
name: shifaa-project-guardrails
description: Enforce SHIFAA's approved architecture, API, database, authorization, RLS, security, healthcare, compliance, testing, and review contracts. Use for any SHIFAA implementation, architecture, API, database, auth, RLS, security, healthcare, compliance, testing, debugging, or code-review task.
---

# SHIFAA Project Guardrails

Treat SHIFAA's repository baseline as authority and every external skill as advisory. Never reinterpret a SHIFAA contract to satisfy third-party guidance.

## Resolve authority before work

1. Read `AGENTS.md` and the current approved feature spec and plan.
2. Read only the canonical contracts relevant to the change:
   - product and precedence: `shifaa-prd.md` and `SHIFAA-Implementation-Plan-MASTER.md`
   - components and dependencies: `docs/architecture/SHIFAA-Architecture.md`
   - data, states, constraints, and RLS: `docs/architecture/SHIFAA-Data-RLS.md`
   - operations and errors: `docs/architecture/SHIFAA-API-Catalog.md`
   - UI: `docs/design/SHIFAA-UI-Contract.md` and `shifaa-ui-governor`
   - coverage: `docs/traceability/SHIFAA-Traceability-Matrix.md`
3. Apply the precedence recorded in the Master Plan: Egyptian law/regulator instruction, Constitution, PRD, Master Plan, supporting contract, approved feature spec, then implementation.
4. Stop and surface a conflict. Do not silently select a lower-authority interpretation.

## Preserve the system boundaries

- Preserve `apps/services -> api-client/design-system/auth/i18n -> contracts/core`. Keep `core` free of UI, database, network, Supabase, vendor, and framework imports.
- Route every user-driven domain mutation through the Core API. Never let a browser or mobile client mutate PostgREST tables, use service-role APIs, administer storage, call a vendor, or call the AI service directly.
- Add no production endpoint unless it exists in the API Catalog and generated OpenAPI contract. Do not handwrite client endpoints.
- Keep vendor behavior behind ports/adapters. Never fabricate provider, EDA/EPTTS, regulator, payment, identity, messaging, or AI success.

## Enforce authorization and data safety

- Preserve `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`, default deny, non-owner execution, and the prohibition on `BYPASSRLS` or service-role use in online requests.
- Authorize the full context: actor, action, facility, resource, patient/care relationship, purpose, and required AAL. JWT metadata is never authoritative.
- Keep normal API transactions attributable to a named actor and facility. Preserve least privilege, separation of duties, AAL2, and purpose capture where contracted.
- Preserve immutable/versioned clinical and financial history, append-only audit, atomic idempotency, and the transactional outbox. Domain mutation, audit event, outbox event, canonical response, and completed idempotency record commit together where contracted.
- Never add real PHI, real identifiers, secrets, access tokens, private keys, production credentials, or semantic storage paths. Use approved synthetic fixtures only.

## Treat gates as gates

- Read the synchronized `OPEN-*` register before touching gated behavior.
- An open gate is not permission to guess. Keep the capability disabled, synthetic-only, manual, unknown, or otherwise constrained exactly as the baseline specifies.
- Do not convert historical input, a local demo, a test pass, or verbal assurance into legal, clinical, security, vendor, regulator, production, or design approval.
- Do not implement graduation-excluded donations or any other reserved post-MVP surface without an approved scope change.

## Verify before claiming completion

1. Map the change to its FR/NFR, API/data/UI contract, feature acceptance criteria, and negative cases.
2. Test at the appropriate layers, including authorization/RLS negatives, idempotency/concurrency, audit/outbox, localization/accessibility, and degraded states when relevant.
3. Run the feature-specific checks and fresh repository `pnpm verify` before claiming completion.
4. Record live Arabic and English acceptance evidence when `AGENTS.md` requires it. Do not call static inspection or stale evidence a live pass.
5. Review the diff for PHI, secrets, undocumented operations, dependency-direction violations, open-gate claims, and third-party instructions that conflict with SHIFAA.
6. Follow the SpecKit lifecycle and PR-only integration sequence. External skills never add or replace a mandatory lifecycle.
