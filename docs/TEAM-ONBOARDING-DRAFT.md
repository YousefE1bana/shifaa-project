# SHIFAA team onboarding draft

This maintained onboarding draft is separate from the historically approved
[installation checklist](TEAM-INSTALLATION-CHECKLIST.md), whose exact bytes
remain bound to F011 evidence. The draft does not renew that approval or prove
a fresh installation.

Audited **2026-10-03**, against local and remote main `670b1e0fe15c719b98179805f2628d1b478a55dd`.
Draft correction **2026-10-13**: the Spec Kit pin and local setup-package location
were checked against main `e41abb4e008242f447dc7ba643ada0d3f712a5a7`.

On this machine, open the preserved
[SHIFAA-SETUP-CENTER.html](../../GP-STUFF/SHIFAA-Repo-Hygiene/2026-10-13-8f6e24910fcd427ebe7912d99c885601/developer-setup/SHIFAA-Developer-Setup/SHIFAA-SETUP-CENTER.html)
for the Arabic/English interactive guide, search and saved progress. This local
GP-STUFF link is outside the repository; on another machine, use the HTML in the
complete portable package described below. Keep it beside the launcher and tools.
The preserved guide still shows the historical Spec Kit 1.0.13 pin; use this
checklist's [current Spec Kit installation](#install-the-pinned-spec-kit-cli-required)
for the 1.1.3 commands. The guide embeds
its CSS, JavaScript, Inter/IBM Plex Sans Arabic fonts and font licenses. It makes
no network request to render and never collects credentials.

This is developer onboarding maintenance, not the parked SHIFAA Control feature 025. Repository pins override external advice. All runtime examples are local
and synthetic. No AI subscription is required to build SHIFAA.

## Portable start and fixed project path

Extract the complete **SHIFAA-Developer-Setup.zip** to any local folder outside
the project destination (for example Downloads). Keep the extracted files together.
Open **SHIFAA-SETUP-CENTER.html**, select only your project drive letter, then
double-click **OPEN-SETUP-TERMINAL.bat**. The terminal remembers the portable
folder as `$shifaaSetupFolder`; all bootstrap/doctor examples use those portable
copies, including after cloning. If the launcher is unavailable, open Windows
PowerShell in the portable folder and run:

```powershell
$shifaaSetupFolder = (Get-Location).Path
```

The repository is always **<DRIVE>:\ECU\Gradution-Project**. The worktree root is
always **<DRIVE>:\ECU\Gradution-Project\.worktrees**, inside the repository.
Only the drive changes. CLI examples below use **D**; replace only that letter
when following this checklist. HTML command copies already use your selection.
Scripts prompt for the drive when `-DriveLetter` is omitted; they do not ask for
an arbitrary project path. `-Clone` reuses an existing verified SHIFAA checkout,
and refuses unrelated destinations. It never switches, pulls or resets it.

Sequence: machine foundation → first Core install → GitHub login/access and Git
identity → Clone (or existing checkout) → inspect main and clean state, then
pull --ff-only → rerun Core for pins/frozen dependencies → owned skills/SpecKit
integration → QA browser (AI optional) → local synthetic environment → Docker,
Compose PostgreSQL and Supabase initialization → application/live AR/EN checks
→ portable doctor with no FAIL → fresh `pnpm verify` exit 0 → attest READY.
An incomplete initial Core run can exit 1 because the doctor correctly reports
the still-missing repository/services. Resolve installation errors before cloning.

## Exact repository pins

| Tool                        | Pin     | Authority                                          |
| --------------------------- | ------- | -------------------------------------------------- |
| Node                        | 24.18.0 | .node-version / .nvmrc / package.json              |
| pnpm                        | 11.13.0 | packageManager / engines.pnpm                      |
| Spec Kit                    | 1.1.3   | .specify/integration.json                          |
| Supabase                    | 2.113.0 | package.json / pnpm-lock.yaml                      |
| Playwright                  | 1.63.0  | package.json / pnpm-lock.yaml                      |
| TypeScript                  | 7.0.2   | package.json / pnpm-lock.yaml                      |
| Vitest                      | 4.1.0   | package.json / pnpm-lock.yaml                      |
| Turbo                       | 2.10.9  | package.json / pnpm-lock.yaml                      |
| Prettier                    | 3.6.2   | package.json / pnpm-lock.yaml                      |
| Expo                        | 57.0.15 | apps/patient/package.json                          |
| PostgreSQL (Compose)        | 17.11   | infra/db/Dockerfile.postgis / supabase/config.toml |
| PostGIS                     | 3.5     | infra/db/Dockerfile.postgis / supabase/config.toml |
| PostgreSQL (Supabase major) | 17      | infra/db/Dockerfile.postgis / supabase/config.toml |
| agent-context               | 1.0.2   | .specify/extensions/agent-context/extension.yml    |

The patient package has its own TypeScript **6.0.3** pin, while the root catalog
uses **7.0.2**. Next.js staff apps use **16.3.0** / React **19.2.8**; Expo patient
uses **57.0.15** / React **19.2.3** / React Native **0.86.2**. These are local
workspace dependencies, never global prerequisites. Supabase pins PostgreSQL
major 17; its image patch comes from the CLI stack, not the Compose image.

## External version and source ledger

Versions below were observed on the audited host, with CLI help where applicable.
They are compatibility recommendations, **not repository pins** or proof of
a fresh Windows installation. Prefer current vendor-supported stable releases
for unpinned machine applications; retain existing supported versions.

