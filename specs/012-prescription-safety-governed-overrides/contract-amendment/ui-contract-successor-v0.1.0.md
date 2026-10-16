# F012 UI Contract successor

Preserved canonical predecessor: [docs/design/SHIFAA-UI-Contract.md](../../../docs/design/SHIFAA-UI-Contract.md). Its original bytes remain unchanged because historical F011 verification binds that path. This feature-owned versioned successor applies only to the proposed F012 amendment after exact approval/integration; it neither edits nor reopens F011.


## F012 reviewer contract successor — proposed 2026-10-16

> F012-REVIEWER-CONTRACT/0.1.0 — PROPOSED, EXACT CONTENT UNAPPROVED, NOT EFFECTIVE.
> Engineering boundary approved separately; effective F012 inventory remains ten.

This additive candidate preserves all preceding source bytes and historical acceptance. Its exact contents require Product Owner approval, separately authorized coordinated PR integration and remote verification before serving as a contract successor. It implements no API, grant or clinical behavior. F012 remains **NOT READY — PRE_SPECIFY_BLOCKED**; Specify requires separate authorization. Existing OPEN IDs, owners, evidence, restrictions and earliest blocked stages are unchanged.

The [reviewer/disclosure contract](reviewer-contract-v0.1.0.md#disclosure-and-application-contract) assigns a logical review entry in the clinic application for the independent synthetic second physician and a distinct **F012 Safety Review** entry in the existing pharmacy application for the synthetic pharmacist. Clinic keeps prescribing. F014 `/worklist`, fulfilments, dispensing and substitutions remain exclusively F014; Safety Review is not an expansion of that worklist. No new application, hospital/F015 dependency or admin role. URL spelling, exact compositions/copy and immutable viewports/baselines require pre-Plan UI review under OPEN-UX-001; no executable route is created here.

Discovery and assigned-case display both use proposed R1 `getOverrideReviewCases`, exactly `discover`/`detail`. Self-claim/release-own/takeover-invalid use proposed R2 `transitionOverrideReviewAssignment`; approve/reject uses existing `decideOverride` by lane. There is no assigning administrator, reviewer directory, new inbox API, general patient search or extra activation command. A UI button cannot create an unlisted action. Display only minimum preclaim metadata and the enumerated necessary assigned-case fields; never patient/medicine detail before assignment or unrelated clinical history.

Every reviewer view shows synthetic designation/environment, originating facility/lane, current assignment/evidence state and permitted actions. Required ar-EG RTL/en-EG LTR parity: loading, empty, permission/AAL/purpose denied, authority unavailable/revoked, pending claim/review, held by another, released, rejected, simulated approval, stale/version conflict, expired/cancelled, blocked unreviewed obligation, offline mutation blocked, uncertain response/recovery and delivery failure with durable pending review. Live Arabic/English, native accessibility, performance and visual acceptance are unperformed; prior governance PR exceptions do not apply to feature UI.

Use the existing safety anatomy/tokens, keyboard/focus/live regions, responsive reflow, no color-only status, zero decorative safety motion and no offline clinical mutation queue. Success includes a durable receipt/status/next step rather than toast alone. Request expiry or roster loss removes actions immediately; timeout is not approval or rejection. The virtual 60-second clock is test-harness-controlled and explicitly non-clinical. Actual dispensing/administration is disabled.

Source-backed medicine names belong only to the separately approved nonclinical evidence-matching lane. Display source statement, match/non-match/insufficient evidence and unapproved overall assessment separately; overall clinical assessment remains `not_fully_checked`. A match cannot create a reviewable clinical issue or authorize signing/override. Historical artificial mechanism identifiers remain labelled synthetic and cannot masquerade as genuine medicine names. P01–P30 remains AWAITING_PROFESSIONAL_INPUT; no clinical/UX acceptance follows from this contract.
