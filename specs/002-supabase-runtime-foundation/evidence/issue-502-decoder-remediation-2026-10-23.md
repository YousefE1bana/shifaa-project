# Issue #502: decoder security correction

Additive continuation of the [tooling repair record](issue-502-remediation-2026-10-22.md),
prepared across 22–23 October 2026. Earlier receipts and tested source identities
remain historical. This correction supplies no F012, clinical, legal, production
or human acceptance authorization. The branch remains unpublished.

## Cause and correction

The installed `expo-router@57.0.15` depends on CommonJS `query-string@7.1.3`,
which requires vulnerable `decode-uri-component@0.2.2`. The
[reviewed advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
identifies 0.5.0 as patched. Registry metadata, package integrity, MIT license,
exports and the actual caller were inspected before installation.

The published 0.5.0 is ESM with a default function export. A blind version
override would leave the CommonJS caller invoking a module namespace as a
function. Use the exact parent override in `pnpm-workspace.yaml`, plus the
supported pnpm `patchedDependencies` mechanism:
[query-string patch](../../../patches/query-string@7.1.3.patch).
It selects the decoder's default export and preserves the previous caller's
`+` to space behavior, including fragment decoding. The decoder algorithm itself
is the published upstream security fix, not a project rewrite.

This patch is supported only within the project's pinned Node 24.22.1 and
validated Expo/Metro combination. It is not a claim that upstream query-string's
older Node support range now supports synchronous ESM loading. Retire the patch
and scoped override when Expo Router supplies a compatible fixed decoder path;
revalidate URL semantics before removal. Package licenses remain in installed
upstream packages. No new package, audit exclusion or threshold change is added.

## Reproduction and required validation

The [existing Expo checker](../../../tools/verify-expo-dependencies.mjs) now
resolves the actual Expo Router consumer and checks Arabic text, literal/encoded
plus signs, duplicate parameters, empty/null values, malformed UTF-8 and an Expo
callback URL. Malformed `%FF` input repeated 2,048 times runs in a child process
bounded to five seconds so a regression cannot hang the parent checker.

Before the dependency correction, the same malformed-input check hit that
five-second bound and exited 1; after the correction it completed and the checker
exited 0. Those development executions had an explicitly dirty source tree;
exact receipts and later committed-source validation are retained privately.
Native/platform exports establish build compatibility only, not physical-device,
screen-reader or live Arabic/English acceptance.

The unrestricted audit decreased from three findings to two high findings, with
zero moderate or critical findings. It still exits 1. The
[node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still have
no published patched versions in the inspected registry. Forge's
[proposed correction](https://github.com/digitalbazaar/forge/pull/1152) remains
unmerged; it is not an accepted release. No unreviewed crypto/AST fork or false
clean-audit result is introduced to bypass this blocker.

## Preservation and integration

Full logs and exit-code receipts use the existing private directory
`D:\ECU\GP-STUFF\SHIFAA-Issue-502-Remediation-20261022`, with `continue-`
prefixes and an additive integrity receipt. Original sealed files remain
unchanged. The original 42-command chain is not rerun while its security gate
fails. Supabase services, Docker resources, Firewall rules, protected evidence,
backups, active-feature pointers and other worktrees are unchanged.

Required security corrections, safe aggregate-verification disposition,
PR-specific human acceptance, fresh current-head CI, human squash merge and
finalization remain pending. The previous publication exceptions do not transfer.
Issues #493 and #502 remain OPEN; no F012 lifecycle or team onboarding begins.
