# T003 isolated synthetic run and repair

**Executed result** FAIL, 2026-11-21. Yousef Osama authorized one isolated execution of harness `e026bdbcda22d4f06ce102fe2081d5e0498274b3d65576b4e861187af3a907f9` with manifest `0b8809fde28c47900f068d22a7ed4d3d107175f7e747b297c10f56716fd3d5aa` in “SHIFAA — Product Owner Engineering Decisions”. Codex transcribed that decision for the container admission record. All ten file hashes and sizes matched the reviewed Git blobs at `b13f2d48c462afcd57deccc61312546bd517731f` and the candidate checkout `395203a2149c78241541eb449ad64522f48cedf6`. The [earlier engineering input acceptance](mechanism-input-acceptance.json) is preserved as history.

The inspected disposable container used Node 24.22.1 as UID/GID 1000, with networking disabled, a read-only filesystem, a single read-only bind of the 13-file synthetic snapshot, no Docker socket, no retained data mounts and no processes shared with the host. The image digest was `sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea`. The container started once at 18:38:25 UTC and exited 1. The 12 pre-existing containers and 4 volumes matched the saved inventory after removal of that one disposable container.

The first 102 assertions passed. Assertion 103, `SYNTHETIC_CASE_0002/case-substitution`, expected denial but returned eligible. The remaining 210 assertions did not execute. The vector hard-coded `SYNTHETIC_CASE_0002` as the replacement. On carrier 0002, it wrote the same evidence case ID already in the valid control. Static inspection identified the no-op and confirmed the evaluator already checks the evidence case against the probe case.

The repaired vector chooses a different known evidence case for every carrier and preserves the probe's case ID. Six static and hard-disabled entry tests passed, including a regression check that every named denial differs from its eligible control on every carrier. The behavioral suite still contains 313 assertions. It awaits new exact-byte admission against the [repaired candidate](t003-candidate/review.md). The production entry and five immutable inputs retain their original bytes. Cross-account identity resolution remains a separate native test obligation.

## Raw evidence

The original snapshot, admission, launch journal, Docker configuration and terminal state, and raw output are retained under `.tmp/engineering-decisions-2026-11-21/` in the SHIFAA engineering workspace. The raw stderr begins with the exact harness/manifest hashes and attempted count and includes the assertion diff and stack. Stdout was empty.

| Saved file                     | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `t003-stderr.log`              | `ff1ddbad1d5b763262eb78d6febe2a23dc57393f5824cda22ed4690d0be11ab1` |
| `t003-stdout.json`             | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `t003-container-admitted.json` | `15410b9214e7619a990066df73e9c8c3eba9bd5ddb787b159fdd64486f39f624` |
| `t003-container-finished.json` | `24394cf135659f26873d1acdee4b98bc591ca1c813f5a4335026864750df62f4` |
| `t003-resource-before.json`    | `3c49c21253e5cff23c01723fcf87232705c4f171345e494f5923be20b7855d92` |
| `t003-resource-after.json`     | `692d15f6716c1c3e155f65892d93e167a40f2913507bb50dd49117542a3d408c` |
