param(
  [int]$Port = 3001,
  [string]$ApiBaseUrl = 'http://127.0.0.1:3000'
)

$env:NEXT_PUBLIC_API_BASE_URL = $ApiBaseUrl
pnpm --filter '@shifaa/admin' exec next dev -p $Port
