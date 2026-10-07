# Staff Provisioning & Role Management Guide (Supabase Auth)

This guide documents how to provision staff accounts in Supabase Auth GoTrue, assign server-verified roles in `app_metadata`, and link them to existing rows in `public.team_users`.

---

## 1. Existing Team Roster in `public.team_users`

Run this query in your Supabase SQL Editor to inspect existing team members:
```sql
select id, name, role, title, email, auth_user_id from public.team_users;
```

Expected records:
- `elby` — Elby Abin — `elbymathew20@gmail.com` (Target Role: `owner`)
- `abin` — Abin Varghese K — `abin@choiceauditorium.com` (Target Role: `owner`)
- `vibin` — Vibin Varghese K — `vibinkgl@gmail.com` (Target Role: `owner`)
- `gopinathan` — Gopinathan P — `gopinathan@choiceauditorium.com` (Target Role: `worker`)
- `sajitha` — Sajitha — `sajitha@choiceauditorium.com` (Target Role: `worker`)

---

## 2. Provisioning User Accounts in Supabase Auth

### Method A: Via Supabase Dashboard (Recommended)
1. Go to **Authentication** ➔ **Users** in the Supabase Dashboard:  
   `https://supabase.com/dashboard/project/kaxcbzdogwrfbndsnqff/auth/users`
2. Click **Add user** ➔ **Create user**.
3. Enter email (e.g., `elbymathew20@gmail.com`) and a strong, unique password.
4. Check **Auto Confirm User?** so the user can log in immediately without email confirmation.
5. Repeat for each staff member.

---

## 3. Setting Server-Side Roles in `app_metadata`

> [!IMPORTANT]
> Roles MUST be stored in `raw_app_meta_data`, NOT `raw_user_meta_data`.  
> `raw_app_meta_data` can only be modified by the service role / database administrator and is signed directly into the user's JWT. Clients cannot forge or tamper with it.

Run the following SQL in the Supabase SQL Editor to assign roles:

```sql
-- Assign Owner Roles
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "owner"}'::jsonb
where email in (
  'elbymathew20@gmail.com',
  'abin@choiceauditorium.com',
  'vibinkgl@gmail.com'
);

-- Assign Worker Roles
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "worker"}'::jsonb
where email in (
  'gopinathan@choiceauditorium.com',
  'sajitha@choiceauditorium.com'
);
```

---

## 4. Linking Auth Users to `team_users.auth_user_id`

Once users are created in Supabase Auth, run this SQL script to link each `team_users` row to its corresponding `auth.users(id)`:

```sql
-- Link by exact case-insensitive email match
update public.team_users tu
set auth_user_id = au.id
from auth.users au
where lower(tu.email) = lower(au.email);
```

---

## 5. Verification & Integrity Check

Run this verification query to confirm all team members have been linked:

```sql
select
  tu.id as team_id,
  tu.name,
  tu.role as table_role,
  au.raw_app_meta_data->>'role' as jwt_role,
  tu.email,
  tu.auth_user_id,
  case
    when tu.auth_user_id is null then 'MISSING AUTH LINK'
    when tu.role <> (au.raw_app_meta_data->>'role') then 'ROLE MISMATCH'
    else 'OK'
  end as status
from public.team_users tu
left join auth.users au on tu.auth_user_id = au.id;
```

**Target Output**: All 5 rows must display status `'OK'`, with matching `table_role` and `jwt_role`.
