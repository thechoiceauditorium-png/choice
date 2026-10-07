# Security Verification & Manual Test Plan (Phase 7 Specification)

This test plan defines the manual and automated security verification procedures to validate the hardening of **The Choice Auditorium** platform.

---

## Test Suite Overview

| Test ID | Area | Objective | Method | Expected Result |
|---|---|---|---|---|
| **TEST-01** | Public Anon Access | Verify anon role is completely locked out of all 10 tables | `curl` with Anon Key | HTTP 401 / 403 or empty array `[]` on SELECT; 401/403 on INSERT/UPDATE/DELETE |
| **TEST-02** | Worker RBAC / RLS | Verify Worker role cannot write ledger, delete ledger, modify roles, or approve attendance | Authenticated REST / Web Client | Ledger insert/delete blocked; team_users role update blocked; attendance approval blocked |
| **TEST-03** | Owner RBAC / RLS | Verify Owner has operational privileges but ledger hard-delete is strictly blocked | Authenticated REST / Web Client | Writes succeed; DELETE on `ledger` fails with RLS policy violation |
| **TEST-04** | Auth Password Enforcement | Verify login rejects invalid/empty passwords for registered staff accounts | Login form & GoTrue API | Login rejected with HTTP 400 `Invalid login credentials`; no session granted |
| **TEST-05** | Client LocalStorage Tamper | Verify modifying `choice_current_user` in browser DevTools does not escalate privileges | DevTools Console injection | No elevated actions possible; server rejects requests without valid JWT claims |
| **TEST-06** | Booking Concurrency | Verify database-level exclusion constraint prevents simultaneous double bookings | Concurrent REST POST requests | First insert succeeds (201); second overlapping insert fails (409 Conflict / exclusion constraint) |
| **TEST-07** | Financial Data Constraints | Verify negative or zero amounts are rejected at database level | Direct REST POST with negative amount | HTTP 400 Bad Request / PostgreSQL check constraint violation |
| **TEST-08** | XSS Sanitization | Verify script payloads in user fields render as inert escaped text | Data injection & UI verification | Payload string displays harmlessly as literal characters; no script execution |
| **TEST-09** | Secret Hygiene Scan | Verify zero API secrets, tokens, or credentials exist in git tree or history | Git regex scan / scanner | Clean report (0 leaks detected) |

---

## Detailed Step-by-Step Test Procedures

### TEST-01: Anonymous Access Rejection (All 10 Tables)
**Objective**: Ensure unauthenticated requests cannot read, insert, modify, or drop records.
**Execution**:
Run for each table (`bookings`, `ledger`, `compliance`, `compliance_history`, `checklists`, `checklist_templates`, `attendance`, `directory`, `notifications`, `team_users`):
```bash
ANON_KEY="<YOUR_SUPABASE_ANON_KEY>"
SUPABASE_URL="https://<YOUR_PROJECT_REF>.supabase.co"

# 1. Test Read (SELECT)
curl -i -X GET "$SUPABASE_URL/rest/v1/ledger?select=*" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"

# Expected: HTTP 200 with [] (empty) OR HTTP 401 Unauthorized

# 2. Test Write (INSERT)
curl -i -X POST "$SUPABASE_URL/rest/v1/ledger" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-hack","date":"2026-10-15","type":"income","category":"Rent","amount":100}'

# Expected: HTTP 401 / 403 Forbidden (RLS policy violation)

# 3. Test Delete
curl -i -X DELETE "$SUPABASE_URL/rest/v1/ledger?id=neq.0" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"

# Expected: HTTP 401 / 403 Forbidden or 0 rows deleted
```
**Pass Criteria**: Zero rows returned or modified across all 10 tables.

---

### TEST-02: Worker Role Boundary Enforcement
**Objective**: Ensure staff accounts cannot perform owner-only operations at DB level.
**Execution**:
1. Log in as a Worker account (`gopinathan` / `sajitha`). Obtain Worker JWT token `$WORKER_JWT`.
2. Attempt to delete a transaction from `ledger`:
   ```bash
   curl -i -X DELETE "$SUPABASE_URL/rest/v1/ledger?id=eq.led-test" \
     -H "apikey: $ANON_KEY" \
     -H "Authorization: Bearer $WORKER_JWT"
   ```
   **Expected**: 401/403 or 0 rows affected (No DELETE policy).
3. Attempt to insert a transaction into `ledger`:
   ```bash
   curl -i -X POST "$SUPABASE_URL/rest/v1/ledger" \
     -H "apikey: $ANON_KEY" \
     -H "Authorization: Bearer $WORKER_JWT" \
     -H "Content-Type: application/json" \
     -d '{"id":"worker-write","date":"2026-10-15","type":"expense","category":"Maintenance","amount":500}'
   ```
   **Expected**: HTTP 403 Forbidden (RLS policy allows only owner insert/update).
4. Attempt to promote self to `owner` in `team_users`:
   ```bash
   curl -i -X PATCH "$SUPABASE_URL/rest/v1/team_users?id=eq.gopinathan" \
     -H "apikey: $ANON_KEY" \
     -H "Authorization: Bearer $WORKER_JWT" \
     -H "Content-Type: application/json" \
     -d '{"role":"owner"}'
   ```
   **Expected**: HTTP 403 Forbidden or trigger rejection.
