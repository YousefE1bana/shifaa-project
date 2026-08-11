# SHIFAA team installation checklist

> Baseline: `002-supabase-runtime-foundation` seeded-synthetic engineering only. Run these commands in Windows PowerShell. Do not add real patient, identity, document, vendor, or production credentials.

## 1. Install machine prerequisites

Run PowerShell as Administrator:

```powershell
$ErrorActionPreference = 'Stop'
winget install --exact --id Git.Git --accept-package-agreements --accept-source-agreements
winget install --exact --id GitHub.cli --accept-package-agreements --accept-source-agreements
winget install --exact --id Schniz.fnm --accept-package-agreements --accept-source-agreements
winget install --exact --id astral-sh.uv --accept-package-agreements --accept-source-agreements
winget install --exact --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
```

Close PowerShell, open a new non-administrator PowerShell window, then run:

```powershell
$ErrorActionPreference = 'Stop'
$fnmHook = 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'
if (-not (Test-Path -LiteralPath $PROFILE)) {
  New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}
if (-not (Select-String -LiteralPath $PROFILE -SimpleMatch $fnmHook -Quiet)) {
  Add-Content -LiteralPath $PROFILE -Value "`n$fnmHook"
}
Invoke-Expression (& fnm env --use-on-cd --shell powershell | Out-String)
fnm install 24.18.0
fnm default 24.18.0
fnm use 24.18.0
corepack enable
corepack install --global pnpm@11.13.0
uv tool install --force "git+https://github.com/github/spec-kit.git@684b3d8e05263a7c1948d3d0699ab1cb4f77c3d5"
$specifyPython = Join-Path (uv tool dir) 'specify-cli\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $specifyPython)) { throw 'SpecKit Python runtime was not installed' }
[Environment]::SetEnvironmentVariable('SPECKIT_PYTHON', $specifyPython, 'User')
$env:SPECKIT_PYTHON = $specifyPython
$env:KIMI_VERSION = '0.34.0'
irm https://code.kimi.com/kimi-code/install.ps1 | iex
Remove-Item Env:KIMI_VERSION
```

Open Docker Desktop and wait until the engine reports that it is running. Then verify every pin:

```powershell
$ErrorActionPreference = 'Stop'
if ((node --version) -ne 'v24.18.0') { throw 'Node must be v24.18.0' }
if ((pnpm --version) -ne '11.13.0') { throw 'pnpm must be 11.13.0' }
if ((specify --version) -ne 'specify 0.16.2.dev0') { throw 'SpecKit must be 0.16.2.dev0' }
if (-not (Test-Path -LiteralPath $env:SPECKIT_PYTHON)) { throw 'SPECKIT_PYTHON must point to the SpecKit uv runtime' }
if ((kimi --version) -ne '0.34.0') { throw 'Kimi Code must be 0.34.0' }
git --version
gh --version
docker version
docker compose version
```

## 2. Authenticate GitHub and Kimi

```powershell
$ErrorActionPreference = 'Stop'
gh auth login --hostname github.com --git-protocol https --web
gh auth status --hostname github.com
kimi login
```

The final `kimi login` command opens the Kimi device-code flow. Complete it before continuing.

## 3. Pull and validate the repository

```powershell
$ErrorActionPreference = 'Stop'
gh repo clone YousefE1bana/shifaa-project
Set-Location shifaa-project
git switch main
git pull --ff-only
fnm use 24.18.0
corepack install --global pnpm@11.13.0
pnpm install --frozen-lockfile
if (-not (Test-Path '.kimi-code/skills/speckit-implement/SKILL.md')) { throw 'Kimi SpecKit integration is missing' }
if (-not (Test-Path '.agents/skills/speckit-implement/SKILL.md')) { throw 'Codex SpecKit integration is missing' }
```

## 4. Create the synthetic-only Supabase environment

```powershell
$ErrorActionPreference = 'Stop'
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:status
if (Test-Path '.env.local') { throw '.env.local already exists; review it instead of overwriting it' }
Copy-Item '.env.supabase.example' '.env.local'
pnpm supabase:test
pnpm verify
```

Open three PowerShell windows from the repository root and run one command in each:

```powershell
pnpm dev:supabase:api
pnpm dev:patient:web
pnpm dev:admin:web
```

`.env.local` is ignored by Git. Copy the generated local keys printed by `pnpm supabase:status` into it and never commit it. Production Supabase, Valify, SMS, encryption, signing, or PHI credentials are neither required nor permitted for this slice.

## 5. Start an Issue-scoped implementation

Replace `123` with the assigned enriched Issue number:

```powershell
$ErrorActionPreference = 'Stop'
$issue = 123
git switch main
git pull --ff-only
git switch -c "issue-$issue-identity-onboarding"
gh issue view $issue --repo YousefE1bana/shifaa-project
.specify/scripts/powershell/resolve-issue-handoff.ps1 -Issue "#$issue" -Json
kimi
```

Inside Kimi Code, paste:

```text
/skill:speckit-implement #123
```

For a Codex implementation session, paste:

```text
$speckit-implement #123
```

The resolver must accept the Issue's `shifaa-speckit-handoff:v1` body, feature path, task ID, artifact links, and baseline commit before any implementation begins. Do not proceed from an Issue that fails validation.

## 6. Validate before pushing

```powershell
$ErrorActionPreference = 'Stop'
pnpm verify
pnpm sbom:generate
git status --short
git push --set-upstream origin (git branch --show-current)
```

Performance evidence additionally requires the synthetic API to be running:

```powershell
$ErrorActionPreference = 'Stop'
pnpm test:performance
Get-Content 'specs/001-identity-onboarding/evidence/performance.json'
```

## 7. Stop local services

```powershell
pnpm supabase:stop
```

To deliberately delete only this repository's local PostgreSQL volume and rebuild its synthetic data:

```powershell
$confirmation = Read-Host 'Type RESET-SHIFAA-LOCAL to reset the named local Supabase database'
if ($confirmation -ne 'RESET-SHIFAA-LOCAL') { throw 'Reset cancelled' }
pnpm supabase:reset
pnpm supabase:test
```
