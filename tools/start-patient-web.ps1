param(
  [int]$Port = 8081,
  [string]$ApiBaseUrl = 'http://127.0.0.1:3000'
)

$env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl
pnpm --filter '@shifaa/patient' exec expo start --web --port $Port
