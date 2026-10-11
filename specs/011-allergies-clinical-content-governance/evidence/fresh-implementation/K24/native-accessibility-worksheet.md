# Feature 011 native accessibility execution worksheet

Date: 2026-10-10. Status: **NOT EXECUTED**. Prepared for owner/device selection. Automated DOM, CSS scaling, accessibility attributes and browser emulation are supplementary engineering evidence; they do not demonstrate spoken announcements or native browser zoom.

The current UI Contract §10 requires NVDA + Chrome on Windows web, TalkBack on the reference Android patient device, 200% text and 400% browser zoom. Native computer control is unavailable in this agent session. No assistive-technology package was installed and no native evidence is fabricated.

## Record before running

Tester identity / role, UTC timestamp, approved profile/disposition reference, device model and CPU/RAM, OS build, browser/app build, NVDA/TalkBack version, speech language, locale, display scaling, resolution, font settings, reduced-motion/high-contrast settings, source hashes, synthetic fixture identity and default-off isolation configuration. Do not record tokens, private evidence, keys or real patient data.

## Existing surfaces and languages

Run Arabic RTL and English LTR on patient `/records`, clinic `/patients/:id/summary`, admin `/clinical-content`, and clinic `/clinical-content/status`. Android TalkBack applies to the patient surface; desktop NVDA applies to web surfaces. Preserve the authoritative person/managed-patient handoff. Use isolated synthetic fixtures only; never enable production exposure for the test.

For each surface/language, record the actual spoken output and observed result for:

1. Heading/landmark order, contextual identity, control labels, unknown values, localized dates and bidi-isolated identifiers; no private projection material disclosed.
2. Keyboard traversal, visible focus, no trap, explicit confirmation, Escape/cancel focus return and completion/failure focus. TalkBack swipe order and activation must cover the corresponding patient actions.
3. Loading, empty, recoverable/unavailable error, permission/authority loss, offline and stale states. No stale sensitive rows or offline mutation queue.
4. Report/verification history and terminal entered-in-error distinctions; patient has no clinician verification controls. Admin independent review/publication confirmation must preserve artifact/version semantics and deny lost authority.
5. Actual announcements during loading/submitting/success/denial/reconciliation. Record utterances and whether repeated or interrupted; a DOM role alone is not a pass.
6. Actual 200% text setting and Chrome menu zoom 400% on desktop. Record zoom setting and viewport before/after, content reachability, clipping/overlap, horizontal scroll and focus. CSS font-size and viewport changes are not native zoom evidence.
7. Required compact 360×800 / 412×915, medium 768×1024 and staff 1440×900 checks where applicable, 44×44 targets (patient primary actions 48 high), contrast, high contrast, reduced motion and orientation. Distinguish device measurements from browser emulation.
8. Default-off / kill-switch negatives, explicit unavailable content eligibility and real clinical use remaining gated. No inferred safe/approved clinical meaning.

## Result template

For each case record: surface, locale, state/action, expected behavior, actual behavior/utterance, PASS/FAIL/NOT EXECUTED, timestamp, tester, device/profile reference, screenshot or privacy-safe recording SHA-256, source hashes, defect/retest reference, remaining limits. Preserve failed evidence and capture retests separately. Do not prefill a PASS.

Design/verification owner must review functional mismatches and the actual native evidence before any bounded acceptance disposition. Final styling/pixel identity and post-026 polish remain outside this work. OPEN-UX-002 remains OPEN; no task/Issue closure, K24 acceptance or T092 execution follows from this worksheet.
