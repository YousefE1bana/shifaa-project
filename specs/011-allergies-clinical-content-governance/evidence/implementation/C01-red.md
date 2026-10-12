# C01 RED evidence

Date: 2026-10-06 (Africa/Cairo). Only C01 tooling/readiness work authorized.

After restoring the pinned CLI, T001 wrote `tools/verify-feature-011-scope.test.mjs`. Before T002 created the verifier, `node --test tools/verify-feature-011-scope.test.mjs` exited **1**: **23 tests, 0 pass, 23 fail**, with the explicit assertion `C01 read-only scope verification is not yet implemented`. Tests loaded and ran; there was no syntax, import-resolution or runtime-startup failure. The intended missing behavior was the C01 read-only verifier, checked before its implementation.

The suite tests exact frozen inventories, approval and hash bindings, retained gates/exclusions, catalog reconciliation, assertion sequencing and tooling mismatch rejection. Its positive fixture deliberately omits all later generated Feature 011 contracts, clients, physical migrations and runtime evidence: C01 may pass existing readiness without these outputs, but must report parity pending and deny affected-consumer readiness.

Tests use isolated copied-baseline directories under `artifacts/feature-011/c01-fixtures/`, with cleanup restricted to their exact generated paths. Observed version/daemon inputs in unit cases are injected only at the external tooling boundary; real installed tooling is checked separately by the CLI and recorded in [scope-gates](scope-gates.md). No SQL test harness, shared database reset, migration or real-runtime acceptance test belongs to this C01 verifier; physical isolation and non-owner proof remain C03 obligations.

During T002 development, whitespace/identifier parsing and copied-fixture authority dependencies were corrected before acceptance. Two declared/locked Supabase pin-drift cases were added. Final focused GREEN is **25/25, zero skipped**, recorded in scope-gates. Intermediate parser/fixture failures were development defects, not additional baseline blockers or accepted evidence.
