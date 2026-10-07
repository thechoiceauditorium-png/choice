-- ==============================================================================
-- Migration 001: Link team_users to Supabase auth.users
-- Idempotent schema migration for Phase 1 Authentication Hardening
-- ==============================================================================

-- 1. Add auth_user_id referencing auth.users(id)
alter table public.team_users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- 2. Create index for fast lookups by authenticated UID
create index if not exists idx_team_users_auth_user_id on public.team_users (auth_user_id);

-- Note on credentials columns:
-- Audit verified that team_users contains NO password, pin, or hash columns.
-- Existing columns: id, name, role, title, phone, email, avatar, createdAt, auth_user_id.
-- No columns were dropped.
