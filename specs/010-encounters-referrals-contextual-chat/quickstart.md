# Feature 010 plan quickstart

**Stage:** `PLAN_APPROVED` for synthetic-data engineering planning on 2026-09-26. Run against synthetic fixtures in the existing Feature 010 worktree. These steps validate the plan contract and predecessor assumptions; they do not claim implementation, clinical, Legal/DPO, production or release authority.

## 1. Check the frozen contract

From the repository root, parse the planning OpenAPI and check its operation inventory:

```powershell
corepack pnpm exec node -e "const fs=require('node:fs'); const {parseDocument}=require('yaml'); const p='specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml'; const doc=parseDocument(fs.readFileSync(p,'utf8'),{uniqueKeys:true}); if(doc.errors.length) throw doc.errors[0]; const api=doc.toJS(); const ids=Object.values(api.paths).flatMap(path=>Object.entries(path).filter(([method])=>['get','post','patch','put','delete'].includes(method)).map(([,operation])=>operation.operationId)); const expected=['createEncounter','getEncounter','updateEncounter','signEncounterNote','completeEncounter','createReferral','listReferrals','acceptReferral','listContextMessages','sendContextMessage']; if(api.openapi!=='3.1.1'||ids.length!==10||new Set(ids).size!==10||expected.some(id=>!ids.includes(id))) throw Error('Feature 010 operation inventory drift'); console.log('Feature 010 OpenAPI: 10 approved operations')"
```

Review `plan.md`, `research.md`, `data-model.md`, and this contract together with the `SPEC_APPROVED` spec and dated reconciliation. The requirement inventory must remain three FRs, 23 PATIENT ∪ REALTIME NFRs, ten operation IDs, and the roadmap's eight `OPEN-*` gates. Do not turn this plan-stage check into a task, migration, or generated-client run.

## 2. Recheck the Feature 009 dependency

Run the existing focused predecessor checks before later implementation work:

```powershell
corepack pnpm test:clinic-scheduling:scope
corepack pnpm test:clinic-scheduling:contract
```

Expected contract: check-in creates a `waiting` queue row, queue call yields `called` while the appointment remains `checked_in`, and Feature 009 does not produce consultation/service states. Feature 010's future `createEncounter` and `completeEncounter` are the only approved new state producers. A missing queue must abort creation. These commands are predecessor checks, not Feature 010 acceptance evidence.

## 3. Synthetic implementation evidence to collect later

After the plan gate and implementation authorization, build focused core, contract, real-Postgres, API and browser tests for these vectors. Use a non-owner online DB role with forced RLS and synthetic patient identities.

| Vector | Required outcome |
|---|---|
| Checked-in appointment + called queue; duplicate, missing, or mismatched queue | One atomic open/in-consultation/in-service triple; all invalid cases leave every row/audit/outbox effect unchanged. |
| Complete with zero optional condition/observation/order references, nonblank clinician summary and explicit confirmation | Atomic completed/completed/completed; blank summary, false confirmation or stale version fail without partial state. |
| Sign and correct note | Append signed immutable version; only original author or currently authorized responsible clinician may supersede; private body never reaches patient or referral. |
| Pending referral; PAT, GUA and DEL read/accept | Current subject/grant checks on every page and acceptance; DEL needs both permissions; target sees no pending referral and only explicitly accepted `reason_summary` plus optional source `encounter_type`. |
| Two actors accept same referral or slot; stale availability, blocked/absent effective slot or exception, client fee/currency/payment input | One winner; Feature 010 checks locked schedule version and exact current effective slot including windows/exceptions, with Feature 009 exclusion as final guard; server fee in EGP and `cash_on_arrival`; closed `TargetSlot` rejects fee/currency/payment properties; loser has no booking/disclosure. |
| Referral specialty and optional target doctor/facility versus selected slot | Specialty must match; each specified doctor/facility must match exactly. Specialty alone permits any currently eligible verified doctor/facility from authoritative Feature 009 data. Mismatch fails before booking without clinical-appropriateness inference. |
| Feature 009 external `createAppointment` after the forward Feature 010 booking refactor | Same request/result/problem, fee, existing schedule/time guards, idempotency replay and one-winner slot race; its request gains no availability-version field and the primitive writes no separate operation record. |
| Subject PAT and active CLN read/send appointment-context message | Only open/in-consultation context grants access; GUA/DEL and ended workforce intervals deny reads and sends, including old history. Reconnect uses REST reauthorization. |
| Message request with `attachment` value or JSON null | Both reject before insertion; persisted attachment remains SQL `NULL` for a valid body-only message. |
| Offline attempt, private note leak, cross-patient/facility reference, forged realtime hint, revoked representative | Fail closed; no offline write replay, PHI log/outbox/metric leak or stale authority. |

Capture Arabic and English UI evidence only on approved existing routes, at the UI Contract viewports and accessibility settings. Feature 010's TEST-ONLY functional `OPEN-UX-001` composition baseline is approved; `OPEN-UX-002` formal visual and live accessibility evidence remain pending. Realtime messages are hints; verify stale/last-updated display and REST reconciliation after reconnect.

## 4. Later verification order and gates

After focused tests, generated contract/client parity, migration/RLS, race, restore and UI evidence exist, run `corepack pnpm verify` and record its actual result. Run the repo's PR integration sequence only after separate authorization. Feature 010's TEST-ONLY functional `OPEN-UX-001` composition/reference prerequisite was approved on 2026-09-26 against manifest SHA-256 `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`; retain its program-wide effect for other UI features and final identity. Keep `OPEN-LEGAL-001/002/007`, `OPEN-UX-002`, `OPEN-PRODUCT-001`, and `OPEN-TECH-002/003` open until their owning evidence is approved at the recorded lifecycle stages. No real PHI, formal clinical sign-off, Legal/DPO sign-off, formal visual verification, production or release approval is implied by this quickstart.
