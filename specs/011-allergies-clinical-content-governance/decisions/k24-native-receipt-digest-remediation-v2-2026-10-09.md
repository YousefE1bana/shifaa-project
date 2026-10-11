# K24 complete native extension-layout SHA-256 implementation sweep

Authority: continuing the Product Owner-authorized root review and ordinary K23/K24 obstacle remediation. The first local candidate record and all failed runs remain preserved; no historical acceptance is rewritten.

Restricted extensions regression failed SQLSTATE 42501 inside F011 finalizer's SELECT, due to the F011 executor idempotency RLS expression calling audit.sha256_v1. Complete F011 inventory also identified ARTIFACT hashing's same helper dependency. Five expressions in four migrations now invoke pg_catalog.sha256(bytea), already used elsewhere by the approved canonicalization tooling. UTF-8 framing, algorithm, digest equality, both RLS predicates, all-five checks, security definers, ownership, grants and public wire shape remain identical. The existing audit helper grant is unchanged; F008 is untouched. No extensions privilege is added.

The restricted-layout valid RED is retained. Fresh K05/K06, restricted schema all-five mutation proof, full T027, 12/12 T028 on each runtime and renewed bounded P5 are required. No clinical/production/formal reference profile or global gate closure. K24 remains pending review.

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
  },
  "supabase/migrations/20261006185241_f011_rls_grants.sql": {
    "before": "368d9b19425451b1031de65780cb7ff36063eac795d71de925194df069fba26d",
    "after": "6c7b6ab99d8b8d00ac6699cdfc8a63d88bd41d6f73e2f5ccd36a7244c1df0236",
    "change": "Only SHA-256 call-site primitive; identical principal/ARTIFACT bytes; exact policy/eligibility/grants preserved"
  },
  "supabase/migrations/20261006185237_f011_release_functions.sql": {
    "before": "a8bba430b0ac52dd4c0fe13be4fddabff58ba5d89ca464131d2663100b62253a",
    "after": "3871489179a618a277c598c142786343514c738751e4b03b443352ba047b34a9",
    "change": "Only SHA-256 call-site primitive; identical principal/ARTIFACT bytes; exact policy/eligibility/grants preserved"
  }
}