| Tool            | Audited host version | Status      | Official source                                                                                        |
| --------------- | -------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| Git             | 2.55.0.windows.3     | Required    | [Vendor](https://git-scm.com/install/windows)                                                          |
| GitHub CLI      | 2.97.0               | Required    | [Vendor](https://cli.github.com/manual/gh_auth_login)                                                  |
| PowerShell      | 7.6.5                | Required    | [Vendor](https://learn.microsoft.com/en-us/powershell/scripting/install/install-powershell-on-windows) |
| WinGet          | 1.29.380             | Required    | [Vendor](https://learn.microsoft.com/en-us/windows/package-manager/winget/)                            |
| fnm             | 1.39.0               | Required    | [Vendor](https://github.com/Schniz/fnm)                                                                |
| Corepack        | 0.35.0               | Required    | [Vendor](https://github.com/nodejs/corepack)                                                           |
| uv              | 0.11.24              | Required    | [Vendor](https://docs.astral.sh/uv/getting-started/installation/)                                      |
| Docker client   | 29.7.2               | Required    | [Vendor](https://docs.docker.com/desktop/setup/install/windows-install/)                               |
| Docker Compose  | 5.5.0                | Required    | [Vendor](https://docs.docker.com/desktop/setup/install/windows-install/)                               |
| VS Code         | 1.136.0              | Recommended | [Vendor](https://code.visualstudio.com/docs/setup/windows)                                             |
| Codex CLI       | 0.159.2              | Optional    | [Vendor](https://learn.chatgpt.com/docs/codex/cli)                                                     |
| Kimi Code       | 0.34.0               | Optional    | [Vendor](https://moonshotai.github.io/kimi-code/en/guides/getting-started)                             |
| OpenCode v2     | 2.0.20               | Optional    | [Vendor](https://opencode.ai/v2/docs)                                                                  |
| Claude Code     | 2.1.257              | Optional    | [Vendor](https://code.claude.com/docs/en/setup)                                                        |
| Antigravity CLI | 1.2.14               | Optional    | [Vendor](https://www.antigravity.google/download)                                                      |
| Skills CLI      | 1.7.0                | Optional    | [Vendor](https://github.com/vercel-labs/skills)                                                        |

Windows PowerShell 5.1 is built in. Docker Desktop's application version was
not established: client 29.7.2 is not the desktop version. Edge/Chrome, Android
Studio, DBeaver, NVDA and AI desktop apps are unpinned; use the official supported
Windows release. Native SDK/JDK build matrices are not defined by the current
shared setup. The Python AI service is a placeholder, while SpecKit's implemented
Python/PyYAML helpers are required and isolated by uv.

## Manual installation journey

Run commands in PowerShell. Prefer a normal-user pwsh terminal; elevate only for
Windows features or a vendor installer that requests it. Reopen the terminal
after PATH changes and use the fnm environment hook in every terminal. Native
commands require an explicit exit-code check: stop when an install/check fails.
Copy-section is a convenience, not permission to run alternatives, destructive
commands or multiple long-running commands as one batch.

### System foundation

Start with a serviced Windows 11 x64 machine. Use a normal user terminal; elevate only when an installer or Windows feature requests it.

#### Windows, updates & virtualization (Required)

Install pending Windows Updates and reboot first. Choose Windows 11 x64 23H2/build 22631 or higher within Microsoft servicing support. Docker needs hardware virtualization and at least 8 GB RAM. For this monorepo plus both DB stacks, 16 GB RAM and 40 GB free SSD are engineering recommendations, not measured repository minimums. Enable virtualization in BIOS/UEFI if disabled.

Why: Docker runs Linux database containers.

Inspect Windows:

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture
Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory
Get-PSDrive -PSProvider FileSystem
```

Troubleshooting: Windows Server and ARM64 are outside this audited onboarding path. Windows 11 Home can run the Linux-container WSL backend; verify current vendor support for your edition.

Source: [Official documentation](https://docs.docker.com/desktop/setup/install/windows-install/).

#### PowerShell & WinGet (Required)

Windows PowerShell 5.1 comes with Windows and is used by existing repository scripts. Install PowerShell 7 separately: the dev launchers call pwsh. WinGet is supplied by Microsoft App Installer; update it in Microsoft Store if winget is missing. After an install, close and reopen the terminal. Use pwsh for the following journey unless a command explicitly calls powershell.exe.

Install and inspect:

```powershell
winget --version
winget install --exact --id Microsoft.PowerShell --source winget --accept-package-agreements --accept-source-agreements
pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
powershell.exe -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
```

Troubleshooting: If scripts are blocked, use -ExecutionPolicy Bypass for the reviewed script invocation only. Do not change machine-wide execution policy or overwrite a managed profile. A corporate device policy must be resolved with your IT administrator.

Source: [Official documentation](https://learn.microsoft.com/en-us/powershell/scripting/install/install-powershell-on-windows).

[Related official source](https://learn.microsoft.com/en-us/windows/package-manager/winget/).

#### WSL backend preparation (Required)

For Docker Desktop with WSL, verify WSL 2.1.5 or newer. If missing, run wsl --install from an elevated terminal, then reboot when requested; no Ubuntu coding environment is required by SHIFAA itself. Hyper-V is a vendor-supported alternative on compatible editions. Do not expose an unauthenticated Docker TCP daemon.

Why: Docker Desktop requires a Linux virtualization backend.

Inspect / install only when missing:

```powershell
wsl --version
# Elevated terminal ONLY if WSL is missing:
wsl --install
# Reboot if requested; then update:
wsl --update
```

Source: [Official documentation](https://docs.docker.com/desktop/setup/install/windows-install/).

### Developer applications

Install the shared essentials. An editor and extra desktop applications are recommendations or role additions.

#### Git for Windows & GitHub CLI (Required)

Install Git with Git Credential Manager enabled (standard installer option); Kimi also uses its bundled Git Bash. Keep existing author and credential settings until reviewed. GitHub CLI provides the documented account/device login and repository-access checks. Neither tool is version-pinned by SHIFAA.

Install:

```powershell
winget install --exact --id Git.Git --source winget --accept-package-agreements --accept-source-agreements
winget install --exact --id GitHub.cli --source winget --accept-package-agreements --accept-source-agreements
```

Verify:

```powershell
git --version
gh --version
git credential-manager --version
```

Source: [Official documentation](https://git-scm.com/install/windows).

[Related official source](https://cli.github.com/manual/gh_auth_login).

#### Docker Desktop (Required)

Install from the vendor or WinGet. Open Docker Desktop manually, complete its first-run terms/settings, select Linux containers and wait for the engine. A Docker Hub account is not a SHIFAA build requirement. Docker Desktop licensing depends on your organization; review the vendor terms. Reboot/logout if the installer requests it before continuing.

Install:

```powershell
winget install --exact --id Docker.DockerDesktop --source winget --accept-package-agreements --accept-source-agreements
```

Verify running engine:

```powershell
docker version
docker info --format "{{.OSType}}"
docker compose version
```

Troubleshooting: A working docker --version only confirms the client. Missing dockerDesktopLinuxEngine pipe means the engine is stopped or the wrong backend is selected. Open Docker Desktop and retry docker info; never remove volumes to repair installation.

Source: [Official documentation](https://docs.docker.com/desktop/setup/install/windows-install/).

#### VS Code (Recommended)

A convenient editor for PowerShell, TypeScript and workspace navigation. Existing editors are fine. Installed audit version: 1.136.0 x64; use the current supported vendor release. No editor extension is required to compile SHIFAA.

Install:

```powershell
winget install --exact --id Microsoft.VisualStudioCode --source winget --accept-package-agreements --accept-source-agreements
```

Verify:

```powershell
code --version
```

Source: [Official documentation](https://code.visualstudio.com/docs/setup/windows).

#### Browser & DevTools (Required)

Use the installed Microsoft Edge for local web apps; Chrome is an optional alternative. Open DevTools with F12 for console/network/accessibility inspection. Playwright installs its own Chromium later; an installed Chrome/Edge does not replace that browser cache. No browser version is pinned.

Source: [Official documentation](https://www.microsoft.com/edge/download).

[Related official source](https://www.google.com/chrome/).

### Accounts & repository access

Authenticate in the vendor terminal or browser. This HTML never collects passwords, tokens, API keys or credentials.

#### GitHub browser / device login (Required)

Create a GitHub account at github.com/signup if needed, log in, and ask the maintainer for access to YousefE1bana/shifaa-project. Run the HTTPS browser command; follow the CLI device code and browser prompts, including 2FA/organization authorization if asked. setup-git configures Git to use the authenticated CLI. The access test must succeed before cloning.

Authenticate and test:

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git --hostname github.com
gh auth status --hostname github.com
gh repo view YousefE1bana/shifaa-project --json nameWithOwner
git ls-remote https://github.com/YousefE1bana/shifaa-project.git refs/heads/main
```

Troubleshooting: Repository not found can mean missing private-repository access. Confirm the active account with gh auth status and ask the maintainer; do not create a replacement repository. If no browser opens, use the URL and device code printed by gh.

Source: [Official documentation](https://cli.github.com/manual/gh_auth_login).

[Related official source](https://cli.github.com/manual/gh_auth_setup-git), [Related official source](https://github.com/signup).

#### Git author identity (Required)

Use your own name and your GitHub verified email (or the exact GitHub-provided noreply email from account settings). Inspect existing settings first. The commands change your USER Git configuration; confirm the values before applying. Do not paste a token into a remote URL.

Inspect and configure:

```powershell
git config --global --get user.name
git config --global --get user.email
$name = Read-Host "Your Git author name"
$email = Read-Host "Your GitHub verified or noreply email"
if (-not $name -or -not $email) { throw "Name and email required" }
git config --global user.name $name
git config --global user.email $email
```

Source: [Official documentation](https://docs.github.com/en/get-started/getting-started-with-git/setting-your-username-in-git).

### Pinned runtime & package managers

Repository versions win. Install runtimes in isolated toolchains and activate the correct Node in every new terminal.

#### fnm → exact Node (Required)

Install fnm, generate its PowerShell environment, then install/use Node 24.18.0. .node-version, .nvmrc and package.json agree. Do not replace this with a different LTS/current Node or a global Node MSI. fnm keeps versions side by side; setting a default is optional and is not needed for this journey.

Why: engine-strict=true enforces the exact runtime.

Install and activate:

```powershell
winget install --exact --id Schniz.fnm --source winget --accept-package-agreements --accept-source-agreements
# Reopen PowerShell after installing fnm.
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm install 24.18.0
fnm use 24.18.0
node --version
```

Troubleshooting: For automatic activation, review $PROFILE and append only the fnm env line, without replacing its contents. Windows PowerShell and pwsh have separate profiles. If Node is wrong, inspect Get-Command node -All and where.exe node for a conflicting MSI/shim; do not uninstall another project runtime blindly.

Source: [Official documentation](https://github.com/Schniz/fnm).

#### Corepack → exact pnpm (Required)

Corepack is a package-manager shim, not a project dependency. The audited host uses 0.35.0 (unpinned). If absent, install that tested helper through npm, then enable its shims and select pnpm 11.13.0. packageManager and engines.pnpm agree. Always use pnpm or corepack pnpm in the repo; do not run npm install/yarn there.

Activate pinned manager:

```powershell
corepack --version
# ONLY if Corepack is missing (review the source first):
# npm install --global corepack@0.35.0
corepack enable
corepack install --global pnpm@11.13.0
corepack pnpm --version
pnpm --version
```

Troubleshooting: If pnpm resolves to an old user shim, use corepack pnpm and inspect Get-Command pnpm -All. Do not delete shims blindly. Corepack enable may need permission to write the selected fnm Node directory; inspect its location before elevating.

Source: [Official documentation](https://github.com/nodejs/corepack).

#### uv & SpecKit Python (Required)

uv manages isolated Python tools and can acquire a compatible Python for Spec Kit. Python 3 and PyYAML are needed by current template resolution and agent-context code, even though services/ai is only a placeholder. There is no repository Python minor-version pin or implemented FastAPI server to install. Do not install global pip/FastAPI or a separate JDK for Core Setup.

Install:

```powershell
winget install --exact --id astral-sh.uv --source winget --accept-package-agreements --accept-source-agreements
uv --version
```

Source: [Official documentation](https://docs.astral.sh/uv/getting-started/installation/).

### Clone & initialize SHIFAA

Choose only the drive letter above. SHIFAA always lives at D:\ECU\Gradution-Project; worktrees live inside it at D:\ECU\Gradution-Project\.worktrees. The portable setup folder can stay anywhere else. Run project commands from the repository root after cloning.

#### Clone the actual repository (Required)

Choose ONE clone method below, or use the portable bootstrap -Clone mode after GitHub login. Every method derives the canonical destination from your selected drive and reuses an existing SHIFAA repository. An unrelated directory stops setup and is preserved. Inspect existing changes and branch before pulling; ask the maintainer if they need reconciliation. Never reset or force-pull to fix onboarding.

Why: The audited main and remote main matched 670b1e0fe15c719b98179805f2628d1b478a55dd. Your new clone must resolve its own current pins.

Preferred: GitHub CLI:

```powershell
$shifaaRepo = 'D:\ECU\Gradution-Project'
if (-not (Test-Path -LiteralPath 'D:\' -PathType Container)) { throw 'Selected drive is unavailable' }
if (Test-Path -LiteralPath $shifaaRepo) {
  if (-not (Test-Path -LiteralPath (Join-Path $shifaaRepo '.git'))) { throw 'Destination exists but is not a Git repository; preserve its files' }
  $shifaaTop = git -C $shifaaRepo rev-parse --show-toplevel
  if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($shifaaTop) -ne $shifaaRepo) { throw 'Destination is not the repository root' }
  $shifaaOrigin = git -C $shifaaRepo remote get-url origin
  if ($LASTEXITCODE -ne 0 -or $shifaaOrigin -notmatch '^(https://github\.com/|git@github\.com:)YousefE1bana/shifaa-project(?:\.git)?$') { throw 'Destination is not the expected SHIFAA repository' }
  Write-Host "Reusing existing SHIFAA repository at $shifaaRepo"
} else {
  $shifaaParent = Split-Path -Parent $shifaaRepo
  if (-not (Test-Path -LiteralPath $shifaaParent)) { New-Item -ItemType Directory -Path $shifaaParent | Out-Null }
  gh repo clone YousefE1bana/shifaa-project $shifaaRepo
  if ($LASTEXITCODE -ne 0) { throw 'Clone failed; inspect the destination before retrying' }
}
Set-Location -LiteralPath $shifaaRepo
```

Alternative: HTTPS Git:

```powershell
$shifaaRepo = 'D:\ECU\Gradution-Project'
if (-not (Test-Path -LiteralPath 'D:\' -PathType Container)) { throw 'Selected drive is unavailable' }
if (Test-Path -LiteralPath $shifaaRepo) {
  if (-not (Test-Path -LiteralPath (Join-Path $shifaaRepo '.git'))) { throw 'Destination exists but is not a Git repository; preserve its files' }
  $shifaaTop = git -C $shifaaRepo rev-parse --show-toplevel
  if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($shifaaTop) -ne $shifaaRepo) { throw 'Destination is not the repository root' }
  $shifaaOrigin = git -C $shifaaRepo remote get-url origin
  if ($LASTEXITCODE -ne 0 -or $shifaaOrigin -notmatch '^(https://github\.com/|git@github\.com:)YousefE1bana/shifaa-project(?:\.git)?$') { throw 'Destination is not the expected SHIFAA repository' }
  Write-Host "Reusing existing SHIFAA repository at $shifaaRepo"
} else {
  $shifaaParent = Split-Path -Parent $shifaaRepo
  if (-not (Test-Path -LiteralPath $shifaaParent)) { New-Item -ItemType Directory -Path $shifaaParent | Out-Null }
  git clone https://github.com/YousefE1bana/shifaa-project.git $shifaaRepo
  if ($LASTEXITCODE -ne 0) { throw 'Clone failed; inspect the destination before retrying' }
}
Set-Location -LiteralPath $shifaaRepo
```

Enter and verify repository state:

```powershell
$shifaaRepo = 'D:\ECU\Gradution-Project'
Set-Location -LiteralPath $shifaaRepo
git status --short
git remote -v
$shifaaBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $shifaaBranch -ne 'main') { throw 'Inspect the existing branch with the maintainer; onboarding will not switch it automatically' }
$shifaaChanges = git status --porcelain=v1
if ($LASTEXITCODE -ne 0 -or $shifaaChanges) { throw 'Preserve and reconcile local changes before pulling' }
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull failed; preserve changes and inspect divergence' }
```

After Core/manual runtime installation: activate this terminal:

```powershell
$shifaaRepo = 'D:\ECU\Gradution-Project'
Set-Location -LiteralPath $shifaaRepo
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use (Get-Content .node-version).Trim()
corepack install --global pnpm@11.13.0
node --version
corepack pnpm --version
```

Source: [Official documentation](https://github.com/YousefE1bana/shifaa-project).

#### Frozen workspace dependencies (Required)

pnpm-workspace.yaml covers apps/_, packages/_ and services/\*. pnpm-lock.yaml is authoritative. The .npmrc enforces engines, exact saves and strict peers; esbuild is the explicitly allowed dependency build in the workspace configuration. Do not bypass lock/peer checks or globally install Supabase, Expo, Playwright, TypeScript, Turbo or Vitest.

Install and inspect:

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed; stop before startup" }
pnpm exec supabase --version
pnpm exec playwright --version
pnpm -r list --depth -1
```

Troubleshooting: Frozen-lock failure: confirm main and the exact Node/pnpm versions first. Do not regenerate the lock or run approve-builds for every dependency. Proxy/certificate failures need approved network settings, not disabling TLS checks.

Source: `package.json / pnpm-lock.yaml / pnpm-workspace.yaml / .npmrc`.

### Spec Kit & skills

SHIFAA uses SpecKit as its only project lifecycle. No third-party skill can change the approved roadmap or integration rules.

#### Install the pinned Spec Kit CLI (Required)

Tracked integration metadata pins 1.1.3; Codex is the sole registered/default integration with PowerShell and --skills. agent-context is 1.0.2. Install the exact official tag with uv; do not run specify init on this existing repository. An existing different CLI needs manual review, not a silent --force downgrade.

Why: Python is an isolated Spec Kit tool dependency; SHIFAA application builds remain Node-based.

Install exact CLI:

```powershell
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.1.3
uv tool update-shell
# Reopen terminal if specify is not on PATH.
specify --version
```

Set managed Python override:

```powershell
$specifyPython = Join-Path ((uv tool dir | Out-String).Trim()) 'specify-cli/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $specifyPython)) { throw 'Spec Kit Python missing' }
& $specifyPython -c 'import yaml; import sys; print(sys.version)'
if ($LASTEXITCODE -ne 0) { throw 'Python/PyYAML check failed' }
$env:SPECKIT_PYTHON_EXECUTABLE = $specifyPython
# User configuration change: review before applying.
[Environment]::SetEnvironmentVariable('SPECKIT_PYTHON_EXECUTABLE', $specifyPython, 'User')
```

Source: [Official documentation](https://github.com/github/spec-kit/tree/v1.1.3).

#### Four repository-owned policy skills (Required)

The exact owned inventory is listed below. .shifaa/skills/ and .shifaa/skills.json are tracked source. The sync script copies only manifest-listed owned directories to .agents/skills and preserves other third-party skills. It replaces the four owned runtime destinations, so review custom edits there before running it. Run after clone and pull; bootstrap refuses differing existing copies.

Sync owned source:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/sync-shifaa-owned-skills.ps1
pnpm agent-skills:check
pnpm agent-skills:test
```

Source: `.shifaa/skills.json / tools/sync-shifaa-owned-skills.ps1`.

#### Generate official integration skills (Required)

A clean clone has no ignored runtime skills. Inspect integration status; if official generated files are missing, regenerate using the exact pinned CLI and the manifest-aware Codex upgrade command below. It may rewrite integration metadata: review git diff and stop on unexpected tracked changes. Never pass --force over locally modified managed files. There are 10 Codex lifecycle skills plus the agent-context update extension. A legacy unregistered Kimi mirror exists locally; its presence is not a second registered integration.

Inspect then regenerate only missing runtime:

```powershell
specify integration status --json
# If generated Codex skills are missing and managed files have no custom edits:
specify integration upgrade codex --script ps --integration-options=--skills
specify integration status --json
git diff --stat
git diff --check
```

Troubleshooting: Audit finding: speckit-clarify and speckit-converge have local modified hashes. They are preserved. Review/back up your changes before regeneration; do not claim status=ok while warnings remain. A Kimi-only user should use kimi --skills-dir .agents/skills to discover the current generated skills, rather than force-registering an incompatible integration.

Source: `.specify/integration.json / .specify/integrations/*.manifest.json`.

#### Third-party project skills: inventory & consent (Optional)

This audited machine has 32 lock-recorded third-party skills, plus expo-data-fetching and expo-native-ui without project lock provenance. Every entry below includes source and purpose. They are optional advice, not build dependencies. Before installing/updating, review source ownership, license, instructions, scripts, network behavior and SHIFAA conflicts. For a fresh clone choose specific approved skills interactively; do not install everything with --all/--yes. The two unlocked Expo skills must have provenance reconciled before installation.

Inspect approved Skills CLI (network download possible):

```powershell
npx skills@1.7.0 --version
npx skills@1.7.0 --help
# Optional: choose ONE approved source/skill from the inventory; review first.
# Example guard skill:
npx skills@1.7.0 add amelnagdy/guard-skills --skill clean-code-guard --agent codex --copy
```

Source: [Official documentation](https://github.com/vercel-labs/skills).

#### SHIFAA local updater & ignored boundaries (Optional)

UPDATE-SHIFAA-SKILLS.bat launches tools/update-shifaa-skills.ps1. The updater stages npx skills update --project --yes in a temporary workspace, rejects writes outside the skills boundary, publishes only ignored local runtime/lock state, resyncs owned skills and checks Git-visible state. It uses the currently resolved Skills CLI, not a repo pin. Review its resolved version and consent before invoking. -SetupOnly skips third-party updates; -SelfTest uses isolated sentinels.

Owned setup / self-test:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/update-shifaa-skills.ps1 -SetupOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/update-shifaa-skills.ps1 -SelfTest
```

OPTIONAL third-party update after consent:

```powershell
npx skills --version
# Review the updater and resolved Skills CLI before this command.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/update-shifaa-skills.ps1
```

TRACKED: .shifaa/skills/, its manifest and .specify/ integration records. LOCAL / GIT IGNORED / FORBIDDEN TO COMMIT: .agents/skills/, .kimi-code/skills/, root skills-lock.json, their assets and third-party executables. GLOBAL: user .agents/skills, user .codex/skills and plugin-managed skills are independent, manually managed; never copied wholesale into SHIFAA. Third-party wrappers never replace the SpecKit lifecycle or SHIFAA UI Contract.

Source: `docs/agent-skills/README.md / tools/update-shifaa-skills.ps1`.

### AI coding tools

All AI tools are optional developer tooling. No AI subscription, provider account or API key is required to build or verify SHIFAA. Skip this entire section if you do not use an AI assistant.

#### Codex CLI & account login (Optional)

Codex is the registered SpecKit integration and has repository .codex/ role configuration. Tested host CLI: 0.159.2; not a build pin. Install the audited npm version after activating Node, then use codex login for browser-based ChatGPT authentication. If browser callbacks fail, use --device-auth when enabled by your account. Confirm login status; AI model access depends on the account. Do not copy another developer’s global config, auth files or plugin cache.

Install and sign in:

```powershell
npm install --global @openai/codex@0.159.2
codex --version
codex login
codex login status
```

Alternative device flow:

```powershell
codex login --device-auth
codex login status
```

Source: [Official documentation](https://learn.chatgpt.com/docs/codex/cli).

[Related official source](https://learn.chatgpt.com/docs/auth).

#### Codex Windows app / ChatGPT (Optional)

Use the current official Windows desktop download. As of this audit the vendor documentation calls it the ChatGPT desktop app, with Codex available inside. Sign in through its own account UI, open the cloned folder and use the repository’s AGENTS.md/.codex configuration. The standalone Codex CLI is separately installed. ChatGPT web is optional for discussion and requires no local runtime. Desktop version is user-managed; no SHIFAA pin.

Optional official Store install:

```powershell
winget install --id 9PLM9XGG6VKS --source msstore
```

Source: [Official documentation](https://learn.chatgpt.com/docs/windows/windows-app).

[Related official source](https://chatgpt.com/).

#### Kimi Code (current binary, not legacy Python CLI) (Optional)

Tested host: 0.34.0, package @moonshot-ai/kimi-code. The current official Windows installer is on code.kimi.com; the supported npm alternative below is convenient with pinned Node. Kimi uses Git Bash; set KIMI_SHELL_PATH only if Git Bash is installed in a nonstandard location. Run kimi login and complete its device flow. kimi doctor validates configuration, not account/model access. Open kimi to select an approved configured model and confirm login without sending repository secrets.

Install / device login / configuration:

```powershell
npm install --global @moonshot-ai/kimi-code@0.34.0
kimi --version
kimi login
kimi doctor
kimi --skills-dir .agents/skills
```

Troubleshooting: Do not install the retired kimi-cli Python package for this binary. A configured account/model is a separate manual requirement for AI work; no paid prompt is sent by the bootstrap/doctor.

Source: [Official documentation](https://moonshotai.github.io/kimi-code/en/guides/getting-started).

#### OpenCode v2 & provider choice (Optional)

Tested host: 2.0.20 from @opencode/cli, verified in npm and the v2 vendor docs. Use the v2 npm package, not opencode-ai@2.0.20 (that package/version does not exist). Current host auth listing shows OpenCode Console and OpenRouter; neither is a repository requirement or default model. Run auth login and select your approved provider in its terminal prompts. Any API key belongs only in that provider CLI prompt, never here. Inspect auth list and models, then select an actual provider/model in the TUI; no model is invented by this guide.

Install and configure:

```powershell
npm install --global @opencode/cli@2.0.20
opencode --version
opencode auth login
opencode auth list
opencode models
opencode
```

Troubleshooting: The npm installer selects a native binary through its postinstall script. Existing v1 delegate wrappers need a separate compatibility check before use with v2. This audit validates install metadata/help/auth listing, not a paid model invocation.

Source: [Official documentation](https://opencode.ai/v2/docs).

[Related official source](https://opencode.ai/v2/docs/providers/).

#### Other supported delegates (Optional)

Local skills also support Claude Code and Google Antigravity. Installed audit versions: Claude 2.1.257; agy 1.2.14. Their wrappers are optional, not configured build services. Install only when assigned and approved through each vendor’s current Windows guide, then use the vendor account login (Claude: claude auth login; Antigravity: the installed app/CLI sign-in UI). No shared user auth or model configuration is source controlled. Native relay/model execution is not verified in this setup-center task.

Optional CLI verification:

```powershell
claude --version
claude auth login
claude auth status
agy --version
agy --help
```

Source: [Official documentation](https://code.claude.com/docs/en/setup).

[Related official source](https://www.antigravity.google/download).

### Local environment & secrets

Use only repository synthetic fixtures and local generated Supabase keys. Keep production completely outside this onboarding.

#### Create .env.local without overwriting (Required)

For the Supabase path copy .env.supabase.example to root .env.local, then edit its two key placeholders with YOUR local status output after the stack starts. .env.example is the alternative standalone/local-adapter reference; do not combine both into a single file blindly. .env.local is ignored. The root env file is not automatically loaded by all services: tools/start-supabase-api.ps1 injects local settings and keys directly from status; web launchers set public API base URLs. For a custom API launch use the explicit Node --env-file command in Startup.

Why: Publishable/anon keys can belong to a client, but service-role keys remain server-only. Never add them to NEXT*PUBLIC*/EXPO*PUBLIC* variables.

Safe local copy:

```powershell
if (Test-Path -LiteralPath .env.local) { throw ".env.local exists; review it, do not overwrite" }
Copy-Item -LiteralPath .env.supabase.example -Destination .env.local
notepad.exe .env.local
git check-ignore .env.local
```

Source: `.env.example / .env.supabase.example / tools/start-supabase-api.ps1`.

#### Synthetic-only safety boundary (Required)

Never use real patients, PHI, real identity documents, production Supabase/Valify/SMS credentials, or real signing/encryption keys. Leave vendor credentials empty. The example’s clearly labeled synthetic constants are local fixtures; do not replace them with real secrets. Do not paste status JSON, keys or credential files into this HTML, chats, screenshots or commits. Inspect git status and run pnpm secrets:check before sharing changes.

Inspect safety boundaries:

```powershell
git status --short
pnpm secrets:check
```

Source: `.shifaa/skills/shifaa-project-guardrails/SKILL.md / .gitignore`.

### Docker, PostgreSQL & Supabase

There are TWO independent local stacks. You need both for the final verification chain. No manual PostgreSQL, PostGIS or Deno installation is needed.

#### Standalone Compose PostgreSQL (Required)

compose.yml names shifaa-local-postgres; its image is built from a digest-pinned PostGIS 17-3.5 Alpine source (Dockerfile advertises PostgreSQL 17.11). It uses 127.0.0.1:5432, database shifaa, with distinct owner/API/worker synthetic identities. pnpm db:\* targets this stack, not Supabase. On a new empty stack, start it then run the checked-in migrations. Do not install host PostgreSQL to solve a port conflict.

Start / migrate NEW local stack:

```powershell
docker compose config --quiet
docker compose up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw "Compose startup failed" }
pnpm db:migrate
if ($LASTEXITCODE -ne 0) { throw "Migrations failed; stop" }
docker compose ps
```

Schema and RLS tests:

```powershell
pnpm db:test
pnpm db:rls-test
```

Troubleshooting: If 5432 is occupied, inspect Get-NetTCPConnection -LocalPort 5432 and the owner process. Keep the repo port contract; stop your known conflicting service only after review. Database tests use synthetic SQL fixtures and may write test rows.

Source: `compose.yml / infra/db/Dockerfile.postgis / package.json`.

#### Local Supabase stack & generated keys (Required)

Supabase CLI 2.113.0 is a pnpm workspace dependency. supabase/config.toml is already present: do not run supabase init or link a production project. Local start does not require Supabase cloud login. pnpm supabase:start excludes optional Vector; keep Docker TCP disabled. Its project is shifaa-local-supabase with PostgreSQL major 17 and seeded synthetic migrations. View status privately, then copy local anon/publishable and service-role/secret keys to the corresponding .env.local fields.

Start and inspect privately:

```powershell
pnpm supabase:start
if ($LASTEXITCODE -ne 0) { throw "Supabase startup failed" }
# Status displays local keys: keep this output private.
pnpm supabase:status
notepad.exe .env.local
```

Source: `supabase/config.toml / package.json`.

[Related official source](https://supabase.com/docs/guides/local-development/cli/getting-started).

#### Destructive local resets & Supabase tests (Required)

On a NEW disposable development stack apply the explicit Supabase reset and test commands below. Supabase reset/test erase its local database before applying migrations/seed. pnpm db:reset removes ONLY the named Compose project’s volume. pnpm verify also performs resets and may regenerate evidence reports. Stop apps/workers before running resets; back up any local data you need. Never run these against production or preserve-worthy shared stacks. This setup center and doctor do not execute them.

Destructive Supabase gate:

```powershell
$confirmation = Read-Host 'Type RESET-SHIFAA-LOCAL-SUPABASE to reset ONLY your disposable local SHIFAA data'
if ($confirmation -ne 'RESET-SHIFAA-LOCAL-SUPABASE') { throw 'Cancelled' }
pnpm supabase:reset
if ($LASTEXITCODE -ne 0) { throw "Reset failed" }
pnpm supabase:test
if ($LASTEXITCODE -ne 0) { throw 'Command failed. Read the preceding error and stop.' }
```

Optional destructive Compose reinitialize:

```powershell
$confirmation = Read-Host 'Type RESET-SHIFAA-LOCAL-COMPOSE to reset ONLY your disposable local SHIFAA data'
if ($confirmation -ne 'RESET-SHIFAA-LOCAL-COMPOSE') { throw 'Cancelled' }
pnpm db:reset
if ($LASTEXITCODE -ne 0) { throw 'Command failed. Read the preceding error and stop.' }
```

Source: `package.json scripts supabase:test, supabase:reset, db:reset`.

### Start the applications

Use one terminal PER long-running command, from the repository root. Activate fnm in each new terminal. These are local synthetic applications, not production-ready deployments.

#### API, patient web & admin (Required)

Terminal 1 starts the Supabase-backed synthetic API. Terminal 2 starts the Expo patient web app; terminal 3 starts admin Next.js. Keep all open and wait for each ready log, then open the URLs below. The convenience API script discovers local Supabase keys and injects its synthetic settings; it does not read root .env.local. The template remains your local configuration record and can be consumed explicitly in custom startup.

Terminal 1 · API · http://127.0.0.1:3000:

```powershell
pnpm dev:supabase:api
```

Terminal 2 · patient · http://127.0.0.1:8081:

```powershell
pnpm dev:patient:web
```

Terminal 3 · admin · http://127.0.0.1:3001:

```powershell
pnpm dev:admin:web
```

Troubleshooting: Connection failures: check Docker, Supabase status and API terminal first, then the public API base URL. Use one hostname consistently. A 401/403 may be correct authorization, not an installation defect; use only checked-in synthetic accounts for the assigned feature.

Source: `tools/start-supabase-api.ps1 / tools/start-patient-web.ps1 / tools/start-admin-web.ps1`.

#### Clinic & other staff apps (Optional)

Implemented packages exist for clinic, pharmacy, hospital and lab; clinic has scheduling/encounters/referrals/messages routes. Start only apps needed by your assigned role. For API-backed staff requests include that app’s localhost origin in CORS_ALLOWED_ORIGINS before restarting your custom API. The checked-in API defaults include only patient/admin/hospital, not clinic/pharmacy/lab, but .env.example lists only patient/admin, so review it explicitly. Do not interpret placeholder READMEs as current runtime inventory.

Separate terminal · clinic · http://127.0.0.1:3011:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3000'
pnpm --filter @shifaa/clinic dev
```

Separate terminal for EACH additional app:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3000'
# Choose ONE:
# pnpm --filter @shifaa/pharmacy dev  # http://127.0.0.1:3012
# pnpm --filter @shifaa/hospital dev  # http://127.0.0.1:3013
# pnpm --filter @shifaa/lab dev       # http://127.0.0.1:3014
```

Custom API with explicit root env file:

```powershell
# .env.local must contain only local synthetic values.
# To run alongside clinic, edit it to include:
# CORS_ALLOWED_ORIGINS=http://127.0.0.1:8081,http://127.0.0.1:3001,http://127.0.0.1:3011
pnpm --filter @shifaa/api exec node --env-file=../../.env.local --import tsx src/server.ts
```

Source: `apps/*/package.json / services/api/src/config.ts`.

#### Feature-specific worker runners (Optional)

Workers have feature-specific runners, not a universal worker dev command or HTTP UI. Discovery/SOS has its own startup script. Identity continuity, audit export, scheduling notifications and realtime hints require explicit local non-owner worker configuration; never give a worker the API/owner database identity. Run only the runner assigned to your feature. services/ai contains only a README placeholder and no runnable Python service today.

Compose Discovery/SOS API alternative · separate terminal:

```powershell
pnpm dev:discovery-sos:api
```

Discovery/SOS worker · separate terminal:

```powershell
pnpm dev:discovery-sos:worker
```

Identity continuity worker · separate terminal:

```powershell
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:SHIFAA_SYNTHETIC_RUNTIME_ATTESTATION = '007-local-identity-continuity'
$env:DATABASE_URL = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa'
pnpm dev:identity-continuity:worker
```

Scheduling notifications worker · separate terminal:

```powershell
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:CLINIC_SCHEDULING_NOTIFICATIONS_ENABLED = 'true'
$env:DATABASE_URL = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa'
pnpm --filter @shifaa/worker dev:clinic-scheduling-notifications
```

Feature 010 realtime hints · separate terminal:

```powershell
$env:NODE_ENV = 'development'
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:FEATURE_010_REALTIME_HINTS_ENABLED = 'true'
$env:DATABASE_URL = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa'
pnpm --filter @shifaa/worker dev:feature-010-realtime
```

Audit export · separate terminal; account for API configuration:

```powershell
$env:NODE_ENV = 'development'
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:DATABASE_URL = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa'
$env:AUDIT_EXPORT_API_BASE_URL = 'http://127.0.0.1:3000'
# First configure an approved LOCAL synthetic AUDIT_EXPORT_SERVICE_CREDENTIAL
# in both API and worker terminals; do not paste it into this HTML.
if (-not $env:AUDIT_EXPORT_SERVICE_CREDENTIAL) { throw 'Configure a local synthetic service credential first' }
pnpm --filter @shifaa/worker dev:audit-export
```

Other registered runners: dev:audit-export requires DATABASE_URL, SHIFAA_SYNTHETIC_MODE, AUDIT_EXPORT_API_BASE_URL and a local-only AUDIT_EXPORT_SERVICE_CREDENTIAL also configured in the API. dev:feature-010-realtime requires its runner’s local flags and non-owner worker database; inspect assertLocalSyntheticConfiguration before activation. They are not core onboarding requirements. pnpm dev uses Turbo for packages declaring dev; it does not start patient or all workers.

Source: `services/worker/package.json / services/worker/src/*runner.ts / services/ai/README.md`.

#### Stop local services safely (Recommended)

Press Ctrl+C in each app/worker terminal first. Stop Supabase and Compose without deleting data. Keep backups outside Git and never run docker compose down -v except when deliberately resetting disposable local data.

Stop stacks without a reset:

```powershell
pnpm supabase:stop
docker compose stop postgres
```

Source: `package.json / compose.yml`.

### Testing & quality gates

Use repository commands, not globally installed testing CLIs. Doctor checks prerequisites; tests establish application behavior.

#### Pinned Playwright Chromium (Required)

Playwright 1.63.0 is in the root lockfile. Current browser configs use chromium. Install its managed browser cache after frozen dependencies; no separate browser version should be chosen by hand. Firefox/WebKit are optional additions only when a test profile needs them.

Install and verify:

```powershell
pnpm exec playwright install chromium
pnpm exec playwright --version
```

Source: [Official documentation](https://playwright.dev/docs/browsers).

#### Unit, integration, browser & safety checks (Required)

pnpm test runs workspace tests; test:integration runs packages that declare that script. test:e2e currently combines API integration and the patient TypeScript E2E harness; it is not the entire browser matrix. Feature 009/010 browser scripts are separate and the final verify chain includes its registered feature gates. test:a11y covers design system, translations, patient/admin tests; manual assistive-technology acceptance is still separate. DB/RLS tests use local synthetic fixtures.

Targeted repository checks:

```powershell
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:a11y
pnpm contracts:check
pnpm architecture:check
pnpm secrets:check
pnpm dependencies:check
```

Feature browser examples:

```powershell
pnpm test:clinic-scheduling:patient-browser
pnpm test:encounters:ui
```

Troubleshooting: Before using a feature stack/test command inspect its script: some include DB resets. Stop other test runs/apps using the same DB/ports. Do not mark skipped/native/production acceptance as completed because a synthetic check passes.

Source: `package.json scripts / tools/*playwright.config.ts`.

### Optional role additions

Core Setup is shared. Choose a role to display only its ADDITIONAL tools; selecting a profile never installs anything.

#### Backend / Core API (Optional)

No extra runtime is required. Use existing browser DevTools or PowerShell Invoke-RestMethod for local API diagnostics. Optional HTTP clients must be approved individually; do not add a global FastAPI/Python service from the architecture placeholder.

Source: `services/api/package.json / services/ai/README.md`.

#### Data / PostgreSQL / RLS: DBeaver (Optional)

DBeaver Community is an optional SQL viewer; use its vendor Windows x64 installer with bundled Java, so no separate JDK is needed. Connect only to 127.0.0.1:5432/shifaa or 54322/postgres using the assigned synthetic non-owner role. Its vendor release is unpinned and not tested as part of this audit. Use docker compose exec psql if you do not want a GUI.

Source: [Official documentation](https://dbeaver.io/download/).

#### Frontend / UI / A11y: NVDA (Optional)

Install NVDA from NV Access for live desktop screen-reader acceptance. Use keyboard-only flow, Arabic RTL/English LTR, 200% text and contracted zoom/reflow/high-contrast/reduced-motion checks under the SHIFAA UI Contract. NVDA and an optional second browser are user-managed vendor releases, not repo pins; no npm axe/extension install is needed for Core Setup.

Source: [Official documentation](https://www.nvaccess.org/download/).

#### Native patient Android development (Optional)

Only the team member assigned native Android work needs Android Studio, its SDK Manager and an Android emulator (or a physical test device). Core onboarding uses Expo web. Android Studio supplies a bundled JDK; no repository-required JDK/SDK version was found, so do not invent one. Use the checked-in Expo 57.0.15 / React Native 0.86.2 compatibility and the current official Android/Expo guide for the assigned native build, not a global Expo CLI or EAS subscription.

Native builds and device acceptance were not exercised in this onboarding task. A native-role setup must resolve its SDK/build matrix before declaring that role ready. This does not block the shared web/DB setup.

Source: [Official documentation](https://developer.android.com/studio).

#### Security (Optional)

No extra executable is required by Core Setup. Use repository secrets/architecture/dependency/contract/RLS checks. External scanners or proxy tools are optional task-specific additions requiring approval; do not silently install them or put real credential material into findings.

Source: `package.json scripts / .shifaa/skills/shifaa-project-guardrails/SKILL.md`.

#### QA (Optional)

Optional additions beyond Core: NVDA, a second supported browser, and an Android test device/emulator only for native acceptance. Shared Chromium/testing commands are already in Core and are not duplicated here. The repository has no separate QA runtime pin.

Source: [Official documentation](https://www.nvaccess.org/download/).

[Related official source](https://www.google.com/chrome/).

#### AI role (Optional)

Optional additions are an approved account/model in the AI tooling section and separately reviewed skills. services/ai is not implemented, so there is no Python/FastAPI AI runtime to bootstrap today. Respect the roadmap’s later AI boundaries; account access does not authorize implementing that service.

Source: `services/ai/README.md / docs/governance/SHIFAA-Remaining-Specs-Roadmap.md`.

### Verify → project ready

Two independent gates: environment prerequisites, then fresh repository verification. Checkboxes are your attestation, never automatic machine evidence.

#### Optional PowerShell bootstrap (Optional)

Start by extracting SHIFAA-Developer-Setup anywhere outside the canonical project directory. Open its HTML, choose your drive, then double-click OPEN-SETUP-TERMINAL.bat in that folder. It opens Windows PowerShell there and remembers the portable script location in $shifaaSetupFolder. Use the portable copies even after entering the cloned repository. -DriveLetter alone derives the fixed project path; omitted letters are prompted. Run Core before cloning for machine tools, log in to GitHub, run -Clone separately, then rerun Core for repository pins/dependencies. Existing SHIFAA repositories are reused without changing Git history. Default / -Audit / -Verify are read-only. Every installation/change is displayed and requires YES; existing external versions are preserved.

Read-only / preview / selected installation:

```powershell
# Open OPEN-SETUP-TERMINAL.bat in the portable folder first.
if (-not (Test-Path variable:shifaaSetupFolder)) { throw 'Open the portable setup terminal first' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/bootstrap-shifaa-dev.ps1') -Audit -DriveLetter D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/bootstrap-shifaa-dev.ps1') -InstallAll -DriveLetter D -WhatIf
# Run separately in this order; restart/reopen the portable terminal when instructed.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/bootstrap-shifaa-dev.ps1') -InstallCore -DriveLetter D
# Authenticate GitHub using the GitHub section before -Clone.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/bootstrap-shifaa-dev.ps1') -Clone -DriveLetter D
# Inspect/verify main and pull --ff-only as shown in the clone section.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/bootstrap-shifaa-dev.ps1') -InstallCore -DriveLetter D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/bootstrap-shifaa-dev.ps1') -InstallSkills -DriveLetter D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/bootstrap-shifaa-dev.ps1') -InstallQA -DriveLetter D
# Optional: -InstallAI; -InstallAll selects all installs, each still asks YES.
# -SkipAI / -SkipDocker omit those installs; the doctor still reports prerequisites.
# Until initialization is complete, doctor NO / exit 1 is expected.
```

Manual interaction remains: Windows updates/BIOS/WSL/reboot, installer terms and PATH restart, GitHub access/login/author identity, review main/pull, profile edits, desktop apps, AI provider/model/login, env keys, modified skill reconciliation, third-party review, DB initialization/reset, live app acceptance and pnpm verify. Reopen OPEN-SETUP-TERMINAL.bat after a restart to restore the portable script location. -Verify runs the doctor, not the destructive project gate.

Source: the portable setup folder's `tools/bootstrap-shifaa-dev.ps1 / tools/test-shifaa-dev-environment.ps1`.

#### Environment doctor: no FAIL (Required)

Run the read-only doctor. Resolve every FAIL; review each WARN. Optional missing AI/QA tools do not block Core. -IncludeAI selects Codex/Kimi/OpenCode for required availability checks but does not prove paid model access; -IncludeQA adds optional NVDA detection. Doctor YES is prerequisite readiness only. It never runs pnpm verify. If scripts are unavailable, manually run the verification commands in every required step and attest to the same conditions.

Run prerequisite gate:

```powershell
# Use the portable terminal (OPEN-SETUP-TERMINAL.bat), even after cloning.
if (-not (Test-Path variable:shifaaSetupFolder)) { throw 'Open the portable setup terminal first' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/test-shifaa-dev-environment.ps1') -DriveLetter D
# Optional profiles:
# powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/test-shifaa-dev-environment.ps1') -DriveLetter D -IncludeAI -IncludeQA
# Machine-readable (stdout only, values redacted):
# powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $shifaaSetupFolder 'tools/test-shifaa-dev-environment.ps1') -DriveLetter D -Json
```

Troubleshooting: Current audited host is NOT READY: Docker engine stopped; runtime skill modifications need review. This is a truthful audit snapshot, not a reason to erase local state. Doctor errors identify the fix; rerun after resolving them.

Source: the portable setup folder's `tools/test-shifaa-dev-environment.ps1`.

#### Live application smoke check (Required)

Start API/patient/admin, open the verified local URLs, confirm each app renders, and inspect its console/network errors. Use assigned synthetic fixtures. Confirm keyboard navigation and Arabic/English display; record the required live AR/EN acceptance evidence for later feature integration. This onboarding checkbox does not close native screen-reader, vendor, legal, clinical or production OPEN gates. Stop long-running apps/workers before final database verification.

Source: `AGENTS.md / docs/design/SHIFAA-UI-Contract.md`.

#### Final gate: pnpm verify exits 0 (Required)

This is the final PROJECT READY gate. It runs formatting, owned-skills checks/self-tests, lint, typecheck, builds, workspace/unit/a11y/E2E, contracts, architecture, secrets/dependencies, Compose validation, DB reset/migrations/schema/RLS and registered feature 006–010 security/privacy/performance/restore/browser evidence checks. It needs both stacks and browser cache and can erase local synthetic DB data/regenerate evidence. Read the script and review backups first. A prerequisite doctor pass or historical test log is not a substitute.

Explicit destructive project-readiness gate:

```powershell
$confirmation = Read-Host 'Type VERIFY-SHIFAA-LOCAL-RESET to reset ONLY your disposable local SHIFAA data'
if ($confirmation -ne 'VERIFY-SHIFAA-LOCAL-RESET') { throw 'Cancelled' }
pnpm verify
if ($LASTEXITCODE -ne 0) { throw 'Command failed. Read the preceding error and stop.' }
```

Review resulting state:

```powershell
git status --short
git diff --check
```

After a successful fresh exit 0, mark this gate and all required steps. READY is a local self-attestation tied to this setup snapshot; rerun verification after changes. Follow AGENTS.md for later feature work: pnpm verify → live AR/EN evidence → feature branch → Issue/spec-linked PR → current checks → STOP for Yousef’s squash merge. This setup task performs no commit/push/PR and does not implement parked SHIFAA Control feature 025.

Source: `package.json scripts.verify`.

## Exhaustive project skill inventory

Tracked owned source (synchronized via the existing script):

- `shifaa-project-guardrails`
- `shifaa-speckit-overlay`
- `shifaa-third-party-skill-overlay`
- `shifaa-ui-governor`

Official generated lifecycle / extension skills:

- `speckit-specify`
- `speckit-clarify`
- `speckit-plan`
- `speckit-tasks`
- `speckit-analyze`
- `speckit-checklist`
- `speckit-constitution`
- `speckit-converge`
- `speckit-implement`
- `speckit-taskstoissues`
- `speckit-agent-context-update`

These are generated ignored runtime files. Codex is the sole registered
integration; the local Kimi mirror is legacy/unregistered. Do not force-register
Kimi or reinitialize tracked templates to reproduce that mirror.

The local lock records the following 32 third-party skills; the two Expo
entries are present on disk without lock provenance. All are optional and
subordinate to SHIFAA. Every install/update requires review and consent.

| Skill                    | Source repository                                                         | Purpose                                              | Installation mechanism after consent                                                            |
| ------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| agy-delegate             | [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) | Antigravity delegation                               | `npx skills@1.7.0 add amElnagdy/delegate-skills --skill agy-delegate --agent codex --copy`      |
| ask-matt                 | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Engineering discussion                               | `npx skills@1.7.0 add mattpocock/skills --skill ask-matt --agent codex --copy`                  |
| babysit-pr               | [amElnagdy/review-skills](https://github.com/amElnagdy/review-skills)     | PR review-round follow-up                            | `npx skills@1.7.0 add amElnagdy/review-skills --skill babysit-pr --agent codex --copy`          |
| brand-guidelines         | [anthropics/skills](https://github.com/anthropics/skills)                 | Brand styling advice (SHIFAA tokens override)        | `npx skills@1.7.0 add anthropics/skills --skill brand-guidelines --agent codex --copy`          |
| canvas-design            | [anthropics/skills](https://github.com/anthropics/skills)                 | Static visual design                                 | `npx skills@1.7.0 add anthropics/skills --skill canvas-design --agent codex --copy`             |
| claude-delegate          | [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) | Claude delegation                                    | `npx skills@1.7.0 add amElnagdy/delegate-skills --skill claude-delegate --agent codex --copy`   |
| clean-code-guard         | [amelnagdy/guard-skills](https://github.com/amelnagdy/guard-skills)       | Second-pass code review                              | `npx skills@1.7.0 add amelnagdy/guard-skills --skill clean-code-guard --agent codex --copy`     |
| code-review              | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Diff review                                          | `npx skills@1.7.0 add mattpocock/skills --skill code-review --agent codex --copy`               |
| codex-delegate           | [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) | Codex delegation                                     | `npx skills@1.7.0 add amElnagdy/delegate-skills --skill codex-delegate --agent codex --copy`    |
| debate-review            | [amElnagdy/review-skills](https://github.com/amElnagdy/review-skills)     | Two-model diff review                                | `npx skills@1.7.0 add amElnagdy/review-skills --skill debate-review --agent codex --copy`       |
| delegate-setup           | [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) | Developer delegate routing                           | `npx skills@1.7.0 add amElnagdy/delegate-skills --skill delegate-setup --agent codex --copy`    |
| docs-guard               | [amelnagdy/guard-skills](https://github.com/amelnagdy/guard-skills)       | Documentation accuracy review                        | `npx skills@1.7.0 add amelnagdy/guard-skills --skill docs-guard --agent codex --copy`           |
| docx                     | [anthropics/skills](https://github.com/anthropics/skills)                 | Word documents                                       | `npx skills@1.7.0 add anthropics/skills --skill docx --agent codex --copy`                      |
| frontend-design          | [anthropics/skills](https://github.com/anthropics/skills)                 | Frontend visual refinement within UI contract        | `npx skills@1.7.0 add anthropics/skills --skill frontend-design --agent codex --copy`           |
| grill-me                 | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Stress-test decisions                                | `npx skills@1.7.0 add mattpocock/skills --skill grill-me --agent codex --copy`                  |
| grill-with-docs          | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Evidence-backed decision critique                    | `npx skills@1.7.0 add mattpocock/skills --skill grill-with-docs --agent codex --copy`           |
| impeccable               | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)               | Interface refinement within UI contract              | `npx skills@1.7.0 add pbakaus/impeccable --skill impeccable --agent codex --copy`               |
| implement                | [mattpocock/skills](https://github.com/mattpocock/skills)                 | General implementation advice; SpecKit wins          | `npx skills@1.7.0 add mattpocock/skills --skill implement --agent codex --copy`                 |
| implement-spec           | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Specification implementation advice; SpecKit wins    | `npx skills@1.7.0 add mattpocock/skills --skill implement-spec --agent codex --copy`            |
| kimi-delegate            | [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) | Kimi delegation                                      | `npx skills@1.7.0 add amElnagdy/delegate-skills --skill kimi-delegate --agent codex --copy`     |
| mcp-builder              | [anthropics/skills](https://github.com/anthropics/skills)                 | MCP tooling                                          | `npx skills@1.7.0 add anthropics/skills --skill mcp-builder --agent codex --copy`               |
| opencode-delegate        | [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) | OpenCode delegation (v2 compatibility unverified)    | `npx skills@1.7.0 add amElnagdy/delegate-skills --skill opencode-delegate --agent codex --copy` |
| pdf                      | [anthropics/skills](https://github.com/anthropics/skills)                 | PDF documents                                        | `npx skills@1.7.0 add anthropics/skills --skill pdf --agent codex --copy`                       |
| pptx                     | [anthropics/skills](https://github.com/anthropics/skills)                 | Presentations                                        | `npx skills@1.7.0 add anthropics/skills --skill pptx --agent codex --copy`                      |
| setup-matt-pocock-skills | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Personal skill installer; local-only review required | `npx skills@1.7.0 add mattpocock/skills --skill setup-matt-pocock-skills --agent codex --copy`  |
| skill-creator            | [anthropics/skills](https://github.com/anthropics/skills)                 | Skill authoring                                      | `npx skills@1.7.0 add anthropics/skills --skill skill-creator --agent codex --copy`             |
| test-guard               | [amelnagdy/guard-skills](https://github.com/amelnagdy/guard-skills)       | Second-pass test review                              | `npx skills@1.7.0 add amelnagdy/guard-skills --skill test-guard --agent codex --copy`           |
| to-spec                  | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Specification advice; use approved SpecKit           | `npx skills@1.7.0 add mattpocock/skills --skill to-spec --agent codex --copy`                   |
| to-tickets               | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Task/issue advice; SpecKit handoffs win              | `npx skills@1.7.0 add mattpocock/skills --skill to-tickets --agent codex --copy`                |
| wayfinder                | [mattpocock/skills](https://github.com/mattpocock/skills)                 | Repository navigation                                | `npx skills@1.7.0 add mattpocock/skills --skill wayfinder --agent codex --copy`                 |
| web-artifacts-builder    | [anthropics/skills](https://github.com/anthropics/skills)                 | Web artifact advice; no build requirement            | `npx skills@1.7.0 add anthropics/skills --skill web-artifacts-builder --agent codex --copy`     |
| xlsx                     | [anthropics/skills](https://github.com/anthropics/skills)                 | Spreadsheets                                         | `npx skills@1.7.0 add anthropics/skills --skill xlsx --agent codex --copy`                      |
| expo-data-fetching       | UNRECORDED: resolve before installation                                   | Expo network guidance; generated Core API only       | No automatic install                                                                            |
| expo-native-ui           | UNRECORDED: resolve before installation                                   | Expo native UI advice under SHIFAA contract          | No automatic install                                                                            |

Updates for all approved local project entries use `UPDATE-SHIFAA-SKILLS.bat`
or `tools/update-shifaa-skills.ps1` after consent; the updater resolves its
installed Skills CLI and runs `update --project --yes` in isolated staging.
It never updates global skills. The lock and `.agents/skills/` /
`.kimi-code/skills/` assets remain local-only, ignored and forbidden to commit.

## Relevant global/user-managed skills observed

These are outside project setup, advisory and optional. This is a filesystem
inventory of relevant user `.agents/skills` entries, not a requirement to
install them. Plugin skills and user `.codex/skills` are separate; do not copy
plugin caches or global runtime wholesale. Missing source provenance needs
manual review in the user lock and SKILL.md before any install/update.

| Skill                            | User lock source                     | Purpose                                                                                         | Update mechanism                                                                                                                          |
| -------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| agy-delegate                     | amElnagdy/delegate-skills            | Antigravity delegation                                                                          | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| claude-delegate                  | amElnagdy/delegate-skills            | Claude delegation                                                                               | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| clean-code-guard                 | amelnagdy/guard-skills               | Second-pass code review                                                                         | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| code-review                      | mattpocock/skills                    | Diff review                                                                                     | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| codebase-design                  | mattpocock/skills                    | User-managed advisory skill: codebase-design; inspect its SKILL.md before use.                  | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| codex-delegate                   | amElnagdy/delegate-skills            | Codex delegation                                                                                | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| delegate-setup                   | amElnagdy/delegate-skills            | Developer delegate routing                                                                      | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| diagnosing-bugs                  | mattpocock/skills                    | User-managed advisory skill: diagnosing-bugs; inspect its SKILL.md before use.                  | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| docs-guard                       | amelnagdy/guard-skills               | Documentation accuracy review                                                                   | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| domain-modeling                  | mattpocock/skills                    | User-managed advisory skill: domain-modeling; inspect its SKILL.md before use.                  | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| expo-data-fetching               | expo/skills                          | Expo network guidance; generated Core API only                                                  | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| expo-native-ui                   | expo/skills                          | Expo native UI advice under SHIFAA contract                                                     | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| frontend-design                  | anthropics/skills                    | Frontend visual refinement within UI contract                                                   | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| impeccable                       | pbakaus/impeccable                   | Interface refinement within UI contract                                                         | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| kimi-delegate                    | amElnagdy/delegate-skills            | Kimi delegation                                                                                 | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| mcp-builder                      | anthropics/skills                    | MCP tooling                                                                                     | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| opencode-delegate                | amElnagdy/delegate-skills            | OpenCode delegation (v2 compatibility unverified)                                               | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| playwright                       | openai/skills                        | User-managed advisory skill: playwright; inspect its SKILL.md before use.                       | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| setup-pre-commit                 | mattpocock/skills                    | User-managed advisory skill: setup-pre-commit; inspect its SKILL.md before use.                 | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| skill-creator                    | anthropics/skills                    | Skill authoring                                                                                 | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| supabase                         | supabase/agent-skills                | User-managed advisory skill: supabase; inspect its SKILL.md before use.                         | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| supabase-postgres-best-practices | supabase/agent-skills                | User-managed advisory skill: supabase-postgres-best-practices; inspect its SKILL.md before use. | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| systematic-debugging             | obra/superpowers                     | User-managed advisory skill: systematic-debugging; inspect its SKILL.md before use.             | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| tdd                              | mattpocock/skills                    | User-managed advisory skill: tdd; inspect its SKILL.md before use.                              | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| test-guard                       | amelnagdy/guard-skills               | Second-pass test review                                                                         | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| ui-styling                       | nextlevelbuilder/ui-ux-pro-max-skill | User-managed advisory skill: ui-styling; inspect its SKILL.md before use.                       | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| ui-ux-pro-max                    | nextlevelbuilder/ui-ux-pro-max-skill | User-managed advisory skill: ui-ux-pro-max; inspect its SKILL.md before use.                    | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| using-git-worktrees              | obra/superpowers                     | User-managed advisory skill: using-git-worktrees; inspect its SKILL.md before use.              | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| ux-designer                      | szilu/ux-designer-skill              | User-managed advisory skill: ux-designer; inspect its SKILL.md before use.                      | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| vercel-react-best-practices      | vercel-labs/agent-skills             | User-managed advisory skill: vercel-react-best-practices; inspect its SKILL.md before use.      | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| verification-before-completion   | obra/superpowers                     | User-managed advisory skill: verification-before-completion; inspect its SKILL.md before use.   | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| web-design-guidelines            | vercel-labs/agent-skills             | User-managed advisory skill: web-design-guidelines; inspect its SKILL.md before use.            | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |
| webapp-testing                   | anthropics/skills                    | User-managed advisory skill: webapp-testing; inspect its SKILL.md before use.                   | User-managed only; after provenance/consent review use the source installer or Skills CLI explicit global scope, never the SHIFAA updater |

## Local stack port map

| Purpose                            | Host endpoint             | Authority                                       |
| ---------------------------------- | ------------------------- | ----------------------------------------------- |
| Compose PostgreSQL / shifaa        | 127.0.0.1:5432            | compose.yml                                     |
| Supabase API                       | 127.0.0.1:54321           | supabase/config.toml                            |
| Supabase PostgreSQL / postgres     | 127.0.0.1:54322           | supabase/config.toml                            |
| Studio                             | http://127.0.0.1:54323    | supabase/config.toml                            |
| Mail UI                            | http://127.0.0.1:54324    | CLI default; confirm private status after start |
| Analytics                          | 127.0.0.1:54327           | supabase/config.toml                            |
| Pooler                             | 127.0.0.1:54329           | supabase/config.toml                            |
| Shadow DB, on demand               | 54320                     | supabase/config.toml                            |
| Edge inspector, on demand          | 8083                      | supabase/config.toml                            |
| API                                | http://127.0.0.1:3000     | config.ts / startup script                      |
| Patient Expo web                   | http://127.0.0.1:8081     | start-patient-web.ps1                           |
| Admin                              | http://127.0.0.1:3001     | start-admin-web.ps1                             |
| Clinic / pharmacy / hospital / lab | 3011 / 3012 / 3013 / 3014 | app package scripts                             |

## Readiness semantics and known audit limitations

The doctor reports PASS/WARN/FAIL and exits 1 if any prerequisite fails. Its
`READY TO DEVELOP SHIFAA: YES` means prerequisite readiness only, and it always
states that `pnpm verify` was not executed. The HTML READY status additionally
requires your self-attestation of every Required task, live app smoke check and
a fresh successful `pnpm verify` gate. It cannot inspect the machine or run
commands. Saved state is local to this browser/file and audit snapshot; it is
not portable evidence or production approval.

At the audit start Docker Desktop was installed but its Linux engine was
stopped, so this host was NOT READY. SpecKit reported two modified generated
skills (`speckit-clarify`, `speckit-converge`); those are preserved and surfaced
for review. Kimi configuration validated, Codex login status succeeded, and
OpenCode listed OpenCode Console/OpenRouter without exposing credentials.
This establishes configuration/login surfaces, not paid-model execution.

Official vendor procedures were checked on 2026-10-03. npm registry metadata
confirmed the audited Codex/Kimi/OpenCode packages. The existing legacy
`opencode-ai` documentation is superseded for this v2 host by `@opencode/cli`.
The current Kimi binary is `@moonshot-ai/kimi-code`, not legacy Python
`kimi-cli`. Native Android setup and clean-machine GUI installers still need
role-specific/manual vendor validation. No destructive reset is needed solely
for documentation QA. `pnpm verify` performs resets and must only run against
disposable local synthetic stacks with explicit intent and backups.

For future feature work follow AGENTS.md and the assigned roadmap row.
PR-only integration remains mandatory. This setup implementation makes no
commit, push, PR, merge or Git-history change.
