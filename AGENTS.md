# MeowCare — Agent Policy

MeowCare is a Next.js + Supabase (pgvector) + Clerk + Anthropic + OpenAI RAG application deployed on Vercel at meowcare-one.vercel.app. All server-side database access uses `SUPABASE_SERVICE_ROLE_KEY`; user identity is Clerk user IDs (not Supabase auth).

---

## Deny list — never read or output these

- `.env`, `.env.*`, `.env.local`, `.env.*.local`
- `.vercel/` (may cache pulled env vars)
- `secrets/`, `*.pem`, `*.key`, `*.p8`, `*.p12`
- Any hardcoded API keys, tokens, or connection strings found anywhere in the codebase

If you encounter a hardcoded secret: **stop immediately, tell the user, do not attempt to fix it yourself.**

---

## Caution list — ask before acting

| Area | Why |
|------|-----|
| `supabase/migrations/*.sql` | Never execute SQL directly. Write the file, then tell the user to run it manually in the Supabase dashboard. |
| `middleware.ts`, `lib/auth/` | Auth boundary — explain every change before applying. |
| `app/api/admin/` | Permission boundary — changes need explicit justification. |
| `.github/workflows/` | Modifying CI gates affects the security posture of every future push. |
| Installing new dependencies | State the package, why it's needed, and any known supply-chain concerns before running `npm install`. |

---

## Required behavior

- **Do not commit or push** unless the user explicitly says to.
- After editing files, summarize what changed and wait for the user to confirm before continuing.
- When writing migration files, end with: *"Please run this in the Supabase dashboard — I have not and cannot execute it."*
- Do not silently skip steps from the caution list because they seem low-risk.

---

## Reference

v3 security audit (May 2026) — see commit history on `peiweiwww/meowcare` for context: dependency upgrades, RLS, rate limiting, CI gates, and this file.
