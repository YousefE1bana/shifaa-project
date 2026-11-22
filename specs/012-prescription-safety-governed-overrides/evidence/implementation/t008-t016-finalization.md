# F012 T008 and T016 engineering finalization

**Decision** PASS for task artifact organization and preservation, 2026-11-21. The SHIFAA engineering workspace is the custodian. This closes the evidence review for the bounded synthetic test tasks [#519](https://github.com/YousefE1bana/shifaa-project/issues/519) and [#527](https://github.com/YousefE1bana/shifaa-project/issues/527). The task-level result carries no product runtime or clinical acceptance. F012 #493 and its later writer, coordinator, native authority and clinical gates remain open.

## Integrated evidence

- **T008.** [PR #606](https://github.com/YousefE1bana/shifaa-project/pull/606) integrated reviewed head `a63b78e9f1d40906602b2c2b8bd3863a2513f79e` as `81de462737a347a8546a1a69575e95d152e404c2`. The [required checks](https://github.com/YousefE1bana/shifaa-project/actions/runs/44911901854) and [fresh pull-request metadata](https://github.com/YousefE1bana/shifaa-project/actions/runs/44911910386) passed. The original SQL fixture hash matches [the task receipt](t008.json) at the squash. It demonstrated expected missing-schema SQLSTATE 42P01 on sealed F011, and empty-to-first insertion, current set sensitivity to clock equality, constraint denials and rollback on its candidate upgrade. The original fixture remains recoverable as blob `d88718d398a559b8c677e90a9b1aa49166ffc5d3`. [T009's finalization](t009-finalization.md) records the successor fixture and the later resolution of the historical double-advancement observation.
- **T016.** [PR #605](https://github.com/YousefE1bana/shifaa-project/pull/605) integrated reviewed head `5ca3709bcf31ea48547e3867f445e06a83990166` as `b411d43de4e5f2292205814d075e89d86a4a0a6b`. The [required checks](https://github.com/YousefE1bana/shifaa-project/actions/runs/44912809080) and [fresh pull-request metadata](https://github.com/YousefE1bana/shifaa-project/actions/runs/44912809107) passed. The [task receipt](t016.json) binds the original fixture, 21/21 focused tests and PostgreSQL proof of atomic rollback, original-key replay and denial for body/action changes and losing authority. It exercised suppressed delivery of a committed response. The fixture remains byte-identical on current main. T009 independently repeated the T016 harness mode after resolving the shared harness integration.

GitHub merge identities and their ancestry on verified remote main `043e86b9d26100e4a101e3aa979fbde60e677961` were checked. The original tracked receipts and fixture digests were checked against their squash trees. The main ledger already recorded T008 and T016 as implemented. This record supplies their later preservation and closeout review.

## Retention and recovery

The original worktrees `.worktrees/f012-t008` and `.worktrees/f012-milestone-e` were checked at their exact PR heads. The task squash inventories cover eight Git path versions. There were no untracked paths or ignored files in the task artifact directories. Retained local development state and historical files stay at their original locations.

Paths in the table are both the original and current locations, relative to `D:/ECU/Gradution-Project`. The files were reopened as regular files and hashed on 2026-11-21. Their indexed scope is synthetic engineering evidence. Preserve workspace access restrictions on the raw records. Git blobs and saved files were checked in place. The recovery review used those preserved copies.

| Evidence                                                                                             | Bytes | SHA-256                                                            |
| ---------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| Original T008 RED capture at `.tmp/f012-foundation/t008-canonical-red.json`                          | 18742 | `4c730ce9ffd97f536c8c10f757f1aacd91fd7556be204716cd9f9fa321c9a2a4` |
| Original T008 upgrade capture at `.tmp/f012-foundation/t008-canonical-upgrade.json`                  | 88894 | `c4d722d849cceb643f998dd1ddc50632b883e8e6a292f65b3c63f22c2291b0ba` |
| T008 revalidation record at `.tmp/f012-recovery/t008-revalidation.json`                              |   163 | `5a238837ec62db0c5d2d236d405bdb74bcdf967b66dd897aae1b61e3e06dbb7e` |
| Original T016 SQL capture at `.tmp/f012-foundation/t016-final-sql.json`                              | 56114 | `b3a5ba8c4859373ef5fd32aeb529dafcddee556895b63ee42f51ee1bbfc3c4f1` |
| Original T016 focused log at `.tmp/f012-foundation/t016-resealed-vitest.log`                         |   250 | `d90984c1c5a368dbda892971890aede25a04d38baf59201e6f2d7517636a386b` |
| Exact-head T016 SQL revalidation at `.tmp/autonomous-delivery-2026-11-21/605-atomicity-5ca3709.json` | 56109 | `adc32b0537608439cf1acc6ea18a102c5be89752b41829e5bcc1707ca43cbb49` |
| Exact-head T016 route log at `.tmp/autonomous-delivery-2026-11-21/605-predecessor-route-5ca3709.log` |  9477 | `f59f51778fb5ad7576d9da5c709dbf80cb786a1c8df0805caaf549bfdfec6dfb` |

The local index `.tmp/engineering-decisions-2026-11-21/519-527-historical-evidence.json` records 23 earlier task verification and preparation files (533002 bytes) by source path and digest. Its SHA-256 is `c5a9eb5b3f3961f8148ef307984fe190db1178029a5237906a3e02eef90bfed1`. Original results, including intermediate failures and the limited scope of historical passes, remain available.

To recover exact integrated fixtures, inspect the respective squash with `git show <squash>:<path>` and compare with each task receipt. Reproduction uses Node 24.22.1 and the recorded pinned image and source revision. Follow the [safe verification procedure](../../../../docs/testing/SHIFAA-Safe-Verification.md). The historical T008 matrix uses the separately admitted source-fence RED and upgrade modes. T016 uses the independently admitted `--atomicity` mode and its two focused test suites.
