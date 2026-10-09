-- ==============================================================================
-- THE CHOICE AUDITORIUM — COMPLETE PRODUCTION DATABASE SETUP
-- Includes:
-- 1. Schema Updates (auth_user_id link, deleted_at column)
-- 2. Extensions & Type Conversions (btree_gist, numeric(12,2), timestamp)
-- 3. Row Level Security & Column Triggers (drop open access, lock to authenticated roles)
-- 4. Double-Booking Exclusion Constraint & Check Constraints
-- 5. Audit Logging & Realtime Views
-- 6. Role Assignment for Staff & Auth Linking
-- ==============================================================================

begin;

-- ==============================================================================
-- STEP 1: EXTENSIONS & DEPENDENCIES
-- ==============================================================================
create extension if not exists btree_gist;

drop view if exists public.booking_financial_summary cascade;
drop view if exists public.active_ledger cascade;

-- ==============================================================================
-- STEP 2: SCHEMA MODIFICATIONS & INDEXES
-- ==============================================================================

-- team_users auth_user_id
alter table public.team_users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_team_users_auth_user_id on public.team_users (auth_user_id);

-- ledger deleted_at (soft delete)
alter table public.ledger
  add column if not exists deleted_at timestamptz default null;

create index if not exists idx_ledger_deleted_at on public.ledger (deleted_at);

-- Bookings date/time conversion to timestamp without time zone
alter table public.bookings
  alter column "fromDateTime" type timestamp without time zone using "fromDateTime"::timestamp without time zone,
  alter column "toDateTime" type timestamp without time zone using "toDateTime"::timestamp without time zone;

-- Bookings money column conversion to numeric(12,2)
alter table public.bookings
  alter column "totalAmount" type numeric(12,2) using round("totalAmount", 2)::numeric(12,2),
  alter column "serviceTax" type numeric(12,2) using round("serviceTax", 2)::numeric(12,2),
  alter column "grandTotal" type numeric(12,2) using round("grandTotal", 2)::numeric(12,2),
  alter column "advanceReceived" type numeric(12,2) using round("advanceReceived", 2)::numeric(12,2),
  alter column "balanceAmount" type numeric(12,2) using round("balanceAmount", 2)::numeric(12,2);

-- Ledger money column conversion to numeric(12,2)
alter table public.ledger
  alter column amount type numeric(12,2) using round(amount, 2)::numeric(12,2);

-- Compliance history money column
alter table public.compliance_history
  alter column "amountPaid" type numeric(12,2) using round("amountPaid", 2)::numeric(12,2);

-- ==============================================================================
-- STEP 3: CHECK CONSTRAINTS & EXCLUSION CONSTRAINT
-- ==============================================================================

-- Bookings: time order
alter table public.bookings drop constraint if exists chk_bookings_time_order;
alter table public.bookings add constraint chk_bookings_time_order
  check ("toDateTime" > "fromDateTime");

-- Bookings: Non-negative amounts
alter table public.bookings drop constraint if exists chk_bookings_financials_non_negative;
alter table public.bookings add constraint chk_bookings_financials_non_negative
  check (
    "totalAmount" >= 0 and
    "serviceTax" >= 0 and
    "grandTotal" >= 0 and
    "advanceReceived" >= 0 and
    "balanceAmount" >= 0
  );

-- Ledger: Positive transaction amounts strictly > 0
alter table public.ledger drop constraint if exists chk_ledger_amount_positive;
alter table public.ledger add constraint chk_ledger_amount_positive
  check (amount > 0);

-- Compliance history: Non-negative amount paid
alter table public.compliance_history drop constraint if exists chk_compliance_amount_non_negative;
alter table public.compliance_history add constraint chk_compliance_amount_non_negative
  check ("amountPaid" >= 0);

-- Double-Booking Exclusion Constraint
alter table public.bookings drop constraint if exists no_overlapping_confirmed_bookings;
alter table public.bookings add constraint no_overlapping_confirmed_bookings
  exclude using gist (
    tsrange("fromDateTime", "toDateTime", '[)') with &&
  ) where (status = 'Confirmed');

-- ==============================================================================
-- STEP 4: HELPER FUNCTIONS FOR ROLE-BASED ACCESS CONTROL
-- ==============================================================================

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

-- ==============================================================================
-- STEP 5: COLUMN INTEGRITY TRIGGERS
-- ==============================================================================

-- Attendance approval owner-only trigger
create or replace function public.fn_enforce_attendance_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if not public.is_owner() then
    if (new."approvalStatus" is distinct from old."approvalStatus") or
       (new."approvedBy" is distinct from old."approvedBy") or
       (new."approvedAt" is distinct from old."approvedAt") then
      raise exception 'Security Error: Only owners can approve or modify attendance approval fields';
    end if;

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

