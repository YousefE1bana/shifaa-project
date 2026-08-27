# T030 factor event-contract reconciliation

**Authority:** Yousef Osama, Product Owner, 2026-08-27 resumption decision.

`identity.factor.changed` carries exactly `recipientPersonId`, `support_action`, and `action_time`.
The Core API derives `recipientPersonId` from the already verified native subject-to-person mapping and
writes the factor-change audit and outbox rows in one PostgreSQL transaction. The factor identifier
remains only the outbox aggregate ID.

At claim time, the existing SHIFAA identity/notification boundary resolves that person to the current
active `identity.people` address and gives the local-synthetic adapter only an address digest alias.
Inactive, missing, or addressless people are rejected. The worker does not read Auth, client headers,
factor metadata, or Emergency Contact data.

The payload, audit, notification, delivery attempt, receipt, and logs contain no address, OTP/TOTP,
factor secret, QR payload, credential, access/refresh token, recovery proof, or PHI. Existing consent,
template/provider, aggregate ordering, retry, deduplication, and DLQ gates remain unchanged.

This reconciliation adds no REST operation, endpoint, role, relationship, FR/NFR, or Feature 008 scope.
Feature 007 remains four FRs and exactly eight operations.
