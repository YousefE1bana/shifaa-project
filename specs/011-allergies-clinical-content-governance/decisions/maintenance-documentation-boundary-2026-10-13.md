# Maintenance documentation boundary

Date: 2026-10-13. Scope: the authorized artifact finalization and onboarding
maintenance PR; no F012 lifecycle or new runtime approval.

The first hosted run on `e8ca49780e3d1d4b48600695fcc1993557195e59`
failed quality and Supabase contract admission because changes to the installation
checklist and roadmap conflicted with the immutable
[documentation successor v1](documentation-successor-v1.json). The other four
checks passed. These failures remain historical; they are not erased or waived.

The maintenance correction preserves both approved inputs byte-for-byte from
main `e41abb4e008242f447dc7ba643ada0d3f712a5a7`:

| Input                                               | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/TEAM-INSTALLATION-CHECKLIST.md`               | `84b99da5826547f584763adc1a472c1a18029960362fb1870aa1c5489359363c` |
| `docs/governance/SHIFAA-Remaining-Specs-Roadmap.md` | `3e01011f8f916535bef267845266bc5c3a3a7b1652b39afa3501dda6c9452757` |

The corrected onboarding content is retained in
[TEAM-ONBOARDING-DRAFT.md](../../../docs/TEAM-ONBOARDING-DRAFT.md).
AGENTS links to that draft and enforces the additive
[Feature Artifact Finalization Gate](../../../docs/governance/SHIFAA-Feature-Artifact-Finalization-Gate.md),
also wired into the closeout workflow and templates. The five-line roadmap
addition is omitted because the same obligation is enforceable through AGENTS
without altering a pinned input. No requirement ownership changes.

No verifier, generated contract, approval manifest, physical proof, or existing
clinical acceptance record is modified. No hash allowlist is broadened. Current
required checks must pass on the corrected PR head before Yousef squash-merges.
The [accepted preservation-loss disposition](artifact-finalization-policy-2026-10-13.md)
remains closed; it does not waive this separate integration check.