-- Role tamper protection trigger
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
-- STEP 6: ROW LEVEL SECURITY POLICIES (DROP OPEN POLICIES & ENFORCE ROLES)
-- ==============================================================================

-- 1. Bookings
drop policy if exists "Allow full access to bookings" on public.bookings;
drop policy if exists "bookings_select" on public.bookings;
drop policy if exists "bookings_insert" on public.bookings;
drop policy if exists "bookings_update" on public.bookings;
drop policy if exists "bookings_delete" on public.bookings;
alter table public.bookings enable row level security;

create policy "bookings_select" on public.bookings for select to authenticated using (public.is_staff());
create policy "bookings_insert" on public.bookings for insert to authenticated with check (public.is_staff());
create policy "bookings_update" on public.bookings for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "bookings_delete" on public.bookings for delete to authenticated using (public.is_owner());

-- 2. Ledger
drop policy if exists "Allow full access to ledger" on public.ledger;
drop policy if exists "ledger_select" on public.ledger;
drop policy if exists "ledger_insert" on public.ledger;
drop policy if exists "ledger_update" on public.ledger;
drop policy if exists "ledger_delete" on public.ledger;
alter table public.ledger enable row level security;

create policy "ledger_select" on public.ledger for select to authenticated using (public.is_staff());
create policy "ledger_insert" on public.ledger for insert to authenticated with check (public.is_owner());
create policy "ledger_update" on public.ledger for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- 3. Compliance & Compliance History
drop policy if exists "Allow full access to compliance" on public.compliance;
drop policy if exists "compliance_select" on public.compliance;
drop policy if exists "compliance_insert" on public.compliance;
drop policy if exists "compliance_update" on public.compliance;
alter table public.compliance enable row level security;

create policy "compliance_select" on public.compliance for select to authenticated using (public.is_staff());
create policy "compliance_insert" on public.compliance for insert to authenticated with check (public.is_owner());
create policy "compliance_update" on public.compliance for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Allow full access to compliance_history" on public.compliance_history;
drop policy if exists "compliance_history_select" on public.compliance_history;
drop policy if exists "compliance_history_insert" on public.compliance_history;
drop policy if exists "compliance_history_update" on public.compliance_history;
alter table public.compliance_history enable row level security;

create policy "compliance_history_select" on public.compliance_history for select to authenticated using (public.is_staff());
create policy "compliance_history_insert" on public.compliance_history for insert to authenticated with check (public.is_owner());
create policy "compliance_history_update" on public.compliance_history for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- 4. Checklists & Templates
drop policy if exists "Allow full access to checklists" on public.checklists;
drop policy if exists "checklists_select" on public.checklists;
drop policy if exists "checklists_insert" on public.checklists;
drop policy if exists "checklists_update" on public.checklists;
drop policy if exists "checklists_delete" on public.checklists;
alter table public.checklists enable row level security;

create policy "checklists_select" on public.checklists for select to authenticated using (public.is_staff());
create policy "checklists_insert" on public.checklists for insert to authenticated with check (public.is_staff());
create policy "checklists_update" on public.checklists for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "checklists_delete" on public.checklists for delete to authenticated using (public.is_owner());

drop policy if exists "Allow full access to checklist_templates" on public.checklist_templates;
drop policy if exists "checklist_templates_select" on public.checklist_templates;
drop policy if exists "checklist_templates_write" on public.checklist_templates;
alter table public.checklist_templates enable row level security;

create policy "checklist_templates_select" on public.checklist_templates for select to authenticated using (public.is_staff());
create policy "checklist_templates_write" on public.checklist_templates for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- 5. Attendance
drop policy if exists "Allow full access to attendance" on public.attendance;
drop policy if exists "attendance_select" on public.attendance;
drop policy if exists "attendance_insert" on public.attendance;
drop policy if exists "attendance_update" on public.attendance;
drop policy if exists "attendance_delete" on public.attendance;
alter table public.attendance enable row level security;

create policy "attendance_select" on public.attendance for select to authenticated using (public.is_staff());
create policy "attendance_insert" on public.attendance for insert to authenticated with check (public.is_owner());
create policy "attendance_update" on public.attendance for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "attendance_delete" on public.attendance for delete to authenticated using (public.is_owner());

-- 6. Directory
drop policy if exists "Allow full access to directory" on public.directory;
drop policy if exists "directory_select" on public.directory;
drop policy if exists "directory_insert" on public.directory;
drop policy if exists "directory_update" on public.directory;
drop policy if exists "directory_delete" on public.directory;
alter table public.directory enable row level security;

create policy "directory_select" on public.directory for select to authenticated using (public.is_staff());
create policy "directory_insert" on public.directory for insert to authenticated with check (public.is_staff());
create policy "directory_update" on public.directory for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "directory_delete" on public.directory for delete to authenticated using (public.is_owner());

