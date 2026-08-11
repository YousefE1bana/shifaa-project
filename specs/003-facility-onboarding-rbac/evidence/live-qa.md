# Live browser and service acceptance

Date: 2026-08-11 (Africa/Cairo)
Mode: seeded-synthetic only; no production or Egyptian licensing approval claim

## Result

PASS for the executable engineering gate. Formal design/legal/production overlays remain blocked by the canonical OPEN items.

The in-app browser drove the real Next.js dev services on ports 3000 and 3011-3014. The local Supabase runtime and Fastify service were also exercised by the runtime and E2E suites. Every image listed below was opened and visually inspected before this result was recorded.

## Browser matrix

| Surface                   | Locale/direction   | Viewport/state       | Result                                                                |
| ------------------------- | ------------------ | -------------------- | --------------------------------------------------------------------- |
| clinic onboarding         | Arabic / RTL       | 1440x900 quarantine  | PASS; logical alignment, live status, focus ring                      |
| clinic onboarding         | English / LTR      | 1440x900 quarantine  | PASS; locale switch and LTR reflow                                    |
| clinic onboarding         | Arabic / RTL       | 360x800 expired      | PASS; 345px client width equals scroll width, no horizontal overflow  |
| pharmacy onboarding       | Arabic / RTL       | 1280x800 draft       | PASS; separate pharmacy entrypoint                                    |
| hospital onboarding       | Arabic / RTL       | 1280x800 draft       | PASS; separate hospital entrypoint                                    |
| laboratory onboarding     | Arabic / RTL       | 1280x800 draft       | PASS; separate lab entrypoint                                         |
| admin facility review     | Arabic and English | desktop, success     | PASS; minimum projection, AAL2/purpose text, reason-required decision |
| admin professional review | Arabic / RTL       | desktop              | PASS; masked number and released-evidence projection                  |
| admin role governance     | Arabic / RTL       | desktop, self-denied | PASS; exact grant/revocation actions and independent-actor denial     |

The browser reported `prefers-reduced-motion: reduce`; governance surfaces contain no decorative animation. Keyboard focus was visible on locale, evidence, and decision controls. Select, textarea, and buttons have accessible names; state changes use polite live regions.

## Mandatory journey outcomes

1. Owner creation: `tests/e2e/facility-onboarding.spec.ts` created four facilities through the real Fastify app.
2. Four types: clinic, pharmacy, hospital, and laboratory reached governed outcomes; the browser confirmed four distinct apps.
3. Private evidence: local Supabase uploaded synthetic PDF bytes into both private facility/professional buckets.
4. Quarantine: the upload operation returned quarantine, and pre-release submit/review was denied.
5. Admin review: Facility Approval Admin required AAL2 plus `facility_approval` purpose and received a minimum projection.
6. Decision: alternating approve/reject outcomes followed the canonical state guard.
   7-10. Licensed staff invite, acceptance, facility entry, and person+facility attribution passed in the API workforce integration test.
   11-14. Cross-facility, wrong-role, missing-purpose/AAL, and every invalid professional-license status returned deny.
   15-16. Grant and revocation each required an independent decision actor.
   17-18. Same-body replay returned the stored result; changed-body replay returned 409 without duplicate effects.
7. Direct database negatives passed under `shifaa_api` with forced RLS.
8. Anonymous listing and unrelated authenticated fetches failed; only the owning synthetic subject fetched the private test object.

## Inspected images

- `clinic-ar-desktop-quarantine.png`
- `clinic-en-desktop-quarantine.png`
- `clinic-ar-mobile-expired.png`
- `pharmacy-ar-desktop.png`
- `hospital-ar-desktop.png`
- `laboratory-ar-desktop.png`
- `admin-facility-approvals.png`
- `admin-facility-approvals-en-success.png`
- `admin-professional-licenses.png`
- `admin-role-grants-self-denied.png`

## State coverage

The seeded state controls expose loading, empty, quarantine/released, pending, rejected, active, suspended, invited, ended, expired, invalid-license, offline, permission, conflict, error, and success. Admin state coverage additionally includes AAL-required, purpose-required, self-denied, revocation-pending, and revoked. Automated component checks guard this inventory.
