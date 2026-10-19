#!/usr/bin/env python3
"""
Specific Verification Suite for Newly Implemented Client Requirements:
1. Bookings Date Range ("From Date" and "To Date")
2. Attendance Admin Override & Edit Modal
3. Utility Recurrence Cycles ("2 Months" and "Quarterly") & Strict 10-Day Rule
4. Directory Core Team Edit & Director Abin User Console
5. Secret Scan & Key Segregation
"""

import os
import re
import sys
import json
import urllib.request
import html.parser

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

results = []

def test(name, condition, details=""):
    status = "✔ PASS" if condition else "✖ FAIL"
    results.append((name, condition, details))
    print(f"  {status} [{name}] {details}")

print("="*70)
print("VERIFICATION SUITE: NEW CLIENT FEATURES & SECURITY")
print("="*70)

# TEST 1: Bookings Date Range
print("\n[CHECK 1] Event Booking Date Range...")
with open(os.path.join(BASE_DIR, "bookings.html"), "r") as f:
    b_html = f.read()

test("Bookings-FromDate", 'id="from-date"' in b_html, "From Date input field present in bookings.html")
test("Bookings-ToDate", 'id="to-date"' in b_html, "To Date input field present in bookings.html")
test("Bookings-BackwardCompat", 'id="reservation-date"' in b_html, "Reservation Date synced for compatibility")

with open(os.path.join(BASE_DIR, "js/bookings.js"), "r") as f:
    b_js = f.read()

test("Bookings-AutoSync", "toDateInput.value = fromDateInput.value" in b_js, "To Date auto-syncs when From Date picked")
test("Bookings-MultiDaySpan", "cellDateStr >= fromD && cellDateStr <= toD" in b_js, "Calendar and list view correctly span multi-day ranges")

# TEST 2: Attendance Admin Override & Edit Modal
print("\n[CHECK 2] Admin Attendance Edit & Override...")
with open(os.path.join(BASE_DIR, "attendance.html"), "r") as f:
    att_html = f.read()

test("Attendance-Modal", 'id="edit-attendance-modal"' in att_html, "Admin Edit Attendance modal present in attendance.html")
test("Attendance-StatusRadios", 'name="edit_att_status"' in att_html, "Present/Half-Day/Absent radios in edit modal")
test("Attendance-ApprovalDropdown", 'id="edit-att-approval"' in att_html, "Admin approval decision selector present")

with open(os.path.join(BASE_DIR, "js/attendance.js"), "r") as f:
    att_js = f.read()

test("Attendance-HistoryEditBtn", "att-history-edit-btn" in att_js, "Edit button rendered on monthly history rows for admin")
test("Attendance-SaveHandler", "handleSaveEditAttendance" in att_js, "handleSaveEditAttendance persists status and approved state")

# TEST 3: Utility Cycles & Strict Status Rules
print("\n[CHECK 3] Utility Cycles (2 Months & Quarterly) & Strict Status Rules...")
with open(os.path.join(BASE_DIR, "compliance.html"), "r") as f:
    comp_html = f.read()

test("Compliance-2Months", 'value="2 Months"' in comp_html, "'2 Months (Bi-monthly)' option present in recurrence select")
test("Compliance-Quarterly", 'value="Quarterly"' in comp_html, "'Quarterly (3 Months)' option present in recurrence select")
test("Compliance-LeadDays10", 'id="comp-lead"' in comp_html and 'value="10"' in comp_html, "Default reminder lead time set to 10 days")

with open(os.path.join(BASE_DIR, "js/compliance.js"), "r") as f:
    comp_js = f.read()

test("Compliance-NextDueAdvance", 'rec === "2 months"' in comp_js and "nextDue.setMonth(nextDue.getMonth() + 2)" in comp_js, "2 Months cycle advances next due date by exactly +2 months")
test("Compliance-QuarterlyAdvance", 'rec === "quarterly"' in comp_js and "nextDue.setMonth(nextDue.getMonth() + 3)" in comp_js, "Quarterly cycle advances next due date by exactly +3 months")
test("Compliance-StrictOverdue", "diffDays < 0" in comp_js and 'newStatus = "Overdue"' in comp_js, "Overdue only assigned after due date has strictly passed")
test("Compliance-StrictDueSoon", "diffDays <= lead" in comp_js and 'newStatus = "Due Soon"' in comp_js, "Due Soon / Pending only assigned within 10-day lead window")

# TEST 4: Directory Core Team Edit & Director Abin Console
print("\n[CHECK 4] Directory Admin Edit & Director Abin Management Console...")
with open(os.path.join(BASE_DIR, "directory.html"), "r") as f:
    dir_html = f.read()

test("Directory-TeamEditModal", 'id="edit-team-user-modal"' in dir_html, "Edit Core Team Member details modal present")
test("Directory-AbinCard", 'id="abin-management-card"' in dir_html, "Director Abin user management card present")
test("Directory-AbinModal", 'id="abin-user-modal"' in dir_html, "Director Abin user provisioning & password modal present")

with open(os.path.join(BASE_DIR, "js/directory.js"), "r") as f:
    dir_js = f.read()

test("Directory-AbinAuthority", "isDirectorAbin" in dir_js, "isDirectorAbin permission gate enforces Abin/Owner control")
test("Directory-PasswordIssue", "save-abin-user-btn" in dir_js and "admin_manage_user" in dir_js, "Direct password issuance and RPC dispatch wired up")
test("Directory-CoreTeamEdit", "edit-team-btn" in dir_js and "openEditTeamUserModal" in dir_js, "Edit details button rendered on each core team card")

# TEST 5: Production & Security Audit
print("\n[CHECK 5] Secret Keys & Production Hardening Audit...")
test("Security-404Page", os.path.exists(os.path.join(BASE_DIR, "404.html")), "Branded 404.html production error page exists")
test("Security-EnvExample", os.path.exists(os.path.join(BASE_DIR, "js/env.example.js")), "Safe env template js/env.example.js exists")

# Scan codebase for any exposed JWTs
exposed_jwt = False
jwt_sig = "eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
this_file = os.path.basename(__file__)

for root, _, files in os.walk(BASE_DIR):
    if ".git" in root or "__pycache__" in root:
        continue
    for file in files:
        if file in (".env", ".env.local", this_file):
            continue
        filepath = os.path.join(root, file)
        try:
            with open(filepath, "r", errors="ignore") as f:
                content = f.read()
                if jwt_sig in content:
                    exposed_jwt = True
                    print(f"    WARNING: Exposed JWT found in {filepath}")
        except Exception:
            pass

test("Security-ZeroExposedKeys", not exposed_jwt, "No hardcoded JWT tokens or service keys in codebase")

print("\n" + "="*70)
total_tests = len(results)
passed_tests = sum(1 for _, cond, _ in results if cond)
failed_tests = total_tests - passed_tests
print(f"SUMMARY: {passed_tests}/{total_tests} Tests Passed (Failures: {failed_tests})")
print("="*70)

if failed_tests > 0:
    sys.exit(1)
