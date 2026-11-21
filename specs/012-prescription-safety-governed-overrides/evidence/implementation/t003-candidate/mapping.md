# T003 synthetic probe mapping

The [D1/D2 decision](../../../readiness/po-decision-approval-2026-10-23.md) binds
the [mechanism and timing clauses](../../../readiness/po-decision-resolution-proposal-2026-10-23.md)
and the [OpenAPI](../../../contracts/openapi.yaml) defines the transport shapes.
The file `vectors.json` defines test inputs for the candidate's pure structural
probe. It carries no operation registration, prescription, clinical alert,
production authority or patient identifier. T2 and current-authority inputs
represent declared fixture facts for this probe. A later admitted harness must
verify the actual evidence and authority independently.

| Context | Structural probe requirement                                                                                                                                                                              | Expected outcome when the declared guards hold                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W-M     | `structuredReason`, `justification`, `monitoringPlan`, current bound acknowledgement                                                                                                                      | Separate simulated sign eligibility                                                                                                                                            |
| W-NA    | `structuredReason`, `justification`, current bound acknowledgement. The control omits optional monitoring text                                                                                            | Same eligibility while preserving the distinct server-bound context                                                                                                            |
| N       | `rationale`, `alternativesConsidered`, `monitoringPlan`, live expiry and a current independent pharmacist approval                                                                                        | Separate simulated sign eligibility                                                                                                                                            |
| E       | N's required request fields, current independent second-physician approval a live request and a persisted pharmacist obligation. Pending pharmacist review additionally requires an active virtual window | Separate simulated sign eligibility. At window expiry, later current independent pharmacist approval can satisfy the next separate guarded sign while the window stays expired |

Each context has a control for every immutable `caseId`. The materializer
binds that case to the already approved original dataset digest and explicitly
declared synthetic zero for both histories. The three original carriers alone
supply no scenario, severity, monitoring applicability, emergency eligibility
or current-history proof. Controlled/NTI flags are deliberately absent from
the evaluator's input. Clinical assessment remains `not_fully_checked` in
every outcome.

Named variants replace or remove their declared nested field on a fresh
control. A null patch value means field omission. The expected decisions
cover incomplete, stale, unavailable and substituted evidence, untrusted
origins, wrong context, missing fields, repeated effects, independent persons,
current authority, request expiry and virtual-window expiry. Expiry accepts only
the UTC seconds form `YYYY-MM-DDTHH:mm:ssZ`; offsets, date-only and ambiguous
forms, non-string values and normalized invalid calendar dates are rejected.
The canonical UTC round trip rejects dates such as February 30 and non-leap
February 29. Virtual time is integer Unix seconds; the strict inequality makes
equality expired, and non-finite, fractional, string and null values are denied.
The request deadline and 60-second emergency window use that same clock. These
deterministic synthetic inputs set no new release, session, request or clinical
timing policy. The 60-second window follows D2.
The probe compares canonical synthetic person tokens. Equality tests cover
identical tokens and reject malformed representations. Resolving multiple
authenticated accounts to the same person requires separate native identity
evidence. Trusted capture, commit-time reauthorization, idempotency, atomic
effects and production namespace rejection belong to their designated runtime
tests. Request creation, assignment expiry, and server authority are resolved
facts supplied to this structural simulation through its declared inputs.

The test runs the disabled gate and verifies that input access stops before
evaluation. The separate behavior suite supplies decision assertions for a
future admitted entry point and records each observed outcome. It does not
import the evaluator or run on module load. Candidate behavior remains
unexecuted. The entry point is hard-disabled and unregistered.
