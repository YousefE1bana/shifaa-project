<task>
Act as the adversarial security and architecture reviewer for SHIFAA Feature 007 readiness only.
Review the proposed OPEN-SEC-001 decision below against the repository's frozen Feature-007 boundary,
current Supabase Auth/session primitives, and authoritative primary security guidance. Do not write or
edit any file. Do not approve the gate, alter requirements, propose Feature 008, or implement anything.

Repository baseline and authority:

- origin/main is ccd76c4875821beb246fa3b0abf32f225c54f6ae.
- Read AGENTS.md, docs/governance/SHIFAA-Remaining-Specs-Roadmap.md section 007,
  shifaa-prd.md FR-AUTH-002/005 and OPEN-SEC-001, SHIFAA-Implementation-Plan-MASTER.md,
  docs/architecture/SHIFAA-API-Catalog.md operations refreshSession/logout/beginMfaEnrollment/
  verifyMfaEnrollment/removeMfaFactor/startRecovery/completeRecovery, packages/auth,
  services/api/src/adapters/supabase-auth.ts, and supabase/config.toml.
- Exact 007 scope is FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002 and exactly the eight
  roadmap operations. Preserve Supabase Auth/session/factor primitives and do not invent shadow
  credential/session tables.
- This review covers OPEN-SEC-001 only. Production Valify/SMS remain excluded. OPEN-TEAM-001 and
  OPEN-LEGAL-006 remain independent blockers. No finding can close or approve a gate.

Observed current auth configuration:

- access JWT expiry 3600 seconds;
- refresh rotation enabled with Supabase's 10-second reuse interval;
- auth.sessions timebox and inactivity_timeout are commented/unset;
- TOTP enrollment and verification are disabled;
- current verifier accepts issuer/audience/ES256 and maps aal claim, but does not yet enforce session
  age, auth_time, or session_id presence.

Parent's proposed exact policy to attack:

1. Keep access JWT lifetime at 60 minutes because Supabase recommends the default and warns against
   very short lifetimes; sensitive requests additionally verify live auth.sessions membership so
   logout/recovery revocation is effective before JWT expiry.
2. Configure one project-wide refresh session policy compatible with Supabase primitives:
   inactivity timeout 60 minutes and absolute timebox 24 hours. Rotation remains on and the 10-second
   legitimate reuse interval remains unchanged. Any reuse outside Supabase's two documented benign
   exceptions terminates that whole session/refresh-token family. Explicit all-sessions logout,
   successful recovery, password change, or MFA reset revokes every pre-existing session for the user.
3. Patient routine access may continue at AAL1 within the session. Workforce/admin accounts must reach
   AAL2 before any workforce/admin data or action. AAL2 reauthentication overall timeout is 24 hours
   and inactivity timeout 60 minutes; high-risk actions (MFA enrollment verification, factor removal,
   credential recovery completion, role/grant governance, identity/guardianship decisions, DSR
   download/decision/fulfilment) require a fresh AAL2 authentication event no older than 5 minutes.
4. Offer TOTP and passkey/WebAuthn for AAL2; strongly prefer phishing-resistant passkey. Never treat
   phone OTP alone as workforce/admin AAL2. A factor is usable only after enrollment verification.
5. Removing a factor requires current AAL2 plus a fresh independent recovery verification. Never
   remove the last verified AAL2 factor from workforce/admin. Patient accounts that enabled MFA cannot
   be downgraded by recovery or factor removal; they must retain or replace a verified factor.
6. Recovery is non-oracular, rate-limited, single-use, short-lived, and always notifies the subject.
   It succeeds only with a still-enrolled factor or repeated identity re-proofing. Recovery with a
   lost factor yields a restricted enrollment-only session, not ordinary data access, until a new
   factor is verified. Completion revokes every old session before issuing the new restricted/normal
   session and never weakens an existing MFA requirement.
7. Web refresh token is HttpOnly, Secure, SameSite, narrowly scoped and protected by Origin/CSRF/fetch
   metadata checks. Native refresh token is stored only in OS secure storage; access tokens are kept
   in memory where practical. Tokens, factors, challenges, recovery handles, and secrets never enter
   URLs, logs, analytics, audit payloads, or ordinary storage.

Required attack dimensions:

- refresh idle and absolute lifetime tradeoffs for patient/workforce/admin;
- whether project-wide 60m/24h is enforceable with Supabase and whether JWT expiry creates grace;
- rotation/reuse concurrency, the 10-second exception, replay and whole-family revocation;
- logout current/all sessions, cross-device behavior, password/MFA/recovery events;
- reauthentication semantics, auth_time/session_id/aal checks, step-up and stale JWTs;
- MFA enrollment/removal, last-factor and factor-replacement races;
- recovery downgrade, lost-device, SIM-swap/OTP, account enumeration, notification and proofing cases;
- browser CSRF/cookie and native token storage threats;
- deterministic clock-boundary, concurrent replay, outage/fail-closed and negative tests;
- conflicts with repository authority or missing decisions that would make the proposal non-executable.

Use current authoritative primary sources only where external facts are necessary: NIST SP 800-63B-4,
IETF RFC 9700, OWASP Session Management guidance, and official Supabase Auth session/MFA documentation.
Separate repository facts, external facts, inferences, and recommendations. Do not fabricate approval.
</task>

<action_safety>
Read-only review. Do not edit files, run git-changing commands, commit, push, merge, create issues, or
contact people. Stay within Feature 007 and OPEN-SEC-001.
</action_safety>

<structured_output_contract>
Return findings first, ordered CRITICAL/HIGH/MEDIUM/LOW. For every finding include: challenged policy
item, concrete attack/failure, repository or authoritative evidence, and exact correction. Then list:
(1) points you agree with, (2) deterministic tests still required, (3) unresolved approval questions,
(4) source links used. Explicitly state that the parent owns acceptance/rejection and gate approval.
</structured_output_contract>
