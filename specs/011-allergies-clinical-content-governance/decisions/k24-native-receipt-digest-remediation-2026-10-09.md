# K24 native Supabase receipt digest implementation remediation

Authority: Product Owner instructed root to review, resolve ordinary implementation obstacles and continue K23/K24. This is an implementation correction under that bounded authority, not a new architecture, operation, privilege or contract decision. K24 remains unaccepted.

Actual native-session regressions failed SQLSTATE 42501. Server context identified clinical.f011_require_mutation_commit_v1 -> audit.sha256_v1 -> extensions.digest. Accepted F011 executor has no extensions schema USAGE; no grant is added. F008 audit append remains unchanged.

Both F011 principal-digest checks use pg_catalog.sha256 on the unchanged UTF-8 octet-framed principal. The fixed SHA-256 algorithm and all all-five predicates, global completeness scan, fixed search_path, FORCE RLS and executor privileges remain unchanged. No early return bypass is introduced. Receipt encryption/evidence behavior is unchanged.

Before sources and native failing log are retained. Fresh K05/K06/T027/T028 both-runtime proofs and P5 are required before affected consumers resume. Prior K06/K07 and T089 documentation-only acceptance records are preserved. This separate successor records SQL implementation repair, not documentation-only maintenance. OPEN-TECH-002 remains globally OPEN; every retained formal/legal/clinical gate remains open. No Git integration.

{
  "supabase/migrations/20261006175942_f011_atomic_receipts.sql": {
    "before": "4de286c39005856f0132f7432e76efb07f24d8d7e0fe8b67d1c5ec9280bb056d",
    "after": "c873313925348c84822bcf137c757d2e2475e62cbf2416fe6dff7433d77e3929",
    "change": "Single function reference only: audit.sha256_v1(bytea) -> pg_catalog.sha256(bytea); identical framed principal bytes, exact SHA-256, unchanged all-five predicates/grants/search_path"
  },
  "supabase/migrations/20261006185242_f011_receipt_functions.sql": {
    "before": "850335b5acfc51eed3076a74b07acd3989b2ae08ba926d99f8489ed18ff9ac39",
    "after": "17114f0a3bf4290cb94b8f38a8a759f20a3ea23487ccdcff7d3eecfe82f04f31",
    "change": "Single function reference only: audit.sha256_v1(bytea) -> pg_catalog.sha256(bytea); identical framed principal bytes, exact SHA-256, unchanged all-five predicates/grants/search_path"
  }
}
