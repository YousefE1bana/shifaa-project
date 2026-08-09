# Research: Identity Onboarding

## R-01 — Feature boundary

**Decision:** Implement the first vertical flow only. `FR-AUTH-002` covers patient register/login/OTP here; workforce MFA follows facilities/RBAC. `FR-AUTH-007` covers notice/consent here; DSR follows in a separate Foundation spec. `FR-AUTH-005` is not targeted.

**Rationale:** The Product Owner explicitly named Registration → Auth → Identity Verification → Consent → Patient Profile. Claiming the entire broad PRD rows would hide unfinished recovery/MFA/DSR work.

**Alternatives considered:** One all-auth epic was rejected as non-independent and too large for a first vertical slice.

## R-02 — Authentication adapters

**Decision:** Keep Supabase Auth as the production issuer. Provide a deterministic local adapter behind the same `AuthIssuer` port, guarded so production startup rejects it.

**Rationale:** This preserves the approved architecture while allowing a working seeded-synthetic graduation environment before production SMS/vendor/legal gates.

**Alternatives considered:** Clerk/Auth0/Descope conflict with the approved Supabase decision. Handwritten production password storage duplicates a security-critical auth system and is rejected.

## R-03 — Registration aggregate

**Decision:** Registration atomically creates the auth subject mapping, person, patient, and active self relationship.

**Rationale:** The MVP outcome requires a lawful self relationship; Data-RLS requires one unique active self relationship; leaving it to a later call would expose a half-registered patient state.

## R-04 — OTP initiation

**Decision:** `registerPerson` and `login` may return an OTP challenge. `verifyOtp` consumes it. No resend/start endpoint is added.

**Rationale:** This is the only interpretation that makes the existing catalog complete without inventing an undocumented route. Resend remains outside this slice until the catalog defines it.

## R-05 — Identity storage and proofing

**Decision:** AES-256-GCM with fresh 96-bit nonce and key version encrypts the value; HMAC-SHA-256 under a distinct key produces exact-match blind index. Proofing is a port with deterministic local outcomes and disabled production adapter.

**Rationale:** Directly implements Master §2.3 and `FR-AUTH-006`; separates cryptography and vendor behavior from domain policy.

## R-06 — Evidence objects

**Decision:** Use a private Supabase Storage bucket and `storage.objects` metadata with random keys and quarantine state in verification-case evidence metadata. Do not add a public evidence table.

**Rationale:** Matches the approved storage architecture and avoids a second object authority.

## R-07 — UI direction

**Decision:** Use canonical UI tokens with an Arabic-led “care passport” status rail connecting profile, identity, and privacy readiness. It is not a numbered wizard. Patient-only transitions are restrained; consent/identity/admin decisions are zero-motion.

**Rationale:** Distinctive to SHIFAA's longitudinal care identity while respecting the two-speed visual language, WCAG 2.2 AA, and budget-Android constraints.

## R-08 — Toolchain and reproducibility

**Decision:** Pin the verified machine versions and current registry releases in package manifests/lockfile, add Docker PostgreSQL 17 for migration/RLS tests, CI gates, SBOM generation, and checksum evidence.

**Rationale:** This feature must create the absent Phase-0 scaffold and advance `OPEN-TECH-001` without claiming closure before a clean build log and image digests exist.
