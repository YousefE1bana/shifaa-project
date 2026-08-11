# Research: Facility Onboarding and Contextual RBAC

## R-01 — Scope and operation inventory

**Decision:** Implement exactly the 22 active operation IDs in API Catalog §§2, 3, and 9 covering professional licenses, facilities, memberships, and admin role grants/revocations.

**Rationale:** This closes the requested Foundation slice without inventing endpoints or importing directorship, downstream facility operations, Family Care, DSR, or clinical scope.

**Alternatives considered:** A generic `/staff-facility` API and a two-admin facility-approval endpoint were rejected because neither exists in the catalog. Facility four-eyes is owner submission plus an independent facility approver.

## R-02 — Four distinct facility apps

**Decision:** Create/extend `apps/clinic`, `apps/pharmacy`, `apps/hospital`, and `apps/lab` as separate Next.js apps. Reuse package-level controllers/primitives, never app-to-app imports or one runtime facility app.

**Rationale:** Constitution Article XI and Master §1.2 require one staff app per facility type.

## R-03 — Canonical authorization action codes

**Decision:** Use API operation IDs as stable action codes for remote actions. `contracts/admin-role-actions.yaml` exhaustively records every active API Catalog operation mapped to the exact five admin roles. Only operations already shipped or implemented by 003 are seedable; later-feature and explicitly excluded operations remain declared-but-unseeded. Facility role/action/resource rows are separate and scoped to 003.

**Rationale:** The API Catalog is the canonical operation inventory and action-level permissions must not become an implicit hierarchy. A role may have multiple explicit rows; no role inherits another.

**Alternatives considered:** Mapping only the five 003 role-governance operations was rejected because it would not define the action-level boundary for `support_admin`, `medical_reviewer`, `facility_approver`, and `finance_reviewer`. Seeding permissions for routes owned by later features was rejected because it would silently implement excluded scope.

## R-04 — Evidence lifecycle

**Decision:** Extend the existing private `identity-evidence` bucket. Store random object keys and allow-listed resource/checksum/MIME/size/scan metadata; review approval requires `scan_status=released`. The deterministic scanner recognizes only committed synthetic checksums and production rejects it.

**Rationale:** The Architecture/Data contracts make private Storage authoritative and require quarantine/malware/type/size gates. A competing public evidence table or public URL is prohibited.

## R-05 — Professional-license authorization

**Decision:** The pure policy accepts a declarative professional requirement (`profession` and optional specialty). It allows only a current `verified` license whose expiry is absent or in the future and whose status is not suspended/rejected; every other state denies.

**Rationale:** Implements `FR-FAC-007` without implementing any regulated clinical/pharmacy action. Synthetic probe actions exercise the reusable predicate.

## R-06 — PostgreSQL/RLS shape

**Decision:** Use UUID PKs, explicit checks, partial indexes for current rows, indexes on every FK/RLS predicate, short transactions, stable lock ordering, and fixed-empty-search-path boolean security-definer helpers. All tables enable and force RLS.

**Rationale:** Matches the canonical Data/RLS contract and selected Supabase/PostgreSQL guidance. It avoids per-row unindexed policy work and pooled-context leakage.

## R-07 — Admin-role revocation

**Decision:** A revocation proposal never disables the active grant. Only an independent decision on the current request/grant versions atomically approves the request and revokes the grant; rejection retains it. Direct active-to-revoked table updates are revoked/guarded.

**Rationale:** API Catalog and Data/RLS explicitly define two-step revocation with one pending request per grant.

## R-08 — Open gates and claims

**Decision:** Keep real licensing documents, official approval, production sessions, real data, and pixel-identical claims disabled. Use deliberately synthetic organizations, people, numbers, and evidence.

**Rationale:** Constitution VII, the PRD open register, and user directive prohibit silently closing gates or making production/legal claims.

## R-09 — Correct repository paths

**Decision:** Use `docs/design/SHIFAA-UI-Contract.md` and `docs/traceability/SHIFAA-Traceability-Matrix.md` as the current canonical files.

**Rationale:** The prompt's older `docs/architecture/...` paths do not exist on synchronized main; PRD/Master link to the moved current paths.
