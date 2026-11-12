# NAC-1 existing-local Auth maintenance, verification and F012 handoff

Date: 2026-11-11. Owner authorization: Yousef Osama's directive to maintain the existing `shifaa-local-supabase`, preserve all records, run focused engineering checks and prepare F012 without lifecycle advancement. This execution record supersedes the disposable-target recommendation; its original artifact remains unchanged. No second stack was created.

**NAC1_CONFIG_PINNED_CONTRACT_READY.** Configuration and native compatibility checks completed. The [NAC-1 supporting-contract candidate](../contract-amendment/native-authority-nac1-successor-v0.1.0.md) is ready for exact technical acceptance, not accepted/integrated/installed by this record. F012 remains **PLANNED / DRAFT_FOR_REVIEW; BLOCKED_BEFORE_PLAN_APPROVAL**. Native primitive checks are not full F012 guard, forced-RLS or atomic-effect acceptance.

## 1. Target, authority and preservation

Worktree `D:\ECU\Gradution-Project\.worktrees\f012-specify-20261023`; branch `codex/f012-specify-20261023`; HEAD/approved Specify checkpoint `c571773d6432251d1f52bc94bb501c4e163f1571`. Fresh fetch left `origin/main` at `baa44d5590760eaca73f4ca1ddcea01c113c8ebe`; no merge/rebase/reset. Effective Constitution 3.0.1, PRD 2.2.0, Master 2.2.1 and Reviewer Contract 0.1.0 remain the Plan's source bindings. Current authority is located by the [authority map](../../../docs/governance/SHIFAA-Current-Authority-Map-v1.md); existing approvals remain authoritative only within their recorded scope.

The retained stack was labeled to the SHIFAA `github-work-management-20261021` worktree. The latest directive expressly authorized maintenance of this existing project. No synthetic-only classification is claimed for its preexisting records or credentials. Non-sensitive checks, preservation and an owned new Auth-only synthetic fixture made the bounded maintenance/tests possible without reading patient record contents. Existing exposed database binding was not widened or presented as production-safe.

Before recreation: protected custom-format PostgreSQL backup, 2,474,428 bytes, SHA-256 `822fd0a9b123ad9b6231d376e1f13bf1e1031baecf5ccdd6b084743f8bc75cdc`. Full archive decode completed; decoded-stream SHA-256 `e3bf6ef940d691df20e607c1b53a0900dea9d91267a5d5b8d553e511d7bdc56e`. No restore was executed. Archive/full original inspect/fixture identity and credentials remain in current-user-only `.tmp/nac1-maintenance/private/`; never stage or publish these. Sanitized evidence and local-tool hashes are indexed in the [verification bundle](nac-1-local-auth-verification-2026-11-11.json).

Database container `06d6e45e6908f016604fc7bded12068b0895000f86b60c9411ac487382f7730c`, persistent volume `supabase_db_shifaa-local-supabase` and ten other services retained their identities, startup times and mounts. All 116 table fingerprints matched immediately after Auth replacement. After tests, every preexisting row fingerprint/count remained; 36 net new Auth/test audit rows were added. The single new owned synthetic Auth identity is retained disabled/banned. Existing records were neither reset nor removed.

## 2. Actual repair and effective target

Only Auth was recreated using its cached immutable image; no pull, build, migration, seed, database restart or volume operation. The original Auth container remains stopped/disconnected as `supabase_auth_shifaa-local-supabase_before_nac1_20261111`. Replacement `846ea7faaf66be4a5bcabf6ac5f785190703c9b3c3e9e752352d5788ef19a9e4` started `2026-11-11T10:17:29.816802641Z`, healthy, on the existing network/IP/alias with no new host port.

Target `public.ecr.aws/supabase/gotrue:v2.195.0`, digest `sha256:362659ca70eaa75ba05bbaf963caa84c1c5afe5e8fbf0777e17b830dd5f0f60a`, source `0522e7bcf7135a476d258b1603134b97846179fc`. The previous publish-job binding remains attributable rather than cryptographic attestation; August runtime identity remains unproven and was not reopened.

PID 1 is `auth serve --config /etc/shifaa-nac1.env`. The local-only read-only carrier `.tmp/nac1-maintenance/auth-policy.env`, SHA-256 `cd3f7fc0600c7a7bba4e1def36d9b0481c652d797db0fe8bfe8b7634d1136bd6`, reliably carries all seven explicit false hook values despite the stock CLI's missing/omitted carriers. Pinned loader precedence and no config directory exclude default-file overrides/reload watching. No unsupported TOML key or tracked canonical config change was used.

| Effective policy                                         | Actual binding                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Seven hooks                                              | MFA/password verification attempt, custom access token, send email/SMS, before/after user created: explicitly false           |
| SinglePerUser; tags; AllowLowAAL                         | false; nil; nil. Nil fields absent from both startup environment and explicit file, fallback excluded; not guessed false/zero |
| Unrestricted refresh reuse; current-password requirement | false; false, preserving pinned defaults                                                                                      |
| SAML; OAuth server; custom OAuth                         | false; false; true, preserving pinned defaults                                                                                |
| Existing session/JWT/refresh                             | 23h45m timebox; 45m inactivity; 900-second JWT; rotation true; 10-second reuse interval unchanged                             |
| Existing MFA/email                                       | TOTP enroll/verify true, maximum 10; existing native email enabled. No TOTP/recovery/email policy replacement                 |

Local-only `maintain.py` prepare/repair, read-only `verify.py`, native check scripts and sanitized results remain ignored, hash-indexed in the bundle. Original startup/rollback identities withdraw NAC-1 admission; stock CLI recreation requires re-readback and cannot silently inherit this receipt. No automatic rollback or cleanup ran.

## 3. Executed checks and retained failures

