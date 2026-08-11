$ErrorActionPreference = 'Stop'
$status = pnpm supabase status -o json | ConvertFrom-Json
$env:NODE_ENV = 'development'
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:SYNTHETIC_PROOFING_ENABLED = 'true'
$env:AUTH_ADAPTER = 'supabase'
$env:REPOSITORY_ADAPTER = 'postgres'
$env:UPLOAD_ADAPTER = 'supabase'
$env:SUPABASE_URL = $status.API_URL
$env:SUPABASE_ANON_KEY = $status.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
$env:SUPABASE_JWKS_URL = "$($status.API_URL)/auth/v1/.well-known/jwks.json"
$env:SUPABASE_JWT_ISSUER = "$($status.API_URL)/auth/v1"
$env:SUPABASE_JWT_AUDIENCE = 'authenticated'
$env:DATABASE_URL = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:54322/postgres'
$env:IDENTITY_ENCRYPTION_KEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:IDENTITY_BLIND_INDEX_KEY_BASE64 = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
$env:PREAUTH_HMAC_KEY_BASE64 = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='
pnpm --filter '@shifaa/api' dev
