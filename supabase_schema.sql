-- ==============================================================================
-- THE CHOICE AUDITORIUM — PALAKKAD, KERALA
-- COMPLETE SUPABASE POSTGRESQL SCHEMA & REALTIME SETUP
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- It creates all required tables, Row Level Security (RLS) policies, Realtime publications,
-- and seeds the initial operational data.

-- 1. BOOKINGS TABLE
create table if not exists public.bookings (
  id text primary key,
  "bookingNo" bigint,
  "customerName" text not null,
  address text,
  phone1 text,
  phone2 text,
  reference text,
  "eventDesc" text,
  "reservationDate" text not null,
  "fromDateTime" text,
  "toDateTime" text,
  status text not null default 'Enquiry',
  "lineItems" jsonb default '{}'::jsonb,
  "totalAmount" numeric default 0,
  "serviceTax" numeric default 0,
  "grandTotal" numeric default 0,
  "advanceReceived" numeric default 0,
  "balanceAmount" numeric default 0,
  "balanceDueDate" text,
  signature text,
  "createdAt" timestamptz default now()
);

create index if not exists idx_bookings_date on public.bookings ("reservationDate");
create index if not exists idx_bookings_status on public.bookings (status);

-- 2. FINANCIAL LEDGER (INCOME & EXPENSE)
create table if not exists public.ledger (
  id text primary key,
  date text not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  amount numeric not null default 0,
  description text,
  "loggedBy" text,
  "bookingId" text references public.bookings(id) on delete set null,
  "createdAt" timestamptz default now()
);

create index if not exists idx_ledger_date on public.ledger (date);
create index if not exists idx_ledger_type on public.ledger (type);

-- 3. STATUTORY COMPLIANCE TRACKER
create table if not exists public.compliance (
  id text primary key,
  title text not null,
  cycle text,
  "dueDate" text not null,
  recurrence text,
  status text not null default 'Upcoming',
  "leadDays" int default 15,
  responsible text,
  notes text,
  "completedDate" text,
  "completedBy" text,
  "createdAt" timestamptz default now()
);

create index if not exists idx_compliance_duedate on public.compliance ("dueDate");

-- 4. COMPLIANCE FILING HISTORY LOG
create table if not exists public.compliance_history (
  id text primary key,
  "complianceId" text,
  title text not null,
  cycle text,
  "completedDate" text not null,
  "completedBy" text,
  "refNo" text,
  "amountPaid" numeric default 0,
  notes text,
  "createdAt" timestamptz default now()
);

-- 5. FUNCTION & ROUTINE CHECKLISTS
create table if not exists public.checklists (
  id text primary key,
  type text not null,
  title text not null,
  "bookingId" text,
  "bookingNo" bigint,
  "eventDate" text,
  period text,
  items jsonb default '[]'::jsonb,
  status text default 'In Progress',
  "createdAt" timestamptz default now()
);

-- 6. CHECKLIST TEMPLATES
create table if not exists public.checklist_templates (
  id text primary key default 'default',
  templates jsonb default '{}'::jsonb,
  "updatedAt" timestamptz default now()
);

-- 7. STAFF ATTENDANCE
create table if not exists public.attendance (
  id text primary key,
  date text not null,
  "workerId" text not null,
  "workerName" text not null,
  status text not null,
  note text,
  "markedBy" text,
  "markedAt" timestamptz default now(),
  "approvalStatus" text default 'Pending Approval',
  "approvedBy" text,
  "approvedAt" timestamptz,
  "createdAt" timestamptz default now()
);

create index if not exists idx_attendance_date on public.attendance (date);
create index if not exists idx_attendance_worker on public.attendance ("workerId");

-- 8. EMERGENCY & VENDOR DIRECTORY
create table if not exists public.directory (
  id text primary key,
  name text not null,
  role text,
  phone text,
  category text,
  notes text,
  "createdAt" timestamptz default now()
);

-- 9. NOTIFICATIONS
create table if not exists public.notifications (
  id text primary key,
  title text not null,
  message text not null,
  type text,
  time text,
  read boolean default false,
  "createdAt" timestamptz default now()
);

-- 10. TEAM USERS (ORGANIZATION PROFILES)
create table if not exists public.team_users (
  id text primary key,
  name text not null,
  role text not null,
  title text,
  phone text,
  email text,
  avatar text,
  "createdAt" timestamptz default now()
);

-- ==============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS) & PUBLIC ACCESS POLICIES
-- ==============================================================================
alter table public.bookings enable row level security;
alter table public.ledger enable row level security;
alter table public.compliance enable row level security;
alter table public.compliance_history enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.attendance enable row level security;
alter table public.directory enable row level security;
alter table public.notifications enable row level security;
alter table public.team_users enable row level security;

-- Permissive policies for anon & authenticated roles
drop policy if exists "Allow full access to bookings" on public.bookings;
create policy "Allow full access to bookings" on public.bookings for all using (true) with check (true);

drop policy if exists "Allow full access to ledger" on public.ledger;
create policy "Allow full access to ledger" on public.ledger for all using (true) with check (true);

drop policy if exists "Allow full access to compliance" on public.compliance;
create policy "Allow full access to compliance" on public.compliance for all using (true) with check (true);

drop policy if exists "Allow full access to compliance_history" on public.compliance_history;
create policy "Allow full access to compliance_history" on public.compliance_history for all using (true) with check (true);

drop policy if exists "Allow full access to checklists" on public.checklists;
create policy "Allow full access to checklists" on public.checklists for all using (true) with check (true);

drop policy if exists "Allow full access to checklist_templates" on public.checklist_templates;
create policy "Allow full access to checklist_templates" on public.checklist_templates for all using (true) with check (true);

drop policy if exists "Allow full access to attendance" on public.attendance;
create policy "Allow full access to attendance" on public.attendance for all using (true) with check (true);

drop policy if exists "Allow full access to directory" on public.directory;
create policy "Allow full access to directory" on public.directory for all using (true) with check (true);

drop policy if exists "Allow full access to notifications" on public.notifications;
create policy "Allow full access to notifications" on public.notifications for all using (true) with check (true);

drop policy if exists "Allow full access to team_users" on public.team_users;
create policy "Allow full access to team_users" on public.team_users for all using (true) with check (true);

-- ==============================================================================
-- ENABLE SUPABASE REALTIME REPLICATION FOR LIVE MULTI-DEVICE SYNC
-- ==============================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.ledger;
alter publication supabase_realtime add table public.compliance;
alter publication supabase_realtime add table public.compliance_history;
alter publication supabase_realtime add table public.checklists;
alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.directory;
alter publication supabase_realtime add table public.notifications;

-- ==============================================================================
-- SEED INITIAL DATA
-- ==============================================================================

-- Seed Initial Team Users (Role & Access Definition)
insert into public.team_users (id, name, role, title, phone, email, avatar) values
('elby', 'Elby Abin', 'owner', 'CEO', '8156810083', 'elbymathew20@gmail.com', 'EA'),
('abin', 'Abin Varghese K', 'owner', 'Director', '9895058282', 'abin@choiceauditorium.com', 'AV'),
('vibin', 'Vibin Varghese K', 'owner', 'Director', '9447600791', 'vibinkgl@gmail.com', 'VV'),
('gopinathan', 'Gopinathan P', 'worker', 'Manager', '8848649672', 'gopinathan@choiceauditorium.com', 'GP'),
('sajitha', 'Sajitha', 'worker', 'Assistant', '8848614356', 'sajitha@choiceauditorium.com', 'SJ')
on conflict (id) do nothing;

