# T012 disposable deployment attribution

The Product Owner’s 2026-11-26 “SHIFAA — T012 Product Owner Decisions” instruction records D1–D6 for engineering. This record answers the [deployment decision worksheet](t012-deployment-decision-worksheet.md) and supplements the [effective writer manifest](t012-effective-writer-manifest.md). T012 acceptance remains open.

## D1 · Approved target and observed roles

The target is the existing disposable synthetic topology defined by the [T002 harness receipt](harness-admission.json) and [harness](../../../../tools/verify-feature-012-harness.mjs). T002 records source revision `a19c07047acf154dda9b02862196a1af829e9d91`, a run-local API probe, Auth and PostgreSQL on a fresh internal bridge with no published ports, and a separate synthetic restore destination on network `none`. The later native guard receipt confirms the pinned native configuration. The supplemental catalog used the SQL-only configuration on network `none`. Local Compose, retained Supabase and hosted verification are separate configurations.

| Component | Observed role and scope                                                                                                                                                                                                                      | Evidence still needed                                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API       | T002’s Fastify probe connected as `f012_probe`. Historical T012 transactions and T011 native guard used `shifaa_api` as effective SQL session authorization. The [Core API adapter](../../../../services/api/src/app.ts) is source-verified. | The [2026-11-27 capture](#2026-11-27-combined-core-api-and-native-auth-capture) verifies the Core API PostgreSQL login and onboarding transaction. The live issuer and authenticated-route binding require further evidence. |
| Worker    | `shifaa_worker` executed the F007 expiry routine in a historical disposable SQL case. The supplemental catalog confirms a login role and the installed routine grant. `supabase_admin` owns the definer.                                     | An actual worker service or scheduled invocation was unobserved.                                                                                                                                                             |
| Auth      | T002 and the native guard run used pinned GoTrue as PostgreSQL `supabase_auth_admin`. The native guard receipt records effective session, MFA, refresh and hook settings.                                                                    | This operating evidence is limited to the pinned Auth configuration. The SQL-only catalog does not install native relations.                                                                                                 |
| Database  | Database owner `postgres`; catalog current and session role `supabase_admin`; read-only transaction. `shifaa_f011_executor` and `shifaa_f012_fence_executor` are NOLOGIN, non-superuser and NOBYPASSRLS.                                     | Ownership, ACL eligibility and actual invocation each require their own evidence.                                                                                                                                            |

| Receipt                | Run and exact revision                                                                                            | Scope                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supplemental catalog   | `2656b414-ccf3-4605-9490-cd15f2a7f5d6` · `64304237e9ecd2cf42b5577776635785acb75fac` · `PASS_T012_WRITER_CATALOG`  | Pinned PostgreSQL `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`, 38 sealed F011 migrations and T009. Recorded 36 relations, 121 role/DML entries, 80 policies, 47 routines and 32 triggers. Before/after inventory matched, including 12 containers and four volumes.                                          |
| Installed native guard | `3edb26b3-e7b9-4910-90be-8abc1defccd7` · `74dd511612d90d1d6c12c4c842ec0698888eace4` · `PASS_NATIVE_GUARD_CONTEXT` | Same PostgreSQL image, GoTrue `sha256:362659ca70eaa75ba05bbaf963caa84c1c5afe5e8fbf0777e17b830dd5f0f60a` and probe `sha256:a7bd46d14373a9550c00a2b61278ed51c47f2b5b6d2ed9f789279a63095f1f0f`. All 43 installed guard cases passed. Application workforce and active-recovery integration, hosted checks and specialist review are separate. |
| Ordinary verification  | `74dd511612d90d1d6c12c4c842ec0698888eace4`                                                                        | All nine ordinary checks passed.                                                                                                                                                                                                                                                                                                           |

Raw receipts are retained privately under the engineering workstation’s `LOCALAPPDATA/SHIFAA-Recovery`.

| Relative receipt path                                            | SHA-256                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-11-26-t012-catalog-64304237/catalog.json`                  | `88afb4da8c9e30574fac5532bc3f2fd5b17adac7fc7cfb4f0d7ed6b781a231a1` |
| `2026-11-26-t011-native-74dd511612d9/native-guard.json`          | `596d360f2c837af247ce30c02e2ce285f267ed447e537ecb81372f86e29d680d` |
| `20261126-003325-t011-ordinary-74dd511612d9/ordinary.stdout.log` | `842c0a73751bee78f6e98da26c441992f6c737c1974811869f8dc48c92e0e33b` |

The original RED observations, both orderings and 24 receipt checksums remain in [t012.json](t012.json). The restore-runner attribution and initial manifest remain in history at `0b4e0349c7986ab1ada1dae8e4511abd0c081847` and `23842420602ded10083045cc1b356a103cfdee91`.

## D2–D4 · Writer disposition and ownership

- **Evidence scanning.** D2 limits scanning to the synthetic fixture supported by the [facility runbook](../../../../infra/runbooks/facility-onboarding-rbac.md). External scanner, direct owner mutation and unverified approval service paths remain excluded from admitted capabilities.
- **Offline governance.** The [F011 evidence provisioner](../../../../tools/provision-feature-011-evidence.mjs) requires a bound approval source and matching authorized session and current user, `shifaa_owner` or `supabase_admin`. Approval remains subject to the owning governance contract. The catalog establishes `supabase_admin` ownership and forced RLS on `clinical.content_artifact_admissibility_bindings` and `consent.purpose_versions`. The binding relation has a guard trigger and restricted `shifaa_f011_executor` UPDATE grant. The purpose table has a current-read policy for `shifaa_api` and no applicable INSERT policy despite its INSERT ACL. A post-bootstrap purpose edit or approved provisioning invocation still needs an actual operator and approval receipt.
- **Maintenance and F007 expiry.** D4 reserves maintenance and recovery approval to the Product Owner and confirms Amira may perform eligible assigned F012 engineering. T002 identifies `AmiraSaad747` as the authorized harness owner. The [F007 runbook](../../../../infra/runbooks/identity-continuity.md#decoy-and-unbound-recovery-purge) documents the expiry call. The SQL-only catalog reports `extensionInstalled=false` and `jobCatalogPresent=false` for `pg_cron`. The tracked source search located the routine, its grant, the runbook and the fixture call. An F007 schedule or scheduler identity was unobserved in this scope.
- **Restore.** The [T002 receipt](harness-admission.json) records Amira’s authorization and restore into a separate run-local synthetic database on network `none`. [Predecessor runners](t012-writer-coverage.md#predecessor-restore-entry-points) remain attributed at `0b4e0349c7986ab1ada1dae8e4511abd0c081847`. D4 limits future execution to approved runbooks and isolated synthetic destinations. Admission drain and restore/readback, history and withdrawal preservation, and a fresh epoch remain assigned to T013 and T084.

## D5–D6 · Engineering disposition

The combined capture below supplies an application-backed onboarding connection and read-only writer catalog. The remaining [writer and predicate cases](t012-writer-coverage.md#outstanding-test-assertions-and-owners) require their own verdicts. Each newly established privileged invocation requires its documented approval, actual role and operator. T013 requires acceptance of both T011 and T012. The deferred Spec Kit upgrade is tracked [on maintenance issue #502](https://github.com/YousefE1bana/shifaa-project/issues/502#issuecomment-7196184880) for after F012 closure and before F013 in a separate tooling PR.

## 2026-11-27 combined Core API and native Auth capture

`--participating-core-api-writer` returned `PASS_T012_CORE_API_WRITER` in run
`7ae9d5a4-85c4-42fa-956e-ea76ecc65456` at test revision
`f9c45cc3770c2496ad813c5f46972865fd0f45cb`. The approved disposable internal
bridge held the database, pinned GoTrue and the probe container. The harness
streamed the committed Core API sources into probe tmpfs and used the pinned
dependency image. The 38 sealed F011 migrations and T009 matched the earlier
catalog capture byte for byte.

The existing Core API assembly selected its PostgreSQL repository. Its
connection reported `session_user = current_user = shifaa_api` on the owned
database endpoint. The onboarding service completed registration for a
synthetic subject established by pinned GoTrue. The service used the same
backend and transaction observed by the probe. Independent readback found one
person, one patient, one self-care relationship and one successful registration
audit event for the exact request. The test enters at the service boundary
after fixture Auth signup. Full Core API issuer and live authenticated-route
binding remain to be verified.

The read-only capture recorded 39 relations, 136 role/DML entries, 80 policies,
47 routines and 32 triggers. All five listed Auth relations were present and
owned by `supabase_auth_admin`. The onboarding routine was owned by
`supabase_admin` with execution available to `shifaa_api` and the owner.
The catalog again showed the F007 expiry routine available to `shifaa_worker`
and the owner. An actual scheduler invocation remains unobserved. Neither the
`pg_cron` extension nor its job catalog was present in this disposable run.

The private receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t012-core-api-writer-f9c45cc3/core-api-writer.json`
(183,258 bytes, SHA-256 `75c15d501b6976082e71b0fbd75fd1f93af2daa635aaa9069c903f1844b7c714`).
The source archive SHA-256 is
`87e98ffcfb07b0aa2513585fb6d078f1077dddd96316dfd80c72b0e20a6d4cd9`.
The run exited 0 with empty stderr and preserved the retained inventory of
12 containers and four volumes. Two earlier blocked setup receipts remain
under `2026-11-27-t012-core-api-writer-cfd5bbde` and
`2026-11-27-t012-core-api-writer-eeb534cf`.

## F007 scheduling and privileged operation disposition

The inspected disposable topology has no scheduler container, installed
`pg_cron` extension or job catalog. Its F007 scheduler path is absent. Any
external trigger is unobserved and excluded from admitted capabilities. The
routine is installed and its historical manual invocation as `shifaa_worker`
is verified separately. There is no scheduled invocation to execute for this
topology. The [source-consumption contract §3](../../contract-amendment/source-consumption-successor-v0.1.0.md#3-participating-writer-and-trust-inventory)
requires any future scheduler or external invocation to be identified and
verified before affected capabilities can rely on it.

The documented offline provisioner remains subject to its existing approved
source and operator checks. No actual post-bootstrap approval or invocation
was observed for this topology. Unverified concurrent provisioning and
owner/maintenance activity remain excluded. The contract requires a verified
participating writer or controlled quiescence. T002 executed a separate,
isolated synthetic restore. F012 admission drain, restore preservation and
fresh epoch verification remain unexecuted under T013 and T084.

## 2026-11-27 authenticated Core API consent

The `--participating-authenticated-core-api-writer` focus used the existing
disposable internal bridge, pinned PostgreSQL and GoTrue, and a probe running
the committed Core API with its Supabase Auth and PostgreSQL adapters. GoTrue
got a fresh ES256 key for each run and issued the session token consumed by
the Core API using the run-local JWKS. This signing configuration is confined
to the disposable test. The API retained login `shifaa_api` on the run-owned
database and GoTrue used `supabase_auth_admin`. The 38 sealed predecessor
migration hashes matched the earlier capture.

| Run and test revision                                                               | Actual outcome                                                                                                                                                                                                                                              | Private receipt under `LOCALAPPDATA/SHIFAA-Recovery`                                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `81e7674b-50db-4c83-84b7-05ccb252008d` · `79c649a1223b3ccac0b7f3a1dcebb3d14c9fb226` | The real Core API consent route returned 401 without a bearer and 201 with the native session. Independent readback found one `identity_proofing` grant, one audit event and one outbox event.                                                              | `2026-11-27-t012-authenticated-consent-79c649a1/authenticated-consent.json` · 185,404 bytes · SHA-256 `7b075029e0b1e3578ed6b9b4c8207ac953d539665a6366912d93caca20493168` |
| `8c5c6ba4-2984-4a7b-bc52-a926d09f81ad` · `ca3e93446b20f1848caff412bd38df410c30ccbb` | The grant returned 401 without a bearer and 201 with the native session. The authenticated withdrawal returned 200. Readback found the `care_updates` version 1 grant and its linked version 2 withdrawal. Each had exactly one audit and one outbox event. | `2026-11-27-t012-authenticated-consent-ca3e9344/authenticated-consent.json` · 185,674 bytes · SHA-256 `a85ed91deba38337cc89554df556adcaba49fad11581e64a847101db1595ce26` |

Both runs returned `PASS_T012_AUTHENTICATED_CORE_API_WRITER` with exit 0 and
empty stderr. Each preserved the before/after inventory of 12 retained
containers and four volumes. The second Core API source archive SHA-256
was `8e43198f282e7d9ad0ee270123bb3d569931e8928c9138a6f57cb32b5f53630b`.
The onboarding step still uses a run-local service fixture to establish the
profile. The consent requests use the live issuer, and the receipt covers
their normal route effects. Predicate mapping, its distinct effective-date
and authority cases, and later admission-order proof retain their existing
task ownership.
