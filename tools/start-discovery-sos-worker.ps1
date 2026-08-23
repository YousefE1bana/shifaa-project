$ErrorActionPreference = 'Stop'
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:SHIFAA_SYNTHETIC_RUNTIME_ATTESTATION = '006-local-postgis'
$env:DATABASE_URL = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa'
pnpm --filter '@shifaa/worker' dev:discovery-sos
