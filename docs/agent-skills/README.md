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
`- speckit-*/                        existing lifecycle skills, preserved
```

The exact reviewed commits, upstream paths, licenses, local tree digests, allowed surfaces, prohibitions, and local hardening changes are in `skills-lock.json`.

## Supply-chain audit outcome

The 11 vendored external skills were reviewed at exact Git commits on 2026-08-13. Their `SKILL.md` files, referenced resources, executable content, network/package behavior, license declarations, and workflow assumptions were inspected before copying. No bundled third-party script is installed in the default pack. The only executable examples found in a selected upstream skill (`systematic-debugging`) were deliberately omitted. Vendored skills install no packages and have no hooks.

The vendored copies include short SHIFAA overlays. These overlays do not replace upstream guidance; they prevent generic advice from bypassing the Core API, forced RLS, pinned stack, UI Contract, SpecKit, privacy controls, or verification gates. `web-design-guidelines` was changed from a moving network fetch to a pinned local snapshot of Vercel's reviewed rules. Expo feedback submission is explicitly prohibited without user authorization.

`npx skills` 1.5.22 was reviewed. Its current `add` command defaults to project scope but can create agent-specific links unless `--copy` is used, and the public service documents anonymous telemetry. It was not used to bulk-install this pack. Exact reviewed sources were copied into the canonical shared directory to avoid global state, broad `--all` installs, and Windows symlink fragility.

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

Skill discovery is evaluated at agent startup. `npx skills` 1.5.22 resolved the checked-in folders for both Codex and Kimi, but the local Kimi 0.34.0 prompt could not start because no model/login is configured. Restart or reload Codex and Kimi after changing this directory; do not call Kimi model-time discovery verified until an authenticated session loads the skills.
