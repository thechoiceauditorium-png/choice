# Database Backup & Recovery Procedure

Before applying any schema modifications or migrations to Supabase (`kaxcbzdogwrfbndsnqff`), a full physical and logical snapshot of the database must be secured.

---

## 1. Supabase Dashboard UI Backup Method

### Step-by-Step Dashboard Path:
1. Log in to the [Supabase Management Console](https://supabase.com/dashboard).
2. Select project **Choice Auditorium** (`kaxcbzdogwrfbndsnqff`).
3. In the left navigation menu, navigate to:
   **Project Settings** (gear icon at bottom left) ➔ **Database** ➔ scroll to **Backups**.
   - Or directly visit:  
     `https://supabase.com/dashboard/project/kaxcbzdogwrfbndsnqff/database/backups/scheduled`
4. Review available automated daily backups under **Scheduled Backups**.
5. If on Pro plan with Point-in-Time-Recovery (PITR), verify that PITR is active.
6. For individual table exports:
   - Go to **Table Editor** ➔ Select table (`bookings`, `ledger`, `compliance`, etc.) ➔ Click **Export** (top right) ➔ **Export to CSV**.

---

## 2. CLI / pg_dump Command Method (Recommended for Complete SQL Snapshot)

Run the following command from a terminal with PostgreSQL client tools (`pg_dump`) installed.

### Option A: Direct PostgreSQL Connection
```bash
# Set your database password
export PGPASSWORD="<YOUR_DATABASE_PASSWORD>"

# Run pg_dump (Exports schema, DDL, data, and constraints)
pg_dump \
  -h db.kaxcbzdogwrfbndsnqff.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -F p \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  -f "choice_prod_backup_$(date +%Y%m%d_%H%M%S).sql"
```

### Option B: Connection Pooling (Port 6543 / Session Mode)
If direct connection (port 5432) is restricted by IPv6/ISP:
```bash
pg_dump \
  "postgresql://postgres.kaxcbzdogwrfbndsnqff:<YOUR_DATABASE_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require" \
  -F p \
  --clean \
  --if-exists \
  -f "choice_pooler_backup_$(date +%Y%m%d_%H%M%S).sql"
```

### Option C: Supabase CLI
```bash
# Login and link project
supabase login
supabase link --project-ref kaxcbzdogwrfbndsnqff

# Dump both schema and data
supabase db dump --project-ref kaxcbzdogwrfbndsnqff -f "choice_schema_$(date +%Y%m%d).sql"
supabase db dump --project-ref kaxcbzdogwrfbndsnqff --data-only -f "choice_data_$(date +%Y%m%d).sql"
```

---

## 3. Pre-Migration Verification Checklist
- [ ] Backup file size is greater than 0 KB and contains all 10 tables (`bookings`, `ledger`, `compliance`, `compliance_history`, `checklists`, `checklist_templates`, `attendance`, `directory`, `notifications`, `team_users`).
- [ ] Database password and backup file stored in secure location.
- [ ] Test migration applied on a staging / development Supabase project first.

---

## 4. Emergency Restore Procedure

If a migration fails or corrupts state:
```bash
export PGPASSWORD="<YOUR_DATABASE_PASSWORD>"
psql -h db.kaxcbzdogwrfbndsnqff.supabase.co -p 5432 -U postgres -d postgres -f choice_prod_backup_<TIMESTAMP>.sql
```
