# Feature 011 first physical screen-reader case

Date: 2026-10-10 (Africa/Cairo). Accountable initial reviewer: Yousef Osama. Status: **WAITING FOR DEVICE ACCESS AND REVIEWER OBSERVATIONS**.

This case exercises the unchanged patient web UI using an isolated synthetic HTTP transport fixture. It is not real Auth, a DB mutation, clinical evidence, an installed native Expo build or formal reference-environment acceptance. The Android delivery mode is Chrome web with actual TalkBack, not browser device emulation.

## Available session

- Arabic: <https://192.168.1.50:18412/__f011_harness?locale=ar-EG>
- English: <https://192.168.1.50:18412/__f011_harness?locale=en-EG>
- Bind: 192.168.1.50:18412; only peer addresses 192.168.1.50 and 192.168.1.20 are allowed. No firewall or trust-store change.
- Temporary TLS certificate: SHIFAA F011 synthetic local test; SHA-256 `01b3ec7a12363f196265e130f1d1baf3323c70a3c279071524ae293a91803e66`. A certificate exception, if used after checking its identity, is limited to this synthetic site. Do not disable browser certificate checks globally.
- Server start: 2026-10-10T09:08:32 UTC; bounded two-hour session. Certificate valid until 2026-10-10T15:07:36 UTC. Confirm listener health before resuming after that session window.

The landing page sets only the existing locale preference and a synthetic CSRF cookie. Use its patient-records link. No real login is performed. Fixture bearer material is synthetic and held by the unchanged UI's memory store. Fixture session responses are not native identity acceptance.

The initial case is read/review/cancel. All domain submissions are denied by this fixture, so do not submit a report during this case. Existing default-off product configuration and SQL remain untouched.

## Run on each device, Arabic then English

1. Record display scaling/font size, screen-reader speech language, orientation and viewport/device settings at the time of execution. Software versions are in the [device record](../physical-device-versions-2026-10-10.md).
2. Enable NVDA on Windows or TalkBack on the Reno 13. Open the language's landing URL and use its records link. Confirm the allergy heading, current-record state and synthetic-only boundary notice.
3. Read the entry. Record exact spoken output for self-reported status and unknown coding/reaction/severity/onset; check that the source and history are reachable and mixed-direction synthetic identifiers remain understandable. Do not infer allergy-free, confirmed or safe.
4. On Windows use Tab/Shift+Tab and Enter; on Android use actual TalkBack swipe traversal and activation. Reach substance, source and report-review controls in reading order. Note missing labels, duplicated speech, traps or unreachable controls. Patient must have no clinician verification controls.
5. Use only the synthetic values `Synthetic neutral / اختبار` for substance and `Synthetic source` for source. Open report review. Check the review announcement and focus/reading position. Choose **العودة دون إرسال / Return without sending**. Record whether focus returns to **مراجعة بلاغ الحساسية / Review allergy report**. Do not activate submit.
6. Repeat in the other language, retaining Arabic and English observations separately. Record actual results, not a prefilled PASS.

Reply with device, language, actual utterances, observed focus order/return and any defect. A privacy-safe recording or speech transcript may supplement those observations. Preserve failed evidence and capture retests separately.

## Preparation proof and pending results

The [setup manifest](2026-10-10T09-08-32-764Z/setup.json) binds the session to 141 unchanged inputs, exact exported build and fixture sources. [Browser preflight](2026-10-10T09-08-32-764Z/browser-preflight.json) passed Arabic and English read/review/cancel with focus return and no application page errors. Its 412x915 viewport is emulation, not Reno acceptance. A separate transport test exercised rejected foreign hosts/origins, missing synthetic bearer/CSRF/purpose, person-ID substitution, excluded operations, static-path/key denial and negative fixture modes.

Actual physical-device connectivity, speech and interaction results remain NOT EXECUTED until the reviewer reports them. Remaining native states, other web surfaces, 200% text and applicable 400% native browser zoom follow the [full worksheet](../native-accessibility-worksheet.md).

K24 remains BLOCKED; T088-T092 stay unchecked; T092 NOT EXECUTED. OPEN-UX-002, OPEN-TECH-003 and all other retained gate effects are unchanged. No Issue closure, production readiness, clinical approval, styling acceptance, commit, push, PR or main change.

Quality review: fixture requests are confined to existing synthetic paths, source constants come from the existing browser fixture, no request bodies are logged/persisted, and domain submissions deny. Claims distinguish browser setup from native evidence and all linked evidence exists. No product code or normative input was changed.
