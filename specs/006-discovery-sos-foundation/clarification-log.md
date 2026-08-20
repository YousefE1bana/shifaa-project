# Clarification Log: Discovery and SOS Foundation

**Date:** 2026-08-20  
**Result:** No critical ambiguities detected worth formal user clarification after canonical reconciliation.

## Coverage summary

| Category                      | Status | Resolution                                                                                                                                                         |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Functional scope              | Clear  | Phase 2 facility/capacity slice plus ten SOS/pre-arrival/share operations; later doctor, pharmacy, review, arrival, triage, and bed work excluded                  |
| Actors and authorization      | Clear  | self, current guardian/delegate exact permissions, matched-facility HSP, public minimum projections, and one-time bearer scope                                     |
| Domain/state/concurrency      | Clear  | incident/share states, one matched facility, version/idempotency/race behavior, and terminal transitions specified                                                 |
| Geospatial/freshness          | Clear  | PostGIS authority preserved; local numeric values are named synthetic configuration; missing production configuration fails closed                                 |
| Emergency privacy             | Clear  | server-verified callback, selected confirmed contacts, consented precision, fixed notification and share allow-lists                                               |
| Missing clinical sources      | Clear  | only available canonical data is returned; unavailable selected fields are explicit and never synthesized; later clinical source lifecycles are not pulled forward |
| UI/accessibility              | Clear  | patient, public share-viewer, and hospital pre-arrival states are bilingual and governed by `OPEN-UX-001/002`                                                      |
| Performance/security/evidence | Clear  | canonical latency, forced-RLS, token, redaction, replay/race, and live AR/EN evidence gates are measurable                                                         |

## Canonical reconciliations

- `listSosPrearrivals` is included because the trace matrix maps the hospital pre-arrival worklist to `FR-SOS-002` and the UI Contract requires `/sos-prearrivals`; hospital arrival/triage behavior remains later-phase work.
- `FR-DISC-001` is staged rather than falsely marked complete: 006 realizes active verified facility and capacity discovery, while pharmacy-stock and review projections remain in their canonical later phases.
- No capacity-write endpoint is invented. Feature 006 consumes deterministic seeded-synthetic projections and fails closed when production freshness/radius configuration is absent.
- The public viewer uses `/sos/share` with a scrubbed URL-fragment token before calling the canonical `viewEmergencyShare` API; the token is not retained in browser history or rendered after use.
- Emergency-profile fields without an implemented canonical source are returned as unavailable, not fabricated or stored in a new shadow clinical source.
