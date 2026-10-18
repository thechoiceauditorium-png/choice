-- ==============================================================================
-- THE CHOICE AUDITORIUM — DIRECTOR ABIN CENTRAL USER & PASSWORD MANAGEMENT
-- Enables Director Abin (or Owner) to provision new users, assign roles,
-- and set/change passwords directly without requiring email reset OTPs.
-- ==============================================================================

create extension if not exists "pgcrypto";

create or replace function public.admin_manage_user(
  p_email text,
  p_password text,
  p_name text,
  p_role text default 'worker',
  p_title text default 'Staff',
  p_phone text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid;
  v_encrypted_pw text;
  v_slug_id text;
  v_caller_email text;
  v_is_authorized boolean := false;
begin
  -- Retrieve caller identity from auth.jwt()
  v_caller_email := coalesce(auth.jwt() ->> 'email', '');
  
  if public.is_owner() or lower(v_caller_email) ilike '%abin%' then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Unauthorized: Only Director Abin or System Administrator can create or modify credentials.';
  end if;

  if p_email is null or length(trim(p_email)) < 3 then
    raise exception 'Invalid email address provided.';
  end if;

  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters long.';
  end if;

  -- Generate blowfish password hash
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));
  v_slug_id := lower(regexp_replace(split_part(trim(p_email), '@', 1), '[^a-zA-Z0-9]', '', 'g'));

  -- Check if user exists in auth.users
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));

  if v_user_id is not null then
    -- Update existing user credentials & server-verified role
    update auth.users
    set
      encrypted_password = v_encrypted_pw,
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', lower(p_role),
        'provider', 'email',
        'providers', array['email']
      ),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'name', p_name,
        'phone', p_phone,
        'title', p_title
      ),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    where id = v_user_id;
  else
    -- Create new user account directly in auth.users
    v_user_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      lower(trim(p_email)),
      v_encrypted_pw,
      now(),
      jsonb_build_object(
        'role', lower(p_role),
        'provider', 'email',
        'providers', array['email']
      ),
      jsonb_build_object(
        'name', p_name,
        'phone', p_phone,
        'title', p_title
      ),
      now(),
      now(),
      'authenticated',
      'authenticated'
    );
  end if;

  -- Synchronize with public.team_users
  insert into public.team_users (
    id, name, role, title, phone, email, avatar, auth_user_id, "createdAt"
  ) values (
    v_slug_id,
    p_name,
    lower(p_role),
    p_title,
    p_phone,
    lower(trim(p_email)),
    upper(substring(coalesce(p_name, 'U') from 1 for 2)),
    v_user_id,
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    role = excluded.role,
    title = excluded.title,
    phone = excluded.phone,
    email = excluded.email,
    avatar = excluded.avatar,
    auth_user_id = excluded.auth_user_id;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'email', lower(trim(p_email)),
    'role', lower(p_role),
    'name', p_name
  );
end;
$$;

grant execute on function public.admin_manage_user to authenticated;

-- ==============================================================================
-- PRODUCTION PERFORMANCE INDEXES (SUPABASE VIBE CODING MASTER CHECKLIST)
-- ==============================================================================
create index if not exists idx_bookings_dates on public.bookings ("fromDateTime", "toDateTime");
create index if not exists idx_bookings_status on public.bookings (status);
create index if not exists idx_attendance_date_worker on public.attendance (date, "workerId");
create index if not exists idx_compliance_due_status on public.compliance ("dueDate", status);
create index if not exists idx_compliance_hist_comp_date on public.compliance_history ("complianceId", "completedDate");
create index if not exists idx_checklists_status_date on public.checklists (status, "eventDate");

