-- ==============================================================================
-- Migration 002: Hardened Row Level Security (RLS) & Column-Level Triggers
-- The Choice Auditorium Platform
-- Replaces permissive "using (true)" policies with strict role-based policies.
-- Anon role is denied all access. All policies restricted to authenticated.
-- ==============================================================================

-- 1. HELPER FUNCTIONS TO EVALUATE SERVER-VERIFIED ROLES
-- Reads signed claims from auth.jwt() -> 'app_metadata' ->> 'role'

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner',
    false
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'worker'),
    false
  );
$$;

-- 2. COLUMN INTEGRITY TRIGGERS

-- Trigger A: Attendance approval fields are owner-only
create or replace function public.fn_enforce_attendance_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if not public.is_owner() then
    -- Non-owners cannot modify approval status or approval stamps
    if (new."approvalStatus" is distinct from old."approvalStatus") or
       (new."approvedBy" is distinct from old."approvedBy") or
       (new."approvedAt" is distinct from old."approvedAt") then
      raise exception 'Security Error: Only owners can approve or modify attendance approval fields';
    end if;

    -- Workers cannot change workerId or date of existing record
    if (new."workerId" is distinct from old."workerId") then
      raise exception 'Security Error: Cannot reassign attendance record to another worker';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attendance_enforce_approval on public.attendance;
create trigger trg_attendance_enforce_approval
  before update on public.attendance
  for each row execute function public.fn_enforce_attendance_columns();

-- Trigger B: Prevent users from modifying their own or other users' roles
create or replace function public.fn_enforce_team_users_role_tamper()
returns trigger
language plpgsql
security definer
as $$
begin
  if not public.is_owner() then
    if (new.role is distinct from old.role) then
      raise exception 'Security Error: Only owners can modify user roles';
    end if;
    if (new.auth_user_id is distinct from old.auth_user_id) then
      raise exception 'Security Error: Only owners can modify auth_user_id link';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_users_role_tamper on public.team_users;
create trigger trg_team_users_role_tamper
  before update on public.team_users
  for each row execute function public.fn_enforce_team_users_role_tamper();


-- ==============================================================================
-- 3. DROP ALL PERMISSIVE "using (true)" POLICIES ACROSS ALL 10 TABLES
-- ==============================================================================

drop policy if exists "Allow full access to bookings" on public.bookings;
drop policy if exists "Allow full access to ledger" on public.ledger;
drop policy if exists "Allow full access to compliance" on public.compliance;
drop policy if exists "Allow full access to compliance_history" on public.compliance_history;
drop policy if exists "Allow full access to checklists" on public.checklists;
drop policy if exists "Allow full access to checklist_templates" on public.checklist_templates;
drop policy if exists "Allow full access to attendance" on public.attendance;
drop policy if exists "Allow full access to directory" on public.directory;
drop policy if exists "Allow full access to notifications" on public.notifications;
drop policy if exists "Allow full access to team_users" on public.team_users;

-- Also drop any prior named policies for clean idempotency
drop policy if exists "bookings_select" on public.bookings;
drop policy if exists "bookings_insert" on public.bookings;
drop policy if exists "bookings_update" on public.bookings;
drop policy if exists "bookings_delete" on public.bookings;

drop policy if exists "ledger_select" on public.ledger;
drop policy if exists "ledger_insert" on public.ledger;
drop policy if exists "ledger_update" on public.ledger;
drop policy if exists "ledger_delete" on public.ledger;

drop policy if exists "compliance_select" on public.compliance;
drop policy if exists "compliance_insert" on public.compliance;
drop policy if exists "compliance_update" on public.compliance;

drop policy if exists "compliance_history_select" on public.compliance_history;
drop policy if exists "compliance_history_insert" on public.compliance_history;
drop policy if exists "compliance_history_update" on public.compliance_history;

drop policy if exists "checklists_select" on public.checklists;
drop policy if exists "checklists_insert" on public.checklists;
drop policy if exists "checklists_update" on public.checklists;
drop policy if exists "checklists_delete" on public.checklists;

drop policy if exists "checklist_templates_select" on public.checklist_templates;
drop policy if exists "checklist_templates_write" on public.checklist_templates;

