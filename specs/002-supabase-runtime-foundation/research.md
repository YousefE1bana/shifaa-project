# Research: Supabase Runtime Foundation

## Settled decisions

1. **CLI:** exact root dev dependency `supabase@2.113.0`. Official docs recommend a project dependency and committed `supabase/`; the live npm registry supplied the pin on 2026-08-11.
2. **Topology:** Docker local stack for development/CI. Supabase explicitly states it is not hardened, has default credentials/no TLS/no rate limiting, and must not be internet-exposed. Production topology is not selected here.
3. **Auth:** GoTrue email/password plus email OTP; Mailpit is the only local delivery sink. JWTs are verified server-side from local JWKS with issuer/audience/time checks.
4. **Data:** PostgreSQL remains authoritative. A bounded `postgres` pool executes short transactions as a non-owner role. Actor context is transaction-local and forced RLS remains defense-in-depth.
5. **Storage:** one private `identity-evidence` bucket; random object keys, quarantine metadata, no public URL.
6. **Client boundary:** applications call only Core API. Supabase browser clients and generated database types are deliberately absent from apps.
7. **Realtime:** not enabled for domain clients because no current user story consumes it and it would weaken the API boundary.

## Rejected alternatives

- Managed Supabase: conflicts with the Egypt-resident production default and is unnecessary for local MVP execution.
- Keep in-memory runtime: fails restart persistence and does not exercise the approved architecture.
- Direct PostgREST from apps: contradicts Master/Constitution.
- Fixed fabricated OTP: would not verify the real GoTrue challenge path.
- Superuser/service-role domain queries: bypass least privilege/RLS.
