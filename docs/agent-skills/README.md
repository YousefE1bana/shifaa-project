# SHIFAA shared agent skills

`.agents/skills/` is the canonical checked-in root for SHIFAA-owned skills, intentionally SHIFAA-customized third-party skills, project-required SpecKit lifecycle skills, and the Product Owner-approved shared tooling pack. `.kimi-code/skills/` remains reserved for the Kimi-specific SpecKit mirror. The checked-in layout uses ordinary files, not symlinks, so it is stable on Windows.

Unmodified generic third-party skills still default to user-global scope. The checked-in shared tooling pack is the narrow exception explicitly approved on 2026-09-01 so the same reviewed skills are available to every SHIFAA agent. A third-party skill can otherwise remain project-tracked only when it contains a SHIFAA policy overlay, a pinned local reference replacing network behavior, an intentionally reduced executable surface, or another reviewed project-specific change.

## Authority and execution

SHIFAA-native skills govern every use of external guidance:

- `shifaa-project-guardrails` applies to implementation, architecture, API, data, auth, RLS, security, healthcare, compliance, testing, debugging, and review.
- `shifaa-ui-governor` applies before or alongside every UI, UX, frontend, mobile, accessibility, visual, motion, or design skill.

The authority order remains Egyptian law/regulator instruction, Constitution, PRD, Master Plan, supporting contracts, approved feature spec, then implementation. External skills are advisory dependencies and cannot change that order. SpecKit remains the only project lifecycle.

## Tracked shared pack

```text
.agents/skills/
|- shifaa-project-guardrails/       SHIFAA-native governance
|- shifaa-ui-governor/              SHIFAA-native UI governance
|- frontend-design/                 intentional UI execution
|- ux-designer/                     UX, accessibility, forms, navigation, review
|- web-design-guidelines/           pinned interface/accessibility review rules
|- vercel-react-best-practices/     React and Next.js performance
|- supabase/                         Supabase implementation and diagnosis
|- supabase-postgres-best-practices/ PostgreSQL and RLS guidance
|- expo-native-ui/                  current official native UI skill
|- expo-data-fetching/              current official Expo networking skill
|- systematic-debugging/            evidence-led diagnosis
|- verification-before-completion/  fresh verification before claims
|- using-git-worktrees/             isolated workspace discipline
|- clean-code-guard/                second-pass production/tooling review
|- test-guard/                      second-pass test and verification review
|- docs-guard/                      second-pass documentation review
|- codex-delegate/                  bounded OpenAI Codex relay
|- kimi-delegate/                   bounded Kimi Code relay
|- claude-delegate/                 bounded Claude Code relay
|- opencode-delegate/               bounded OpenCode relay
|- agy-delegate/                    bounded Google Antigravity relay
`- speckit-*/                        existing lifecycle skills, preserved
```

The exact reviewed commits, upstream paths, licenses, local tree digests, allowed surfaces, prohibitions, and local hardening changes are in `skills-lock.json`.

## Product Owner-approved shared tooling pack

The project update manifest at `/skills-lock.json` tracks 23 additional source-backed skills from `amElnagdy/delegate-skills`, `amElnagdy/review-skills`, `anthropics/skills`, `mattpocock/skills`, and `pbakaus/impeccable`. They cover review and delegation setup, office/PDF artifacts, MCP and skill authoring, design assets, implementation planning, and bounded PR babysitting. The governance lock records their exact update hashes, upstream paths, source HEADs, normalized tree digests, and retained executable inventories.

Executable helpers in this shared pack are retained for byte-for-byte integrity and provenance, but they are **not** approved execution exceptions. The only approved project-side third-party executables remain the five reviewed delegate `relay.mjs` files. A new or changed executable in a managed skill causes the updater and integrity verifier to stop for inspection.

## Supply-chain audit outcome

The 19 tracked external skills were reviewed at exact Git commits on 2026-08-13. Every one contains an intentional SHIFAA modification recorded in `skills-lock.json`; none is an unmodified generic vendored copy. Their `SKILL.md` files, referenced resources, executable content, network/package behavior, license declarations, and workflow assumptions were inspected before copying. Tracked skills install no packages and have no hooks.

Third-party executable skill content is prohibited by default. The five audited `delegate-skills` `scripts/relay.mjs` files are the explicit exception. They use Node built-ins, make no network or credential calls themselves, invoke only their named CLI plus Git (and documented Windows process helpers where required), never commit, and are pinned by exact upstream commit and normalized tree digest. Each CLI process performs its own authentication/network activity. Any relay update requires a fresh source review and digest update. The executable examples found in `systematic-debugging` remain deliberately omitted.

The vendored copies include SHIFAA overlays. `frontend-design` and `ux-designer` are locally hardened at fixed contract decisions—including typography, tokens, target sizes, route states, notification/error behavior, offline critical writes, and motion—rather than relying on precedence text alone. The three guard skills distinguish objective defects from intentional SHIFAA choices and act as second-pass gates; they cannot redesign architecture or replace SpecKit. `web-design-guidelines` was changed from a moving network fetch to a pinned local snapshot of Vercel's reviewed rules. Expo feedback submission is explicitly prohibited without user authorization.

`npx skills` 1.5.23 was reviewed. Project refreshes use the explicit non-interactive `skills update --project --yes` form only inside a temporary `.worktrees/` checkout. The updater reconciles simple SHIFAA overlays, preserves reviewed license notices, rejects distributed-customization conflicts, and fails closed on new executable inventory or unrelated file changes.

## Delegation boundary

The five delegate skills are optional implementer relays, not a second lifecycle. Every brief must be self-contained, bounded, and subordinate to `shifaa-project-guardrails`, `shifaa-ui-governor` for UI work, the current SpecKit artifacts, and Issue acceptance criteria. Delegates may not change requirements, invent contracts, bypass `OPEN-*` gates, introduce PHI/secrets, or commit, push, merge, close Issues, or clean branches.

The parent agent owns the brief, diff review, appropriate guard review, repository verification, commit, push, and PR lifecycle. For migrations, RLS, auth, clinical safety, compliance, and API-contract work, delegate output is evidence to review—not proof of correctness.

## Delegate CLI status

This point-in-time native-Windows audit is recorded without credentials in `delegate-runtime-status.json`:

| Delegate | Installed | Auth/config                                          | Relay result                                               | Classification                                              | Remaining action                          |
| -------- | --------: | ---------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Codex    |   0.147.0 | Authenticated                                        | Completed, structured result, zero touched files           | `RUNTIME_VERIFIED`; Windows read-only shell launch degraded | None                                      |
| Kimi     |    0.34.0 | No provider/default model                            | Structured no-model failure, zero touched files            | `AUTH_REQUIRED`                                             | `kimi login`                              |
| Claude   |   2.1.226 | Not logged in                                        | Structured login failure, zero touched files               | `AUTH_REQUIRED`, `WINDOWS_UNVERIFIED`                       | `claude auth login`                       |
| OpenCode |   1.18.14 | Three providers detected; no approved model selected | Static only; no result artifact                            | `MODEL_REQUIRED`                                            | Pass an approved `--model provider/model` |
| AGY      |    1.1.12 | Configured                                           | Completed read-only, structured result, zero touched files | `RUNTIME_VERIFIED`                                          | None                                      |

Smoke runs used disposable Git repositories outside SHIFAA. `STATIC_VERIFIED` means source/help/preconditions only; `RUNTIME_VERIFIED` requires an actual relay result; `AUTH_REQUIRED` and `MODEL_REQUIRED` identify the exact runtime gate; `WINDOWS_UNVERIFIED` preserves an upstream/platform caveat; `UNAVAILABLE` is reserved for a missing CLI.

## Restricted and optional skills not installed

- `design-taste-frontend` (`Leonxlnx/taste-skill`) is restricted. Current v2 is experimental and explicitly targets landing pages, portfolios, and redesigns—not dashboards, data tables, or multi-step product UI. It must not drive Clinic, Pharmacy, Hospital, Lab, or Admin workflows. It may be reconsidered only for a suitable non-safety surface under `shifaa-ui-governor`.
- `transitions-dev` (`Jakubantalik/transitions.dev`) is restricted. Its broad auto-trigger and motion-token catalog conflict with SHIFAA's narrower timings and zero-motion safety surfaces. Reconsider only a named patient-facing micro-interaction after contract review, with reduced motion and no emergency, prescribing, critical-result, approval, or finance-decision use.
- `app-store-screenshots` is `release/marketing optional`. Its complete Next.js editor template and dependencies do not belong in normal feature implementation.
- OpenAI Codex Security `security-diff-scan` is an optional agent-provided Codex capability. The official plugin is proprietary and relies on Codex-specific tools and sibling workflows, so it is not copied into this cross-agent project pack.

## Rejected from the default pack

- Superpowers `requesting-code-review` mandates a subagent-driven workflow and assumes its own task cadence. Repository PR review and SpecKit evidence remain authoritative.
- Superpowers `using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, and related lifecycle skills are excluded because SHIFAA already uses `specify -> clarify -> plan -> tasks -> implement -> analyze`.
- Unrelated Expo skills are not preinstalled. A newer upstream pattern is not permission to migrate the pinned application architecture.

