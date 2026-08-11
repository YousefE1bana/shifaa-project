# Administrative four-eyes checkpoint

Result: PASS (seeded-synthetic)

The exact five roles were tested without inheritance. Only `super_admin` could list/propose/decide the 003 grant and revocation operations. The active database seed contains the four already-shipped identity-review actions plus ten 003 actions; later-feature and forbidden operations remain unseeded.

Grant flow: proposer `...0011`, decider `...0012`, target `...0013`. Proposal alone remained pending. Proposer and target decisions denied. Independent decision activated the grant. Same-key replay produced one effect; changed-body replay and stale version denied.

Revocation flow used a separate pending request. Its proposer could not decide. An independent actor approved it, after which the grant changed to revoked. Direct SQL revocation before an approved request was rejected by the database trigger. API, real PostgreSQL, and forced-RLS tests all passed.
