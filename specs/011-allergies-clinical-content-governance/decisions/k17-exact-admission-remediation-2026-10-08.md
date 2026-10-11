# K17 exact-admission implementation remediation

Date: 2026-10-08. Authority: Yousef Osama, Product Owner, K15_ACCEPTED + K16_ACCEPTED + PAIRED K17/K18 APPROVED, including ordinary implementation repairs and mandatory renewed SQL verification.

The approved data model requires exactly one currently eligible exact-artifact admission binding; ambiguity denies. A fresh native API fixture produced a draft, two independent signatures and two distinct valid exact-artifact admissions through the existing private audited provisioner. PostgreSQL 17.11 returned current eligibility true; the explicit unavailable assertion failed. This is valid missing implementation behavior, not setup, tooling or SQL syntax failure. Diagnostic: artifacts/feature-011/k18/k17-renewed-boundary.log.

The K06 function clinical.f011_release_current_eligibility_v1 used EXISTS over matching current admissions. Its minimum correction counts the same fully qualified matching rows and requires exactly one. All exact source/version/status/validity and signature predicates remain unchanged. No schema, uniqueness, lock order, projection, role, privilege, contract, Plan or operation changes. Multiple immutable historical bindings remain legal; they never authorize ambiguous current admission. The publication function continues to lock the exact authority/designation/admission basis and rerun this predicate.

SQL: supabase/migrations/20261006185240_f011_publication_functions.sql
Prior current SHA-256: 34584f7d9de0b72cf35900cb1f0b817177be57a761e9cc22454685bd481e497d
Corrected SHA-256: 1b24172abd84dc8ba4b7ce33970433b5af174760a2a95f85f099402968d11297

Revalidation is required from clean harness-owned databases: complete K05/K06 on PostgreSQL 17.11 and Supabase PostgreSQL 17.6, T027 physical GREEN, T028 all twelve race categories, and renewed T029 bounded P1–P5 against current hashes. Prior K05/K06/K07 and identifier-handoff acceptance records/evidence remain historical and byte-identical. No prior PASS is transferred to this correction.

All seven operations, four FR targets, nineteen NFRs, frozen vectors, protection/evidence contracts and Feature 012 exclusions remain unchanged. T063–T069 and Issues #460–#466 remain pending Product Owner review. T070–T092 are untouched. OPEN-TECH-002 remains globally OPEN; every retained gate remains unchanged. Synthetic engineering only; no real clinical/evidence-source or production approval. No Git integration.
