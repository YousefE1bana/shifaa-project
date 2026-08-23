# Live Arabic and English acceptance evidence

**Observed:** 2026-08-23  
**Runtime:** seeded-synthetic PostgreSQL 17 + PostGIS 3.5, forced-RLS API, local worker, patient Expo web, hospital Next.js  
**Source revision:** implementation/evidence commit `30e9f46603dea36b158fb86d96a5b83830aa3b36`; the final PR HEAD is recorded in `verification.md`. Configuration digest: `0861710303d2ebe0135774ef529ac29cc577568721b87a7ece4ae0d3d30cfe26`.

This is engineering acceptance evidence, not production emergency, design-baseline, pixel-identity, ambulance-dispatch, bed-reservation, provider-delivery, or clinical assurance.

## Inspected journeys

| Artifact                                            | Locale / requested viewport                      | Live state and result                                                                            | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `live/ar-discovery-360x800.jpg`                     | ar-EG / 360x800                                  | RTL discovery, Arabic font, fresh capacity, manual/list fallback, no horizontal overflow         | `99b0c3604fcf7ad6177ba92fdfa5582e5061f6b652f87cc584d65eb54e176410` |
| `live/en-discovery-360x800.jpg`                     | en-EG / 360x800                                  | LTR parity, Inter font, translated service and capacity text                                     | `cc8d09947288f2570f9a1239490e538fce4ee37b37d997daf67f8683467130d7` |
| `live/en-discovery-reflow-320x800.jpg`              | en-EG / 320x800 requested; 291x727 CSS content   | 400%-equivalent narrow reflow, visible keyboard focus, no horizontal overflow or animation       | `ffe6eb3a4c6df4415b01ecb9a2709f25f997e2873f8dc501d99faa7181cee70e` |
| `live/ar-sos-confirm-412x915.jpg`                   | ar-EG / 412x915                                  | Explicit patient, location, reason, callback, and contact confirmation; `123` remains visible    | `9ad35cc374cd059bcdee423d9f389fe64ca68eee87e7cb5433c5cfff72846936` |
| `live/ar-sos-delivered-412x915.jpg`                 | ar-EG / 412x915                                  | Real local incident and durable synthetic contact-delivered state; no dispatch/reservation claim | `4d8c4e6339fd3dc398d3b125948b07e60b970e1ed88ba3acb5ca9fbbd24eb0bb` |
| `live/ar-share-owner-768x1024.jpg`                  | ar-EG / 768x1024 requested; 698x930 CSS content  | Post-copy owner state; capability absent from DOM, URL, history, and storage; revoke retained    | `43b6aa15c2a48f3f46c7d2915e890e45d2a1dd8beff38984a82b44687c56a48a` |
| `live/en-public-share-gone-360x800.jpg`             | en-EG / 360x800 requested; 327x727 CSS content   | Invalid/terminal public share, fragment scrubbed before API use, uniform terminal copy           | `cb7822c03e4a2367aa3196360ae73da63a7823c87109d0632071392059284a86` |
| `live/ar-hospital-capacity-1440x900.jpg`            | ar-EG / 1440x900 requested; 1309x818 CSS content | RTL read-only aggregate capacity, current facility context, fresh timestamp                      | `2c54558a54eda5e7a3481f4302ce44087ea8c3debc3f1ee9aa3fb3604260ee04` |
| `live/en-hospital-capacity-1440x900.jpg`            | en-EG / 1440x900 requested; 1309x818 CSS content | LTR parity and translated capacity signal/count band                                             | `8e71023e18a59d8bab6a03c160910a3cdc7663e7974d435de85451da5ea01fee` |
| `live/ar-hospital-prearrival-1440x900.jpg`          | ar-EG / 1440x900 requested                       | Minimum pre-arrival projection with no bed, ward, diagnosis, or dispatch promise                 | `d3e9d7436397ecf525c4664976940f3770c71156e5141c4a4a4fd8fcba1c4ff3` |
| `live/ar-hospital-prearrival-dialog-1440x900.jpg`   | ar-EG / 1440x900 requested                       | Native modal semantics, initial focus, Escape close, and focus return verified                   | `b72acda5c9b9b4f85bdfc9d2d6080bdb2def4c128d33587b9f1d24ea6a8cf967` |
| `live/en-hospital-prearrival-accepted-1440x900.jpg` | en-EG / 1440x900 requested                       | Explicit acceptance completed against the real stack; no guarantee language                      | `d024ded70ef19eb69ee3612761315aa68150ca1c67772a7c1676873e105bfdb1` |

## Interaction, accessibility, resilience, and privacy probes

- Document `lang`/`dir` were `ar-EG`/`rtl` and `en-EG`/`ltr`; loaded computed fonts were IBM Plex Sans Arabic and Inter respectively.
- Keyboard focus was visible; the acceptance dialog was `:modal`, focused its safe action, closed on Escape, and returned focus to its invoker. Semantic roles/names were inspected in the live DOM. No OS screen-reader connector was available, so this is semantic and keyboard inspection rather than a claim about every assistive-technology combination.
- Forced-colors emulation was active, reduced motion was honored, computed animation count was zero, and compact/reflow states had no horizontal overflow.
- Offline discovery showed the authored reconnect state and did not queue a mutation.
- Owner share post-copy and public terminal states contained no capability in the URL hash, body, local storage, or session storage. The valid one-use public path is additionally covered by the real-stack API/E2E test; no bearer was placed into screenshot tooling.
- Patient LCP was 376 ms. A 20-sample laboratory input-to-next-paint proxy had p95 3.5 ms. The automation events were untrusted, so standards-valid field INP was not observable and is deliberately recorded as `null`, not fabricated.
- All live processes were stopped after capture and the feature ports were confirmed clear.

`OPEN-UX-001/002`, `OPEN-PRODUCT-001`, `OPEN-TEAM-001`, and `OPEN-TECH-003` therefore remain open; the inspected evidence satisfies the 006 engineering acceptance boundary only.