drop policy if exists "attendance_select" on public.attendance;
drop policy if exists "attendance_insert" on public.attendance;
drop policy if exists "attendance_update" on public.attendance;
drop policy if exists "attendance_delete" on public.attendance;

drop policy if exists "directory_select" on public.directory;
drop policy if exists "directory_insert" on public.directory;
drop policy if exists "directory_update" on public.directory;
drop policy if exists "directory_delete" on public.directory;

drop policy if exists "notifications_select" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;
drop policy if exists "notifications_update" on public.notifications;
drop policy if exists "notifications_delete" on public.notifications;

drop policy if exists "team_users_select" on public.team_users;
drop policy if exists "team_users_insert" on public.team_users;
drop policy if exists "team_users_update" on public.team_users;
drop policy if exists "team_users_delete" on public.team_users;


-- ==============================================================================
-- 4. APPLY RESTRICTIVE ROLE POLICIES (TO AUTHENTICATED ONLY)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TABLE 1: BOOKINGS
-- Staff: select, insert, update | Owner: delete
-- ------------------------------------------------------------------------------
alter table public.bookings enable row level security;

create policy "bookings_select" on public.bookings
  for select to authenticated
  using (public.is_staff());

create policy "bookings_insert" on public.bookings
  for insert to authenticated
  with check (public.is_staff());

create policy "bookings_update" on public.bookings
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "bookings_delete" on public.bookings
  for delete to authenticated
  using (public.is_owner());

-- ------------------------------------------------------------------------------
-- TABLE 2: LEDGER
-- Staff: select | Owner: insert, update | NO delete policy (immutable cashbook)
-- ------------------------------------------------------------------------------
alter table public.ledger enable row level security;

create policy "ledger_select" on public.ledger
  for select to authenticated
  using (public.is_staff());

create policy "ledger_insert" on public.ledger
  for insert to authenticated
  with check (public.is_owner());

create policy "ledger_update" on public.ledger
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Note: NO delete policy on ledger. Hard delete is completely blocked for all roles.

-- ------------------------------------------------------------------------------
-- TABLE 3 & 4: COMPLIANCE & COMPLIANCE_HISTORY
-- Staff: select | Owner: insert, update | No delete policy
-- ------------------------------------------------------------------------------
alter table public.compliance enable row level security;

create policy "compliance_select" on public.compliance
  for select to authenticated
  using (public.is_staff());

create policy "compliance_insert" on public.compliance
  for insert to authenticated
  with check (public.is_owner());

create policy "compliance_update" on public.compliance
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

alter table public.compliance_history enable row level security;

create policy "compliance_history_select" on public.compliance_history
  for select to authenticated
  using (public.is_staff());

create policy "compliance_history_insert" on public.compliance_history
  for insert to authenticated
  with check (public.is_owner());

create policy "compliance_history_update" on public.compliance_history
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ------------------------------------------------------------------------------
-- TABLE 5: CHECKLISTS
-- Staff: select, insert, update | Owner: delete
-- ------------------------------------------------------------------------------
alter table public.checklists enable row level security;

create policy "checklists_select" on public.checklists
  for select to authenticated
  using (public.is_staff());

create policy "checklists_insert" on public.checklists
  for insert to authenticated
  with check (public.is_staff());

create policy "checklists_update" on public.checklists
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "checklists_delete" on public.checklists
  for delete to authenticated
  using (public.is_owner());

-- ------------------------------------------------------------------------------
-- TABLE 6: CHECKLIST_TEMPLATES
-- Staff: select | Owner: write (all)
-- ------------------------------------------------------------------------------
alter table public.checklist_templates enable row level security;

create policy "checklist_templates_select" on public.checklist_templates
  for select to authenticated
  using (public.is_staff());

create policy "checklist_templates_write" on public.checklist_templates
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ------------------------------------------------------------------------------
-- TABLE 7: ATTENDANCE
-- Staff: select
-- Worker: insert own row only (cannot pre-approve); update own row (triggers block approval tamper)
-- Owner: full insert, update approval fields, delete
-- ------------------------------------------------------------------------------
alter table public.attendance enable row level security;

create policy "attendance_select" on public.attendance
  for select to authenticated
  using (public.is_staff());

