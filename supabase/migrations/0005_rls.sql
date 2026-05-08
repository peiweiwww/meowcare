-- 0005_rls.sql
-- Enable Row Level Security on documents, conversations, and messages.
--
-- Design intent:
--   This app connects exclusively via SUPABASE_SERVICE_ROLE_KEY (server-side only).
--   service_role bypasses RLS unconditionally, so all existing API routes continue
--   to work without any policy grants.
--
--   No anon or authenticated policies are created intentionally:
--   the default-deny behaviour of RLS blocks any accidental anon/authenticated
--   access that might be introduced in future client-side code.
--
--   FORCE ROW LEVEL SECURITY is enabled so that even table owners (e.g. postgres
--   role in Supabase SQL Editor) cannot bypass RLS — only roles with explicit
--   BYPASSRLS privilege (i.e. service_role) can read these tables.
--
--   User identity is Clerk user_id (text), not Supabase auth.uid(), so
--   row-level user filtering is enforced at the application layer, not here.

alter table public.documents     enable row level security;
alter table public.documents     force row level security;

alter table public.conversations enable row level security;
alter table public.conversations force row level security;

alter table public.messages      enable row level security;
alter table public.messages      force row level security;
