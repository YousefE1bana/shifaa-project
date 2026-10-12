# T088 supplementary local browser review

Date: 2026-10-10. Result: **LOCAL ENGINEERING PASS; K24 BLOCKED**. The user's [current disposition](../local-review-disposition.md) explicitly withholds formal acceptance and T092 execution.

## Executed proof

`node artifacts/feature-011/k24/capture-ui-gap-scenarios.mjs` completed with exit 0. Installed Chrome 154.0.8037.93 exercised the existing routes with synthetic HTTP boundary fixtures and generated clients. Patient: 8/8, clinic: 6/6, admin: 22/22; 36/36 total, no skipped/flaky/unexpected results. Each of the 18 previously unexercised scenario labels has an AR and EN capture. [Execution](execution.json), application reports, privacy-safe screenshots, fixture source and output-only config sources are retained with hashes in [the review manifest](review-manifest.json).

The patient/clinic fixture prefix was copied at an asserted exact boundary from the existing accepted browser suite; that suite's bytes were not edited. Isolated ports 18312/18313/18319 and owned temporary test/config files prevented old checkpoint outputs from being overwritten. Next's expected development next-env rewrite was checked and restored byte-for-byte. No SQL, product, schema, grant, generated contract or canonical document change was made in this continuation. The 141 current stage input pins remained unchanged.

## What the tests demonstrate

| Surface                 | Scenarios                                                                              | Observed behavior                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient `/records`      | error-terminal, conflict, authority-lost                                               | A synthetic 422/409/403 response clears previous rows and removes report fields; currently displayed as generic error/stale/denied respectively. No mutation sent      |
| Patient `/records`      | submitting                                                                             | An independently controlled HTTP response barrier keeps one explicit request pending; no second confirmation control; response release produces success                |
| Clinic summary          | error-terminal, aal2-required                                                          | Synthetic 422/403 responses clear data and remove report controls. The assurance scenario tests reaction to server denial, not real native AAL issuance                |
| Clinic summary          | context-ended                                                                          | A completed server encounter projection fails current-context reauthorization before another allergy read; prior allergy rows and report fields disappear              |
| Admin governance/review | error-terminal, authority-lost                                                         | Synthetic current read denials clear exact artifact review; no signing/publication controls remain                                                                     |
| Admin assigned review   | qualification-unresolved, self-approval-denied                                         | Explicit signing confirmation receives a synthetic forbidden response, clears material and removes action controls                                                     |
| Admin publication       | duty-conflict, digest-conflict, version-conflict, overlap-conflict, real-content-gated | Explicit publication confirmation receives the corresponding generic 403/422/409 response class; no success receipt, visible material or remaining publish/sign action |
| Admin                   | synthetic-gated                                                                        | Engineering-only and open clinical/design gate notices remain visible; no mutation sent                                                                                |
| Admin                   | aal2-required                                                                          | AAL1 transport fixture causes the local assurance guard to show step-up and sends no domain request                                                                    |

These are consumer/state reactions, not fresh proofs of qualification, independence, real-content admission, native Auth or physical SQL causes. In particular, different forbidden/conflict causes intentionally share generic wire responses; the fixture labels do not establish a new public error vocabulary. No clinical truth or real content was provisioned. Neither a fixture 422 nor a generic retry message establishes a distinct terminal-error composition.

The earlier four-family/99-state/746-reference mapping remains preserved. This supplement does **not** relabel all candidate distinctions as separately accepted live states or establish pixel fidelity. Three directly observed presentations are submitting, the synthetic gate notice and admin step-up. Other candidate distinctions still share generic error/stale/permission/unavailable presentation, and complete semantic/native/reference review remains unaccepted. No client side inference of private qualification or denial details was added to make the labels look distinct.

## Repairs and quality review

- Attempt 1: patient 8/8 and clinic 6/6 passed; admin stopped after 9 passed because a notice locator also matched the same copy inside a closed dialog. Retained raw failure/log/source. Changed the locator to the top-level visible main notice; the failed attempt never counted as evidence.
- Attempt 2: 36/36 passed. Second-pass review found the test's admin fixture mixed governance-only and assigned-review fields. Split it into the existing closed projection shapes and supplied full existing Problem fields; product and contracts unchanged.
- Attempt 3: 36/36 passed with those fixtures. Visual inspection found an Expo nested-scroll screenshot began below its heading. Applied the already established engineering capture convention (1280×2000 and scroll-to-top) for patient captures only; no UI/style behavior change.
- Final run: complete 36/36 passed after the capture repair. This is the current execution. Earlier reports/source/logs remain in attempt directories.

Test Guard review: mocks stay at HTTP transport; real screens, controllers and generated clients run unchanged; parameterized denial variants and deterministic submission barrier assert visible behavior rather than private helper calls. Separate governance/assigned-review fixtures preserve the restricted DTO boundary. The test does not purport to verify persistence against a mock.

Docs Guard review: paths and current claims checked against the source, reports and hashes. Proposed profile decisions are labeled unapproved; native worksheet is NOT EXECUTED. Screenshots inspected: patient AR submitting and EN conflict, clinic AR context-ended, admin EN qualification-denial. Visible safe denial is observed; generic messaging is recorded as a limit rather than claimed as exact candidate-copy acceptance. No final styling or full visual certification.

## T091 record and retained blockers

The current [full-verify record](../full-verify.json) records `pnpm verify` exit **0**, started 2026-10-10T06:31:39.375Z and finished 2026-10-10T07:22:02.098Z. Its exact log SHA-256 is revalidated in the manifest. Earlier failed/interrupted attempts remain in the performance-remediation evidence. The later successful engineering command is not T091 lifecycle acceptance: T091 remains unchecked, its dependent final evidence remains unaccepted, and the owner has explicitly withheld T092/K24. No full verify was rerun during this browser-only continuation.

OPEN-UX-002 remains OPEN: actual NVDA/TalkBack devices/versions, spoken behavior, native zoom and attributable formal review are missing. OPEN-TECH-003 remains OPEN: no formal reference environment or review owners are confirmed. The observed Windows/Chrome host is not an approved reference device. Existing 400/800 ms thresholds and all other retained technical, clinical and legal gate effects remain unchanged.

T088–T092 remain unchecked and Issues #485–#489 remain open; no Issue mutation was performed. T092 NOT EXECUTED. K24 BLOCKED. No subagent/delegate, commit, push, PR or main change.