-- 7. Notifications
drop policy if exists "Allow full access to notifications" on public.notifications;
drop policy if exists "notifications_select" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;
drop policy if exists "notifications_update" on public.notifications;
drop policy if exists "notifications_delete" on public.notifications;
alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications for select to authenticated using (public.is_staff());
create policy "notifications_insert" on public.notifications for insert to authenticated with check (public.is_staff());
create policy "notifications_update" on public.notifications for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "notifications_delete" on public.notifications for delete to authenticated using (public.is_owner());

-- 8. Team Users
drop policy if exists "Allow full access to team_users" on public.team_users;
drop policy if exists "team_users_select" on public.team_users;
drop policy if exists "team_users_insert" on public.team_users;
drop policy if exists "team_users_update" on public.team_users;
drop policy if exists "team_users_delete" on public.team_users;
alter table public.team_users enable row level security;

create policy "team_users_select" on public.team_users for select to authenticated using (true);
create policy "team_users_insert" on public.team_users for insert to authenticated with check (public.is_owner());
create policy "team_users_update" on public.team_users for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "team_users_delete" on public.team_users for delete to authenticated using (public.is_owner());

-- ==============================================================================
-- STEP 7: AUDIT LOGGING TABLE & TRIGGER
-- ==============================================================================

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE')),
  old_data jsonb,
  new_data jsonb,
  actor uuid default auth.uid(),
  at timestamptz default now()
);

create index if not exists idx_audit_log_table_row on public.audit_log (table_name, row_id);
create index if not exists idx_audit_log_at on public.audit_log (at);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_owner" on public.audit_log;
create policy "audit_log_select_owner" on public.audit_log
  for select to authenticated
  using (public.is_owner());

create or replace function public.fn_audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_row_id text;
  v_old_data jsonb := null;
  v_new_data jsonb := null;
begin
  if tg_op = 'INSERT' then
    v_action := 'INSERT';
    v_row_id := coalesce(new.id::text, '');
    v_new_data := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    if (tg_table_name = 'ledger') and (old.deleted_at is null) and (new.deleted_at is not null) then
      v_action := 'SOFT_DELETE';
    else
      v_action := 'UPDATE';
    end if;
    v_row_id := coalesce(new.id::text, old.id::text, '');
    v_old_data := to_jsonb(old);
    v_new_data := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_action := 'DELETE';
    v_row_id := coalesce(old.id::text, '');
    v_old_data := to_jsonb(old);
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data, actor, at)
  values (tg_table_name, v_row_id, v_action, v_old_data, v_new_data, auth.uid(), now());

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists trg_audit_bookings on public.bookings;
create trigger trg_audit_bookings after insert or update or delete on public.bookings
  for each row execute function public.fn_audit_log_trigger();

drop trigger if exists trg_audit_ledger on public.ledger;
create trigger trg_audit_ledger after insert or update or delete on public.ledger
  for each row execute function public.fn_audit_log_trigger();

drop trigger if exists trg_audit_compliance on public.compliance;
create trigger trg_audit_compliance after insert or update or delete on public.compliance
  for each row execute function public.fn_audit_log_trigger();

drop trigger if exists trg_audit_attendance on public.attendance;
create trigger trg_audit_attendance after insert or update or delete on public.attendance
  for each row execute function public.fn_audit_log_trigger();

-- ==============================================================================
-- STEP 8: VIEWS
-- ==============================================================================

create or replace view public.active_ledger as
  select
    id, date, type, category, amount, description,
    "loggedBy", "bookingId", "createdAt", deleted_at
  from public.ledger
  where deleted_at is null;

grant select on public.active_ledger to authenticated;

create or replace view public.booking_financial_summary as
  select
    id, "bookingNo", "customerName", "reservationDate", status,
    "totalAmount", "serviceTax", "grandTotal", "advanceReceived", "balanceAmount",
    coalesce(
      (select sum(amount) from public.ledger where "bookingId" = b.id and type = 'income' and deleted_at is null),
      0
    ) as total_income_recorded,
    coalesce(
      (select sum(amount) from public.ledger where "bookingId" = b.id and type = 'expense' and deleted_at is null),
      0
    ) as total_expenses_recorded
  from public.bookings b;

grant select on public.booking_financial_summary to authenticated;

-- ==============================================================================
-- STEP 9: ROLES & USER LINKING
-- ==============================================================================

-- Assign roles in app_metadata
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "owner"}'::jsonb
where email in (
  'elbymathew20@gmail.com',
  'abin@choiceauditorium.com',
  'vibinkgl@gmail.com'
);

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "worker"}'::jsonb
where email in (
  'gopinathan@choiceauditorium.com',
  'sajitha@choiceauditorium.com'
);

-- Link team_users to auth_user_id
update public.team_users tu
set auth_user_id = au.id
from auth.users au
where lower(tu.email) = lower(au.email);

commit;
