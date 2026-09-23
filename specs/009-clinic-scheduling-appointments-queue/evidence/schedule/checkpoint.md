# Feature 009 — Checkpoint I clinic schedule, delay, and absence

Feature: 009-clinic-scheduling-appointments-queue. This is **synthetic graduation engineering** evidence. Production approval: not granted. Work began from commit a177d995a1063ceb983e279002c155d9de9b7bab and covers only T068–T071. T072 and later tasks remain outside this checkpoint.

## Independent review and corrected findings

The root agent independently reviewed the clinic schedule route, rendered tests, generated-client transport, real API/PostgreSQL journey, SQL authorization boundary, and exact task scope. Review corrected form civil-time serialization to the accepted API time representation, scoped terminal retirement to the selected schedule, restored keyboard focus through confirmation and result states, raised the schedule-mode radio targets to at least 44 CSS pixels, and separated deterministic HTTP 400/concealed 404 rejections from uncertain network or server failures. A corrected request uses a new idempotency key; an uncertain retry reuses its original request, key, response verifier, and result projection.

The real database test exposed an accepted additional-availability interval that overlapped effective base availability, contrary to the Feature 009 schedule contract. A forward-only corrective migration now rejects added intervals intersecting generated base slots or active blocked/absence intervals. The committed Feature 009 migration remains unchanged. The serial test checks base, blocked, and absence rejections with no exception row or schedule-version change. Existing same-type exclusion still governs added-added overlap.

The older OPEN-UX-001 design-decision copy describes delay/absence as ordinary exception choices. The clarified spec and frozen operation contract assign ordinary create only blocked/added; delay and absence have dedicated operations. The route follows the clarified contract. This documentation discrepancy is recorded here rather than implemented as an extra operation.

## Independently demonstrable behavior

The clinic /schedule route provides bounded weekly civil-time windows, IANA timezone, inclusive validity dates, slot duration, fee in minor units with server-owned EGP, and active/paused/terminal-retired status. The UI explains DST gaps and earlier-offset ambiguity, half-open exception boundaries, overlap rejection, and delay as a non-availability overlay. Blocked and added are the only ordinary exception choices. Retirement and absence require explicit confirmation with selected scope; absence's exact affected and removed counts appear only after the server response. Delay and absence results do not claim notification delivery or reserved replacement slots.

The exact 18-operation contract has no schedule read or absence preview. Staff enter an existing schedule ID and current version from a trusted source. The UI labels displayed schedule, exception, and delay data as the last mutation response, not as a fetched current projection. It exposes stale, offline, permission, validation, conflict, deterministic rejection, recoverable uncertainty, terminal response mismatch, submitting, empty, and success states without offline mutation storage.

The serial synthetic journey uses the real Fastify API and an isolated PostgreSQL database. It exercises create/update/exception, half-open boundary acceptance and positive overlap rejection, Cairo spring-forward slots with two valid unique starts, delay same-key replay and distinct supersession without appointment-time or queue-order mutation, exact absence affected IDs and queue removal, replacement suggestion without a hold and a later patient booking, unpublished-template notification ineligibility with production SMS disabled under OPEN-VENDOR-002, cross-scope denial, and both pre-delivery and post-commit disconnect/reconnect. The post-commit same-key replay creates no second version or outbox event.

## Executable evidence

- corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-schedule — PASS, 9/9 focused clinic tests.
- corepack pnpm exec playwright test --config tools/clinic-scheduling-schedule-playwright.config.ts — PASS, 2 rendered Chromium journeys covering ar-EG RTL and en-EG LTR, responsive widths, reason boundaries, focus, 44px targets, contrast, forced colors, reduced motion, mutation states, and corrected 400/404 handling.
- corepack pnpm --filter @shifaa/clinic typecheck — PASS.
- corepack pnpm test:clinic-scheduling:e2e -- schedule-delay-absence — PASS, 1/1 serial real API/PostgreSQL journey in one isolated database.
- corepack pnpm test:clinic-scheduling:db -- exception-constraints — PASS.

These checks are synthetic executable evidence. They are not a real staff sign-in, real patient delivery, screen-reader acceptance, 200% text-scale/400% zoom visual acceptance, or production data. Formal all-route UI acceptance and full repository verification remain later lifecycle work.

## Baseline and retained gates

Approved metadata remains source SHIFAA-F009-P0-SOURCE@1.0.0-candidate, manifest digest 3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c, 492 reference PNGs, 29237789 recorded bytes, eight route families, and locales ar-EG and en-EG. This checkpoint uses F009-P0-CLN-SCHEDULE-001 as structural authority and did not modify any approved reference PNG. The metadata-only verifier does not establish fresh PNG byte integrity. OPEN-UX-002, OPEN-TECH-003, OPEN-PRODUCT-001, OPEN-VENDOR-002, and applicable legal gates remain open.
