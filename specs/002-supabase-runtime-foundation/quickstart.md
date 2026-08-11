# Quickstart: Supabase Runtime Foundation

```powershell
fnm use 24.18.0
corepack enable
corepack prepare pnpm@11.13.0 --activate
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:status
Copy-Item .env.supabase.example .env.local
pnpm --filter @shifaa/api dev
pnpm --filter @shifaa/patient exec expo start --web --port 8081
pnpm --filter @shifaa/admin exec next dev -p 3001
```

Retrieve the synthetic email OTP from local Mailpit at the URL printed by `pnpm supabase:status`. Never use a real email, phone, identity, or health record. Stop with `pnpm supabase:stop`; do not expose local ports to the internet.