| Evidence class             | Result and limit                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration/preservation | **9 PASS**: actual image/carrier/process, seven hooks, native health/email, unauthenticated admin denial, unchanged other containers, retained original and initial data equality                                                                                                                                                             |
| Existing F007 tests        | **61 PASS in five files**. Worktree dependency resolution initially failed; failures retained. Existing root installed dependencies ran the same suites after byte equality of 266 relevant tracked sources and package/lock/Vitest configuration was verified. No installation/lockfile edit. Ignored junctions reuse installed dependencies |
| Native/SQL compatibility   | **28 PASS**: synthetic password/TOTP AAL2, subject/session binding, native ban/MFA/local/global logout conflicts, stale AAL/ban/session denial, KEY SHARE counterexample, native refresh deadlock/fresh retry, API-role Auth-table denial, NotAfter equality and preservation                                                                 |
| Refresh failure diagnosis  | Two initial SDK-based assertions failed because SDK retried a native failure transparently. Original results retained. A single raw HTTP attempt exposed genuine native 500; sanitized server-log summary confirmed deadlock/40P01, then fresh retry succeeded. Test corrected to observe the actual single attempt, with no guard weakening  |
| Full F012 acceptance       | **NOT RUN / not implemented**: bound non-owner helper, complete forced-RLS/API cases, source/local writer participation, atomic audit/outbox/idempotency/P2/P3 failure injection and full race matrix. Administrative test SQL on only the owned new Auth fixture is not online authorization evidence                                        |

Native tests use existing non-destructive local tooling and one newly generated `synthetic-007-nac1-…@synthetic.shifaa.test` Auth-only fixture. No clinical mechanism vector, patient record processing or email delivery test ran. Native settings/password/TOTP success does not establish SMTP delivery. `pnpm verify` and destructive harnesses were not run.

## 4. Exact design closure and remaining work

The closed candidate retains current `auth.users FOR SHARE` then matching `auth.sessions FOR SHARE` on the same future F012 PostgreSQL transaction, after A-DB/idempotency and before producer/local ranks. SHARE conflicts with non-key ban UPDATE, unlike KEY SHARE. Native refresh's inverse session→user order can deadlock: bounded whole-transaction abort/revalidation/original-key retry is required, not a false deadlock-free claim. No network operation occurs under guarded locks. Fresh signed JWT/TOTP, native user/session/AAL/NotAfter and local recovery/current authority remain required; refresh eligibility is not indiscriminately treated as access revocation. No physical commit-before-expiry promise.

Current native tables have RLS but no non-owner policies; the existing boolean helper's privileged ownership cannot substitute for the new port. The candidate explicitly prepares a narrow internal non-owner/NOBYPASSRLS executor, bound policies and EXECUTE-only API port. These are **uninstalled proposed supporting-contract deltas** requiring exact governed acceptance/integration. Direct Auth-table denial under the actual normal API role passed; future bound-helper/independent forced-RLS acceptance has not.

Smallest remaining pre-Plan items:

1. Exact acceptance/integration of NAC-1 and the prepared A-DB/S4/API/Data/RLS/P1–P3 technical contracts under Yousef's existing pre-implementation authority. Do not repeat Product-policy approvals. Installed migrations/full runtime tests follow separately authorized implementation, not design acceptance.
2. Establish an approved positive patient visibility contract/path. VP-1 remains unapproved, `POSITIVE_PATH_NOT_ESTABLISHED — BLOCKED`; J-04/AC-13 stays in scope and cannot pass on denial alone.
3. Actual OPEN-UX-001 Clinic, emergency physician, Pharmacy Safety Review and Patient compositions, Arabic/English and 360×800 / 412×915 / 768×1024 / 1440×900 immutable baselines. Existing [Design brief](open-ux-001-product-design-review-brief-2026-10-23.md) retains exact state requirements; no Design acceptance fabricated.

Full OpenAPI 3.1.1 semantic validation remains **VALIDATION_NOT_AVAILABLE** with installed tools; bounded YAML/reference/Ajv checks are separate. Actual generated parity, independent RLS, F012 races/recovery, native accessibility/live bilingual and professional gates remain at their assigned stages/capabilities.

**Next lifecycle action:** remain in the existing Plan review for exact technical acceptance and outstanding pre-Plan decisions/evidence. After a separately attributable PLAN_APPROVED, only separately authorized `$speckit-tasks` may advance. No new Specify/Plan invocation, Tasks or F012 implementation was initiated here.

## 5. Change manifest

New: this receipt, its sanitized JSON bundle and `contract-amendment/native-authority-nac1-successor-v0.1.0.md`. Reconciled only the six existing uncommitted `plan.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`, `checklists/plan-consistency.md`. No changes to six committed Specify files, prior approvals/proposals/receipts, F007/F011 canonical/runtime sources, fixture bytes or either feature pointer. No stage/commit/push/merge/cleanup.

Final bounded readback: all 5,707 tracked files and sixteen other preexisting untracked artifacts match the 5,729-file starting inventory; only the six authorized Plan drafts changed. All six Specify working-file/Git-blob pairs and both feature pointers match. Specification checklist remains 16/16 unchanged. YAML parsed, all 60 component schemas compiled with existing Ajv, 313 document references and 129 local Markdown links/seven anchors resolved; twelve operations and 7/2/22/16 traceability counts preserved. Full OpenAPI semantics is still VALIDATION_NOT_AVAILABLE. Final Auth health and ten other container startup/mount identities were rechecked, with backup/carrier hashes unchanged. Narrow credential-pattern scan found no matches; it is not a comprehensive PHI classification. Formatting passed. Validation output is retained ignored under `.tmp/nac1-maintenance/final-*.json`; no runtime or generated-client acceptance inferred.
