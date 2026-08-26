param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

docker compose up -d --wait postgres
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$migrationProbe = docker compose exec -T postgres psql -Atq -U shifaa_owner -d shifaa -c "select to_regprocedure('platform.search_discovery_facilities(double precision,double precision,integer,text,text,text,double precision,uuid,integer)') is not null;"
if ($LASTEXITCODE -ne 0 -or $migrationProbe.Trim() -ne 't') {
  throw '006 migration is not present. Run pnpm db:migrate before starting the live stack.'
}

docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U shifaa_owner -d shifaa -f /workspace/infra/db/fixtures/discovery-sos.sql
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$env:NODE_ENV = 'test'
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:SYNTHETIC_PROOFING_ENABLED = 'true'
$env:AUTH_ADAPTER = 'local'
$env:REPOSITORY_ADAPTER = 'postgres'
$env:PROOFING_ADAPTER = 'local'
$env:UPLOAD_ADAPTER = 'local'
$env:DATABASE_URL = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa'
$env:CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:8081,http://localhost:8081,http://127.0.0.1:3013,http://localhost:3013'
$env:PORT = "$Port"
# Seeded-synthetic test keys ONLY; production startup rejects these constants.
$env:IDENTITY_ENCRYPTION_KEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:IDENTITY_BLIND_INDEX_KEY_BASE64 = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
$env:PREAUTH_HMAC_KEY_BASE64 = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='

Write-Host 'Starting the seeded-synthetic 006 API. Production maps, messaging, capacity publishing, PHI, dispatch, and reservation integrations remain disabled.'
pnpm --filter '@shifaa/api' dev