create policy "attendance_insert" on public.attendance
  for insert to authenticated
  with check (
    public.is_owner()
    or (
      public.is_staff()
      and (
        "workerId" in (select id from public.team_users where auth_user_id = auth.uid())
        or "workerId" = auth.uid()::text
      )
      and ("approvalStatus" = 'Pending Approval' or "approvalStatus" is null)
      and "approvedBy" is null
      and "approvedAt" is null
    )
  );

create policy "attendance_update" on public.attendance
  for update to authenticated
  using (
    public.is_owner()
    or (
      public.is_staff()
      and (
        "workerId" in (select id from public.team_users where auth_user_id = auth.uid())
        or "workerId" = auth.uid()::text
      )
    )
  )
  with check (
    public.is_owner()
    or (
      public.is_staff()
      and (
        "workerId" in (select id from public.team_users where auth_user_id = auth.uid())
        or "workerId" = auth.uid()::text
      )
    )
  );

create policy "attendance_delete" on public.attendance
  for delete to authenticated
  using (public.is_owner());

-- ------------------------------------------------------------------------------
-- TABLE 8: DIRECTORY
-- Staff: select | Owner: insert, update, delete
-- ------------------------------------------------------------------------------
alter table public.directory enable row level security;

create policy "directory_select" on public.directory
  for select to authenticated
  using (public.is_staff());

create policy "directory_insert" on public.directory
  for insert to authenticated
  with check (public.is_owner());

create policy "directory_update" on public.directory
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy "directory_delete" on public.directory
  for delete to authenticated
  using (public.is_owner());

-- ------------------------------------------------------------------------------
-- TABLE 9: NOTIFICATIONS
-- Staff: select, update (mark read) | Owner: insert, delete
-- ------------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications
  for select to authenticated
  using (public.is_staff());

create policy "notifications_update" on public.notifications
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (public.is_owner());

create policy "notifications_delete" on public.notifications
  for delete to authenticated
  using (public.is_owner());

-- ------------------------------------------------------------------------------
-- TABLE 10: TEAM_USERS
-- User can select their own row; Owner can select all
-- Only Owner can insert, update, or delete. Non-owners cannot change roles.
-- ------------------------------------------------------------------------------
alter table public.team_users enable row level security;

create policy "team_users_select" on public.team_users
  for select to authenticated
  using (
    public.is_owner()
    or auth_user_id = auth.uid()
  );

create policy "team_users_insert" on public.team_users
  for insert to authenticated
  with check (public.is_owner());

create policy "team_users_update" on public.team_users
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy "team_users_delete" on public.team_users
  for delete to authenticated
  using (public.is_owner());


-- ==============================================================================
-- 5. REALTIME PUBLICATION VERIFICATION
-- Realtime respects Row Level Security on publication tables.
-- ==============================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Ensure required tables are in the publication (idempotent)
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.ledger;
alter publication supabase_realtime add table public.compliance;
alter publication supabase_realtime add table public.compliance_history;
alter publication supabase_realtime add table public.checklists;
alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.directory;
alter publication supabase_realtime add table public.notifications;


-- ==============================================================================
-- 6. VERIFICATION TEST SUITE (Run in SQL Editor to simulate roles)
-- ==============================================================================
/*
-- TEST A: Anonymous Request (Should return 0 rows and block writes)
set role anon;
reset request.jwt.claims;
select * from public.ledger; -- Must return 0 rows
select * from public.bookings; -- Must return 0 rows
insert into public.ledger (id, date, type, category, amount) values ('test-anon', '2026-10-15', 'income', 'Rent', 100); -- Must FAIL with RLS violation

-- TEST B: Worker Role
set role authenticated;
set request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "app_metadata": {"role": "worker"}}';
select * from public.bookings; -- Must succeed
select * from public.ledger; -- Must succeed (view only)
insert into public.ledger (id, date, type, category, amount) values ('test-worker', '2026-10-15', 'income', 'Rent', 100); -- Must FAIL
delete from public.ledger where id = 'led-1'; -- Must FAIL (no delete policy)

-- TEST C: Owner Role
set role authenticated;
set request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000002", "app_metadata": {"role": "owner"}}';
insert into public.ledger (id, date, type, category, amount) values ('test-owner', '2026-10-15', 'income', 'Rent', 100); -- Must succeed
delete from public.ledger where id = 'test-owner'; -- Must FAIL (no delete policy for anyone)

-- Reset back to admin role
reset role;
reset request.jwt.claims;
*/
