# Configuration and skills compatibility

Observation: 2026-10-16; preparation only. No personal/global configuration, Guardian, sandbox, approval, network/search preference or installed binary was changed.

## Installed runtime and supported settings

Windows package inspection reports Codex Desktop **26.1013.3656.0**. The running bundled backend reports **codex-cli 0.163.0-alpha.10.2**. This describes the installed Desktop backend; no experimental CLI was installed. CODEX_HOME was unset, so the personal default home applies. No user `profile` selection was present in the inspected user TOML. Project role files are config layers, not user profiles. Personal TOML was parsed read-only and its hash rechecked; its contents are not published here.

Public [OpenAI configuration reference](https://developers.openai.com/codex/config-reference/) documents agents.enabled, default_subagent_model, default_subagent_reasoning_effort and max_concurrent_threads_per_session plus role config_file resolution. The installed backend's `features list` recognizes `multi_agent_v2` as stable; public-reference absence of that exact key is not evidence it is unsupported. The installed backend, rather than settings copied from a different release, was used for candidate loading checks.

| Probe                                                                                                | Actual outcome and limit                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex --version`; `features list`, disposable CODEX_HOME                                            | Version and stable feature entry read successfully; no model request, install or session run.                                                                                                |
| `codex --strict-config features list`                                                                | Unsupported argument combination; not a TOML failure. Retried supported features command.                                                                                                    |
| `codex --strict-config doctor --json`, copied project config and five role layers in disposable home | config.load OK with successful TOML parse and multi_agent_v2 override. Overall doctor exit 1 reflects isolated authentication/environment readiness; not a successful authenticated session. |
| Deliberately unknown key in disposable copy                                                          | Doctor reports config.load warning/startup warning for ignored unknown key. Inspect warnings, not merely exit codes.                                                                         |
| `codex debug models --bundled`                                                                       | Bundle includes gpt-6-luna and gpt-6.1-sol with the chosen efforts. This does not prove account-specific availability or execute a paid request.                                             |

Each of the five candidate role TOMLs was also copied separately into a disposable home and loaded by strict doctor: all five config.load checks were OK, with no configuration warnings. Each overall doctor still exited1 for isolated environment/authentication readiness. Repository layer validity is established. A copied-home doctor does not reveal every live Desktop session/experiment override or prove the final full effective session configuration. No active experiment/security override was changed.

## Candidate five-role configuration

| Role        | Model                         | Effort        | Boundary                                                      |
| ----------- | ----------------------------- | ------------- | ------------------------------------------------------------- |
| Root        | User-selected; no project pin | User-selected | Lifecycle, scope, acceptance, evidence review and integration |
| explorer    | gpt-6-luna                    | low           | Bounded read-only evidence                                    |
| worker      | gpt-6-luna                    | medium        | Routine coding; escalate sensitive logic                      |
| deep-worker | gpt-6.1-sol                   | high          | RLS, authorization, transactions, difficult state machines    |
| tester      | gpt-6-luna                    | medium        | Execution/triage; no security sign-off                        |
| ui-worker   | gpt-6.1-sol                   | low           | Rendered judgment; no native-a11y acceptance claim            |

Routine/default effort changes from high to medium are candidate project choices, not altered personal model selection. Keep Root plus at most two children in both existing concurrency keys. This session rejected a second simultaneous child with an agent-thread limit error; a configured ceiling is not proof of actual capacity. Four concurrent children were not established as safe/available. Do not add a higher-capacity profile now. A later proposal needs backend/account capacity, machine measurements, independent ownership and serialized shared resources.

## Skills and loading

The four manifest-owned policies are under `.shifaa/skills/`. The sync copies these into ignored `.agents/skills/`; it preserves unrelated third-party skill directories. Official SpecKit integration is separate: `.specify/integration.json` is pinned **1.1.3**, custom workflow registry **2.3.0**. The project retains taskstoissues as an explicit workflow handoff despite upstream deprecation; no upgrade or removal is authorized.

The new isolated checkout has no local `.agents/skills/` runtime tree or feature pointer. The existing primary checkout's installed skills were available for reading; this is not proof that the new checkout's lifecycle integration is installed. No sync/install/update or lifecycle command was run to remedy that. Before future authorized use, verify actual discovered files in the assigned worktree and read them. Naming a skill in a brief is insufficient.

AGENTS/config hints now refer to the same authority index and require explicit loading. SHIFAA guardrails retain precedence; UI governor governs UI; overlays constrain SpecKit/external advice; second-pass guards never replace root acceptance. Default role-level memory/skills settings were preserved. No third-party assets or ignored local skills enter this package.
