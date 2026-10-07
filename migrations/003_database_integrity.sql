-- ==============================================================================
-- Migration 003: Database Integrity, Exclusion Constraints, Audit Logging & Views
-- The Choice Auditorium Platform
-- Wrapped in a single atomic transaction with safe dependency management.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PRE-MIGRATION DRY-RUN QUERIES (Run these in SQL Editor before executing migration)
-- ------------------------------------------------------------------------------
/*
-- 1. Check for rows that would fail conversion to timestamp without time zone:
select id, "bookingNo", "fromDateTime", "toDateTime", status
from public.bookings
where
  "fromDateTime" is null or "fromDateTime" = ''
  or "toDateTime" is null or "toDateTime" = ''
  or "fromDateTime" !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
  or "toDateTime" !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
  or ("fromDateTime"::timestamp >= "toDateTime"::timestamp);

-- 2. Check for existing overlapping Confirmed bookings that would block exclusion constraint:
select
  b1.id as booking_1_id, b1."bookingNo" as b1_no, b1."fromDateTime" as b1_from, b1."toDateTime" as b1_to,
  b2.id as booking_2_id, b2."bookingNo" as b2_no, b2."fromDateTime" as b2_from, b2."toDateTime" as b2_to
from public.bookings b1
join public.bookings b2
  on b1.id < b2.id
  and b1.status = 'Confirmed'
  and b2.status = 'Confirmed'
  and tsrange(b1."fromDateTime"::timestamp, b1."toDateTime"::timestamp, '[)') &&
      tsrange(b2."fromDateTime"::timestamp, b2."toDateTime"::timestamp, '[)');

-- 3. Check for fractional precision loss on money columns (> 2 decimal digits):
select id, "bookingNo", "totalAmount", "grandTotal", "advanceReceived", "balanceAmount"
from public.bookings
where "totalAmount"::text ~ '\.\d{3,}$' or "grandTotal"::text ~ '\.\d{3,}$';

select id, date, amount from public.ledger where amount::text ~ '\.\d{3,}$';
*/

begin;

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
create extension if not exists btree_gist;


-- ==============================================================================
-- 2. DROP DEPENDENT VIEWS PRIOR TO COLUMN ALTERATIONS
-- ==============================================================================
drop view if exists public.booking_financial_summary cascade;
drop view if exists public.active_ledger cascade;


-- ==============================================================================
-- 3. ALTER COLUMN TYPES TO EXACT DOMAINS
-- ==============================================================================

-- Bookings date/time conversion to timestamp without time zone (local IST)
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
-- 4. CHECK CONSTRAINTS FOR FINANCIAL & TEMPORAL INTEGRITY
-- ==============================================================================

-- Bookings: toDateTime must be strictly after fromDateTime
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


-- ==============================================================================
-- 5. DOUBLE-BOOKING EXCLUSION CONSTRAINT (POSTGRESQL BTREE_GIST)
-- ==============================================================================

-- Half-open interval '[)' ensures 10:00 end and 10:00 start do not conflict
alter table public.bookings drop constraint if exists no_overlapping_confirmed_bookings;
alter table public.bookings add constraint no_overlapping_confirmed_bookings
  exclude using gist (
    tsrange("fromDateTime", "toDateTime", '[)') with &&
  ) where (status = 'Confirmed');

-- Commented multi-hall variant (if a "hallId" column is added in future):
-- alter table public.bookings add constraint no_overlapping_confirmed_bookings
--   exclude using gist (
--     "hallId" with =,
--     tsrange("fromDateTime", "toDateTime", '[)') with &&
--   ) where (status = 'Confirmed');


-- ==============================================================================
-- 6. SOFT DELETE FOR LEDGER & ACTIVE_LEDGER VIEW
-- ==============================================================================

alter table public.ledger
  add column if not exists deleted_at timestamptz default null;

create index if not exists idx_ledger_deleted_at on public.ledger (deleted_at);

-- Active ledger view (excludes soft-deleted rows)
create or replace view public.active_ledger as
  select
    id, date, type, category, amount, description,
    "loggedBy", "bookingId", "createdAt", deleted_at
  from public.ledger
  where deleted_at is null;

grant select on public.active_ledger to authenticated;


-- ==============================================================================
-- 7. IMMUTABLE AUDIT LOG & TRIGGER (SECURITY DEFINER + FIXED SEARCH_PATH)
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