5. Attempt to mark self attendance as approved:
   ```bash
   curl -i -X PATCH "$SUPABASE_URL/rest/v1/attendance?id=eq.att-today" \
     -H "apikey: $ANON_KEY" \
     -H "Authorization: Bearer $WORKER_JWT" \
     -H "Content-Type: application/json" \
     -d '{"approvalStatus":"Approved"}'
   ```
   **Expected**: Rejected by column-level check / trigger.

---

### TEST-03: Owner Privilege & Ledger Immutability
**Objective**: Owner can manage bookings, statutory compliance, and attendance, but cannot hard-delete ledger records.
**Execution**:
1. Log in as Owner account (`elby` / `abin`). Obtain Owner JWT token `$OWNER_JWT`.
2. Verify normal operations (booking updates, ledger inserts, attendance sign-offs) succeed.
3. Attempt to hard-delete a row from `ledger`:
   ```bash
   curl -i -X DELETE "$SUPABASE_URL/rest/v1/ledger?id=eq.any-ledger-id" \
     -H "apikey: $ANON_KEY" \
     -H "Authorization: Bearer $OWNER_JWT"
   ```
**Expected**: HTTP 403 Forbidden / 0 rows affected. Ledger supports soft-delete (`deleted_at`) only; hard delete is revoked.

---

### TEST-04: Credential & Password Enforcement
**Objective**: Ensure authentication bypass is eliminated.
**Execution**:
1. Open login page `index.html`.
2. Input registered email: `elbymathew20@gmail.com`.
3. Input wrong password: `wrongpassword123`.
4. Click **Sign In**.
5. Repeat with blank password.
**Expected**: Login fails with error notification. No token stored; user remains on `index.html`. Direct GoTrue authentication error returned.

---

### TEST-05: Client-Side LocalStorage Spoofing Defense
**Objective**: Verify UI and API do not trust unverified client localStorage.
**Execution**:
1. Open browser in Incognito mode to `dashboard.html`.
2. Open DevTools Console and execute:
   ```javascript
   localStorage.setItem("choice_current_user", JSON.stringify({
     id: "attacker",
     name: "Injected Attacker",
     role: "owner"
   }));
   ```
3. Refresh page.
**Expected**: Because no valid Supabase session exists in `supabase.auth.getSession()`, `requireAuth()` redirects to `index.html`. Even if UI is rendered, subsequent API calls lack a valid JWT and are blocked by RLS.

---

### TEST-06: Double-Booking Exclusion Constraint Race Condition
**Objective**: Prevent simultaneous conflicting reservations for the same hall time slot.
**Execution**:
Send two identical overlapping booking requests simultaneously:
```bash
PAYLOAD='{
  "id": "bk-race-1",
  "bookingNo": 9901,
  "customerName": "Client A",
  "reservationDate": "2026-11-20",
  "fromDateTime": "2026-11-20T10:00",
  "toDateTime": "2026-11-20T16:00",
  "status": "Confirmed"
}'

PAYLOAD2='{
  "id": "bk-race-2",
  "bookingNo": 9902,
  "customerName": "Client B",
  "reservationDate": "2026-11-20",
  "fromDateTime": "2026-11-20T12:00",
  "toDateTime": "2026-11-20T18:00",
  "status": "Confirmed"
}'

# Execute simultaneously in background
curl -s -X POST "$SUPABASE_URL/rest/v1/bookings" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_JWT" -H "Content-Type: application/json" -d "$PAYLOAD" &
curl -s -X POST "$SUPABASE_URL/rest/v1/bookings" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_JWT" -H "Content-Type: application/json" -d "$PAYLOAD2" &
wait
```
**Expected**: Exactly one request returns `201 Created`; the second request returns `409 Conflict` (PostgreSQL `exclusion constraint violation: no_overlapping_confirmed_bookings`).

---

### TEST-07: Financial Integrity Check Constraint
**Objective**: Verify negative amounts cannot be inserted via REST or UI.
**Execution**:
```bash
curl -i -X POST "$SUPABASE_URL/rest/v1/ledger" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $OWNER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "led-negative-test",
    "date": "2026-10-15",
    "type": "income",
    "category": "Rent",
    "amount": -5.00,
    "description": "Negative amount test"
  }'
```
**Expected**: HTTP 400 Bad Request with check constraint error (`new row for relation "ledger" violates check constraint "chk_ledger_amount_positive"`).

---

### TEST-08: Cross-Site Scripting (XSS) Sanitization
**Objective**: Confirm dynamic user content cannot break out into JavaScript execution.
**Execution**:
1. Set a staff member name in `team_users` or customer name in `bookings` to:
   ```text
   TestUser'); alert(document.domain); //
   ```
2. Open `dashboard.html`, `attendance.html`, and `bookings.html`.
3. Check attendance action buttons and customer tables.
**Expected**:
- The literal string `TestUser'); alert(document.domain); //` displays as text.
- No `alert()` dialog pops up.
- Inspection of the DOM shows HTML entities (`&quot;`, `&#039;`, `&lt;`, `&gt;`).

---

### TEST-09: Repository Secret & Hygiene Scan
**Objective**: Ensure no private keys, PATs, or service-role keys are checked in.
**Execution**:
```bash
# Check git history
git log -p --all | grep -E "service_role|sb_secret|ghp_|github_pat_"
```
**Expected**: Zero matches found.
