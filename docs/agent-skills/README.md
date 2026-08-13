# SHIFAA shared agent skills

`.agents/skills/` is the canonical checked-in skill root shared by OpenAI Codex and Kimi Code CLI. `.kimi-code/skills/` remains unchanged for existing Kimi-specific SpecKit integrations. The checked-in layout uses ordinary files, not symlinks, so it is stable on Windows.

## Authority and execution

SHIFAA-native skills govern every use of external guidance:

- `shifaa-project-guardrails` applies to implementation, architecture, API, data, auth, RLS, security, healthcare, compliance, testing, debugging, and review.
- `shifaa-ui-governor` applies before or alongside every UI, UX, frontend, mobile, accessibility, visual, motion, or design skill.

The authority order remains Egyptian law/regulator instruction, Constitution, PRD, Master Plan, supporting contracts, approved feature spec, then implementation. External skills are advisory dependencies and cannot change that order. SpecKit remains the only project lifecycle.

## Default shared pack

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

## Supply-chain audit outcome

The 19 vendored external skills were reviewed at exact Git commits on 2026-08-13. Their `SKILL.md` files, referenced resources, executable content, network/package behavior, license declarations, and workflow assumptions were inspected before copying. Vendored skills install no packages and have no hooks.

Third-party executable skill content is prohibited by default. The five audited `delegate-skills` `scripts/relay.mjs` files are the explicit exception. They use Node built-ins, make no network or credential calls themselves, invoke only their named CLI plus Git (and documented Windows process helpers where required), never commit, and are pinned by exact upstream commit and normalized tree digest. Each CLI process performs its own authentication/network activity. Any relay update requires a fresh source review and digest update. The executable examples found in `systematic-debugging` remain deliberately omitted.

The vendored copies include SHIFAA overlays. `frontend-design` and `ux-designer` are locally hardened at fixed contract decisions—including typography, tokens, target sizes, route states, notification/error behavior, offline critical writes, and motion—rather than relying on precedence text alone. The three guard skills distinguish objective defects from intentional SHIFAA choices and act as second-pass gates; they cannot redesign architecture or replace SpecKit. `web-design-guidelines` was changed from a moving network fetch to a pinned local snapshot of Vercel's reviewed rules. Expo feedback submission is explicitly prohibited without user authorization.

`npx skills` 1.5.22 was reviewed. Its current `add` command defaults to project scope but can create agent-specific links unless `--copy` is used, and the public service documents anonymous telemetry. It was not used to bulk-install this pack. Exact reviewed sources were copied into the canonical shared directory to avoid global state, broad `--all` installs, and Windows symlink fragility.

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
- Anthropic `canvas-design` is `creative asset optional`, not product-interface authority.
- OpenAI Codex Security `security-diff-scan` is an optional agent-provided Codex capability. The official plugin is proprietary and relies on Codex-specific tools and sibling workflows, so it is not copied into this cross-agent project pack.

## Rejected from the default pack

- Anthropic `web-artifacts-builder` scaffolds a separate React 18/Vite/Tailwind/shadcn artifact environment and runs dependency-installing shell scripts; it conflicts with SHIFAA's production Next.js/Expo architecture.
- Superpowers `requesting-code-review` mandates a subagent-driven workflow and assumes its own task cadence. Repository PR review and SpecKit evidence remain authoritative.
- Superpowers `using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, and related lifecycle skills are excluded because SHIFAA already uses `specify -> clarify -> plan -> tasks -> implement -> analyze`.
- Unrelated Expo skills are not preinstalled. A newer upstream pattern is not permission to migrate the pinned application architecture.

## Updates

Treat every update as a dependency change:

1. Work on a feature/tooling branch and inspect the latest upstream commit without running bundled scripts.
2. Re-review the skill, every copied reference or executable, hooks, network/data behavior, package changes, Git behavior, workflow conflicts, and license.
3. Copy only the required files as ordinary project files; keep or strengthen the SHIFAA overlay and notices.
4. Update the exact commit, paths, review date, conflicts, and local tree digest in `skills-lock.json`.
5. Validate unique frontmatter names, confirm both SpecKit implementations still exist, review the diff, scan for secrets/PHI, and run `pnpm verify`.
6. Integrate only through the PR sequence in `AGENTS.md`.

Skill discovery is evaluated at agent startup. `npx skills` 1.5.22 resolved the checked-in folders for both Codex and Kimi, but the local Kimi 0.34.0 prompt could not start because no provider/default model is configured. Restart or reload Codex and Kimi after changing this directory; the newly vendored guards and delegates were reviewed directly in this session, not dynamically rediscovered.