-- Audit log access: SELECT only for owner. ZERO update/delete policies for anyone.
drop policy if exists "audit_log_select_owner" on public.audit_log;
create policy "audit_log_select_owner" on public.audit_log
  for select to authenticated
  using (public.is_owner());

-- Generic Audit Trigger Function with secure search_path
create or replace function public.fn_audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row_id text;
  v_old jsonb := null;
  v_new jsonb := null;
  v_action text := tg_op;
begin
  if (tg_op = 'DELETE') then
    v_row_id := coalesce(old.id::text, '');
    v_old := to_jsonb(old);
  elsif (tg_op = 'UPDATE') then
    v_row_id := coalesce(new.id::text, '');
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- Specially annotate soft deletes in audit log action
    if (old.deleted_at is null and new.deleted_at is not null) then
      v_action := 'SOFT_DELETE';
    end if;
  elsif (tg_op = 'INSERT') then
    v_row_id := coalesce(new.id::text, '');
    v_new := to_jsonb(new);
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data, actor, at)
  values (tg_table_name, v_row_id, v_action, v_old, v_new, auth.uid(), now());

  if (tg_op = 'DELETE') then
    return old;
  else
    return new;
  end if;
end;
$$;

-- Attach Audit Triggers to Critical Operational Tables
drop trigger if exists trg_audit_ledger on public.ledger;
create trigger trg_audit_ledger
  after insert or update or delete on public.ledger
  for each row execute function public.fn_audit_log_trigger();

drop trigger if exists trg_audit_bookings on public.bookings;
create trigger trg_audit_bookings
  after insert or update or delete on public.bookings
  for each row execute function public.fn_audit_log_trigger();

drop trigger if exists trg_audit_compliance on public.compliance;
create trigger trg_audit_compliance
  after insert or update or delete on public.compliance
  for each row execute function public.fn_audit_log_trigger();

drop trigger if exists trg_audit_attendance on public.attendance;
create trigger trg_audit_attendance
  after insert or update or delete on public.attendance
  for each row execute function public.fn_audit_log_trigger();

drop trigger if exists trg_audit_team_users on public.team_users;
create trigger trg_audit_team_users
  after insert or update or delete on public.team_users
  for each row execute function public.fn_audit_log_trigger();


-- ==============================================================================
-- 8. SERVER-SIDE TIMESTAMP OVERWRITE TRIGGERS
-- ==============================================================================

create or replace function public.fn_enforce_server_timestamps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new."createdAt" := now();
  elsif tg_op = 'UPDATE' then
    new."createdAt" := old."createdAt";
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ledger_server_timestamps on public.ledger;
create trigger trg_ledger_server_timestamps
  before insert or update on public.ledger
  for each row execute function public.fn_enforce_server_timestamps();

drop trigger if exists trg_attendance_server_timestamps on public.attendance;
create trigger trg_attendance_server_timestamps
  before insert or update on public.attendance
  for each row execute function public.fn_enforce_server_timestamps();


-- ==============================================================================
-- 9. DERIVED BALANCE & FINANCIAL RECONCILIATION VIEW
-- ==============================================================================

create or replace view public.booking_financial_summary as
select
  b.id as booking_id,
  b."bookingNo",
  b."customerName",
  b."totalAmount",
  b."serviceTax",
  b."grandTotal",
  b."advanceReceived" as stored_advance,
  b."balanceAmount" as stored_balance,
  coalesce(sum(case when l.type = 'income' and l.deleted_at is null then l.amount else 0 end), 0)::numeric(12,2) as ledger_total_paid,
  (b."grandTotal" - coalesce(sum(case when l.type = 'income' and l.deleted_at is null then l.amount else 0 end), 0))::numeric(12,2) as derived_balance,
  case
    when coalesce(sum(case when l.type = 'income' and l.deleted_at is null then l.amount else 0 end), 0) >= b."grandTotal" and b."grandTotal" > 0 then 'Fully Paid'
    when coalesce(sum(case when l.type = 'income' and l.deleted_at is null then l.amount else 0 end), 0) > 0 then 'Partially Paid'
    else 'Unpaid'
  end as payment_status
from public.bookings b
left join public.ledger l on l."bookingId" = b.id
group by b.id;

grant select on public.booking_financial_summary to authenticated;

commit;
