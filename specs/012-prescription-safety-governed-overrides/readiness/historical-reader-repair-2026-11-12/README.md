# PR #509 historical-reader repair

Date: 2026-11-12. Authority: Yousef Osama's direct instruction, “Fix PR #509
Historical Reader Compatibility.” Source head:
`6fb31447484e5d21c9f20f2734808bd6eabf6824`.

The JavaScript and Python readers admit only the exact successors in
[successor-binding-v1.json](successor-binding-v1.json), SHA-256
`8b6500c6571bf2c0d75373483452e0942be0c1e1104ca66de05dc35689bfc8b1`.
Both implementations pin that digest, check each complete successor, its exact
append boundary, prefix and appendix digests, and the predecessor Git blob.
They recheck live files and binding bytes on every read. Only immutable Git
objects are cached by the JavaScript reader.

The original tooling ledger remains unchanged, SHA-256
`e38049b11787c49e01d0c6cfe0ef3cb3f825fc68f207be5bb224eebc4567fb07`.
All four original historical projections retain their original Git bytes. In
particular, the Master successor is first verified against its 103,596-byte
predecessor, then projected through the original ledger to its original
96,882-byte F011 view. No historical acceptance digest is replaced.

## Exact scope

| Existing approved appendix | Predecessor bytes | Successor bytes |
| -------------------------- | ----------------: | --------------: |
| Master                     |            103596 |          106335 |
| API Catalog                |            100106 |          102837 |
| Data/RLS                   |             86509 |           89099 |
| PRD                        |            100550 |          103029 |
| UI Contract                |             28266 |           30978 |

Fixing only Master exposed the next independently sealed API Catalog input;
the F011 protocol also verifies the other approved normative inputs. The bounded
binding therefore covers the five existing appendices from the approved payload.
This repair changes none of those documents. It permits no arbitrary appendix,
contract activation, runtime permission or F012 lifecycle advancement.

## Verification and limits

[verification.json](verification.json) records the exact repair source manifest,
executed commands, results and preservation checks. Local tests cover exact
projection, the legacy path without a successor, prefix/appendix edits,
truncation, arbitrary appends, tampered bindings and drift after a successful
cached read. Two existing legacy fixtures now restore their original exact
inputs; their acceptance assertions are unchanged.

The supplemental documentation-authority checker still fails on separate agent
configuration, historical protected-tooling bindings and heading-anchor findings.
Its complete sanitized diagnostic remains local; its error codes and counts are
recorded in the verification result. It is not reported PASS or silently repaired.

No local aggregate `pnpm verify`, database reset, Supabase operation, migration,
Docker operation or runtime security test was executed. Required current-head
GitHub CI remains mandatory; local historical verification is not runtime
acceptance. Approved F012 content, prior evidence, original ledger and both
feature pointers remain unchanged.
