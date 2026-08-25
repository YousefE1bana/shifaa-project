<task>
Perform a final read-only verification of the amended Feature-007 plan set after the parent dispositions
in evidence/plan-review.md. Do not edit, approve, implement, commit, push, merge, or create Issues.
</task>

<authority>
Read the same canonical SHIFAA authorities and every Feature-007 spec/planning artifact, including the
current OpenAPI, data model, research, quickstart, plan, and plan-review disposition.
</authority>

<checks>
Confirm or challenge: exactly 8 operations; optional/discriminated native refresh; uniform recovery
case ID/token; TOTP/passkey rejection; current Auth session boundary; one deny-only workflow table;
worker RLS event allowlist; unconditional FK indexes; dual Supabase/Compose validation; generic schema
validation 400 vs semantic 422; standard Fastify DELETE JSON parsing test; decoy-only transient purge;
no unresolved CRITICAL/HIGH contradiction or scope leakage.
</checks>

<output_contract>
Findings first with severity and exact evidence. State whether any unresolved issue prevents
PLAN_APPROVED. AGY remains advisory.
</output_contract>
