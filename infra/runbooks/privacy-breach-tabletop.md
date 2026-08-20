# Synthetic privacy breach tabletop — feature 005

This is evidence tooling for `NFR-PRIV-003`, not an incident system or regulator submission. No real incident, regulator, subject, vendor, or external party is involved. `OPEN-LEGAL-007` and `OPEN-TEAM-001` remain open.

The fixture at `specs/005-privacy-dsr-notifications/evidence/breach-tabletop.json` records awareness, the exact +72-hour regulator target, a synthetic regulator-notified timestamp, the subject target three working days later, decisions, evidence, subject-notified fixture time, and closure.

Run `pnpm test:privacy:tabletop`. A pass requires:

- regulator target equals awareness plus exactly 72 hours;
- synthetic regulator notification is on or before that target;
- the subject target is three Monday–Friday working days after the regulator-notified fixture;
- decision, containment, subject, and closure timestamps are ordered;
- evidence digest and explicit no-real-incident disclaimer are present.

Do not reinterpret the Saturday/Sunday-only engineering calculator as final legal holiday advice. Formal legal validation remains gated by `OPEN-LEGAL-007`.