## Updates

Treat every update as a dependency change:

1. Classify the skill before updating it. Generic third-party skills default to global scope unless they are already in the explicitly approved shared tooling manifest.
2. For any tracked skill, work on a tooling branch and inspect the latest upstream commit without running bundled scripts.
3. Re-review the skill, every copied reference or executable, hooks, network/data behavior, package changes, Git behavior, workflow conflicts, and license.
4. Copy only the required files as ordinary project files; keep or strengthen the SHIFAA overlay and notices.
5. Update the exact commit, paths, review date, conflicts, and local tree digest in `skills-lock.json`.
6. Validate unique frontmatter names, confirm both SpecKit implementations still exist, review the diff, scan for secrets/PHI, and run `pnpm verify`.
7. Integrate only through the PR sequence in `AGENTS.md`.

Windows users can double-click `UPDATE-SHIFAA-SKILLS.bat`. It launches `tools/update-shifaa-skills.ps1`, verifies GitHub authentication, updates only the project-scope manifest in an isolated `.worktrees/` checkout, runs integrity and repository verification, opens a PR, waits for required checks, and uses an exact-head squash-merge guard. A failed update preserves its branch and worktree for inspection. Run `powershell -NoProfile -File tools/update-shifaa-skills.ps1 -SelfTest` to exercise the safety logic without creating a real PR.

Skill discovery is evaluated at agent startup. `npx skills` 1.5.23 resolves the checked-in folders for both Codex and Kimi. Restart or reload agents after changing this directory; the integrity check validates all 55 unique shared skills, both SpecKit implementations, the curated tree locks, and the managed update manifest.
