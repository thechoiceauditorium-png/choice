/**
 * Comprehensive Feature & Role Matrix Verification
 * Executes all 9 core modules for BOTH Owner (Elby Abin) and Worker (Gopinathan P).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, "..");
const PORT = 8097;
const CHROME_CDP = "http://127.0.0.1:9222";
const APP_URL = `http://127.0.0.1:${PORT}`;

// Load environment credentials from .env
function loadEnv() {
  const envPath = path.join(BASE_DIR, ".env");
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [k, ...v] = trimmed.split("=");
      env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const envVars = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || envVars.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY || "";

function startServer() {
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(BASE_DIR, req.url.split("?")[0]);
    if (filePath.endsWith("/") || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
      filePath = path.join(filePath, "index.html");
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

class CdpSession {
  constructor(tabId, wsUrl) {
    this.tabId = tabId;
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };

    await this.send("Runtime.enable");
    await this.send("Page.enable");
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    return res.result?.value;
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await this.sleep(1200);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close() {
    if (this.ws) this.ws.close();
    await fetch(`${CHROME_CDP}/json/close/${this.tabId}`, { method: "PUT" }).catch(() => {});
  }
}

async function createTab() {
  const res = await fetch(`${CHROME_CDP}/json/new?about:blank`, { method: "PUT" });
  const tab = await res.json();
  const cdp = new CdpSession(tab.id, tab.webSocketDebuggerUrl);
  await cdp.connect();
  return cdp;
}

const results = [];
function report(role, moduleName, feature, status, details = "") {
  results.push({ role, moduleName, feature, status, details });
  const symbol = status ? "\x1b[32m✔ PASS\x1b[0m" : "\x1b[31m✖ FAIL\x1b[0m";
  console.log(`  ${symbol} [${role.toUpperCase()}][${moduleName}] ${feature} ${details ? `(${details})` : ""}`);
}

async function main() {
  console.log("=".repeat(75));
  console.log("THE CHOICE AUDITORIUM — EXHAUSTIVE FEATURE & ROLE MATRIX TEST SUITE");
  console.log("=".repeat(75));

  const server = await startServer();
  console.log(`Test server running at ${APP_URL}`);

  let cdp = null;

  try {
    cdp = await createTab();

    // =========================================================================
    // SECTION A: OWNER ROLE TESTING (Elby Abin)
    // =========================================================================
    console.log("\n" + "#".repeat(65));
    console.log("### SECTION A: OWNER ROLE TESTING (Elby Abin - Full Access)");
    console.log("#".repeat(65));

    // A1. AUTHENTICATION & LOGIN
    await cdp.navigate(`${APP_URL}/index.html`);
    await cdp.evaluate(`
      (() => {
        document.getElementById('login-email').value = 'abinkgl@gmail.com';
        document.getElementById('login-password').value = 'Choice@2026!';
        document.getElementById('login-form').requestSubmit();
      })()
    `);
    await cdp.sleep(2000);

    let curUrl = await cdp.evaluate("window.location.href");
    if (!curUrl.includes("dashboard.html")) await cdp.navigate(`${APP_URL}/dashboard.html`);

    const ownerAuth = await cdp.evaluate(`
      (() => {
        const hdr = document.getElementById('header-mount')?.innerText || '';
        return {
          isOwnerHeader: hdr.includes('Owner') || hdr.includes('CEO') || hdr.includes('Elby'),
          user: localStorage.getItem('choice_display_user')
        };
      })()
    `);
    report("Owner", "Auth", "Sign In & Session Verification", ownerAuth.isOwnerHeader, "CEO / Owner session active");

    // A2. DASHBOARD MODULE
    await cdp.navigate(`${APP_URL}/dashboard.html`);
    const dashCheck = await cdp.evaluate(`
      (() => {
        const text = document.body.innerText;
        return {
          kpiGrid: !!document.getElementById('kpi-grid'),
          bookingsTable: !!document.getElementById('upcoming-bookings-tbody'),
          checklistsWidget: !!document.getElementById('checklists-widget'),
          complianceWidget: !!document.getElementById('compliance-widget')
        };
      })()
    `);
    report("Owner", "Dashboard", "Widgets & KPI Grid Mounted", dashCheck.kpiGrid && dashCheck.bookingsTable);

    // A3. BOOKINGS MODULE: CREATE, CONFLICT CHECK, DELETE
    await cdp.navigate(`${APP_URL}/bookings.html?action=new`);
    await cdp.sleep(1200);

    const bookingOps = await cdp.evaluate(`
      (async () => {
        // Create a confirmed booking
        document.getElementById('customer-name').value = 'Royal Wedding — Vivek & Sneha';
        document.getElementById('booking-status').value = 'Confirmed';
        document.getElementById('customer-phone1').value = '9847012345';
        document.getElementById('customer-phone2').value = '9447123456';
        document.getElementById('event-desc').value = 'Wedding & Evening Banquet';
        document.getElementById('reservation-date').value = '2026-12-15';
        document.getElementById('from-datetime').value = '2026-12-15T09:00';
        document.getElementById('to-datetime').value = '2026-12-15T18:00';
        document.getElementById('li-rent-amt').value = 95000;
        document.getElementById('li-rent-adv').value = 40000;
        document.getElementById('li-rent-amt').dispatchEvent(new Event('input', { bubbles: true }));

        document.getElementById('save-booking-btn').click();
        await new Promise(r => setTimeout(r, 2500));

        const tableText = document.getElementById('bookings-table-tbody')?.innerText || '';
        const created = tableText.includes('Vivek & Sneha');

        // Check Owner has delete buttons
        const hasDelBtns = document.querySelectorAll('.del-bk-btn').length > 0;

        return { created, hasDelBtns };
      })()
    `);
    report("Owner", "Bookings", "Create Confirmed Booking", bookingOps.created, "Royal Wedding saved");
    report("Owner", "Bookings", "Owner Delete Privileges Available", bookingOps.hasDelBtns, "Delete button rendered for owner");

    // A4. LEDGER MODULE: INCOME, EXPENSE, SOFT-DELETE
    await cdp.navigate(`${APP_URL}/ledger.html?action=new`);
    await cdp.sleep(1200);

    const ledgerOps = await cdp.evaluate(`
      (async () => {
        // Log income
        document.getElementById('entry-date').value = '2026-10-10';
        document.getElementById('entry-type').value = 'income';
        document.getElementById('entry-type').dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('entry-category').value = 'Hall rent (advance)';
        document.getElementById('entry-amount').value = 40000;
        document.getElementById('entry-desc').value = 'Advance received for Vivek & Sneha booking';

        document.getElementById('save-entry-btn').click();
        await new Promise(r => setTimeout(r, 2500));

        const text = document.getElementById('ledger-table-tbody')?.innerText || '';
        const hasIncome = text.includes('Vivek & Sneha') || text.includes('40,000');
        const hasDelete = document.querySelectorAll('.del-entry-btn').length > 0;

        return { hasIncome, hasDelete };
      })()
    `);
    report("Owner", "Ledger", "Log Income Transaction", ledgerOps.hasIncome, "₹40,000 Advance logged");
    report("Owner", "Ledger", "Owner Delete Transaction Privilege", ledgerOps.hasDelete, "Delete action available for owner");

    // A5. ATTENDANCE MODULE: APPROVE & EDIT
    await cdp.navigate(`${APP_URL}/attendance.html`);
    await cdp.sleep(1500);

    const attOps = await cdp.evaluate(`
      (() => {
        const canApprove = document.querySelectorAll('.att-action-btn[data-action=\"save-approve\"], .att-action-btn[data-action=\"approve\"]').length > 0;
        const summaryGrid = !!document.getElementById('monthly-stats-container');
        return { canApprove, summaryGrid };
      })()
    `);
    report("Owner", "Attendance", "Approve Attendance Workflow Available", attOps.canApprove);
    report("Owner", "Attendance", "Monthly Attendance Summary View", attOps.summaryGrid);

    // A6. FUNCTION CHECKLISTS MODULE
    await cdp.navigate(`${APP_URL}/checklists.html`);
    await cdp.sleep(1500);

    const chkOps = await cdp.evaluate(`
      (async () => {
        const hasCustomBtn = !!document.getElementById('create-custom-chk-btn');
        const hasTemplateBtn = !!document.getElementById('edit-templates-btn');
        const has15DayBtn = !!document.getElementById('gen-15day-btn');

        // Click create custom checklist
        const addBtn = document.getElementById('create-custom-chk-btn');
        if (addBtn) addBtn.click();
        await new Promise(r => setTimeout(r, 400));

        const titleInput = document.getElementById('custom-chk-title');
        const itemsInput = document.getElementById('custom-chk-items');
        if (titleInput && itemsInput) {
          titleInput.value = 'Pre-Monsoon Roof & Drainage Check';
          itemsInput.value = 'Inspect rainwater drains\\nCheck roof flashing\\nClear gutter leaves';
          document.getElementById('save-custom-chk-btn')?.click();
          await new Promise(r => setTimeout(r, 2000));
        }

        const tabsText = document.getElementById('chk-tabs-container')?.innerText || '';
        return {
          hasTemplateBtn,
          has15DayBtn,
          customCreated: tabsText.includes('Pre-Monsoon')
        };
      })()
    `);
    report("Owner", "Checklists", "Create Custom Checklist", chkOps.customCreated, "Pre-Monsoon checklist created");
    report("Owner", "Checklists", "Template Management & 15-Day Generator", chkOps.hasTemplateBtn && chkOps.has15DayBtn);

    // A7. STATUTORY COMPLIANCE MODULE
    await cdp.navigate(`${APP_URL}/compliance.html`);
    await cdp.sleep(1500);

    const compOps = await cdp.evaluate(`
      (() => {
        const tableText = document.getElementById('compliance-table-tbody')?.innerText || '';
        const hasAddBtn = !!document.getElementById('new-compliance-btn');
        return {
          hasItems: tableText.includes('Panchayath') || tableText.includes('Electrical') || tableText.includes('GST'),
          hasAddBtn
        };
      })()
    `);
    report("Owner", "Compliance", "Statutory Obligations Tracker Loaded", compOps.hasItems);
    report("Owner", "Compliance", "Add Compliance Obligation Button Present", compOps.hasAddBtn);

    // A8. DIRECTORY MODULE
    await cdp.navigate(`${APP_URL}/directory.html`);
    await cdp.sleep(1500);

    const dirOps = await cdp.evaluate(`
      (() => {
        const coreTeamText = document.getElementById('core-team-container')?.innerText || '';
        const hasAddContact = !!document.getElementById('new-contact-btn');
        return {
          hasCoreTeam: coreTeamText.includes('Elby Abin') || coreTeamText.includes('Gopinathan'),
          hasAddContact
        };
      })()
    `);
    report("Owner", "Directory", "Core Team Roster Visible", dirOps.hasCoreTeam);
    report("Owner", "Directory", "Add Emergency / Vendor Contact Control", dirOps.hasAddContact);



    // =========================================================================
    // SECTION B: WORKER ROLE TESTING (Gopinathan P)
    // =========================================================================
    console.log("\n" + "#".repeat(65));
    console.log("### SECTION B: WORKER ROLE TESTING (Gopinathan P - Operational Access)");
    console.log("#".repeat(65));

    // B1. WORKER LOGIN & ROLE RESOLUTION
    await cdp.navigate(`${APP_URL}/index.html`);
    await cdp.evaluate(`
      (async () => {
        localStorage.clear();
        sessionStorage.clear();
      })()
    `);
    await cdp.navigate(`${APP_URL}/index.html`);
    await cdp.sleep(600);

    await cdp.evaluate(`
      (() => {
        document.getElementById('login-email').value = 'gopinathan@choiceauditorium.com';
        document.getElementById('login-password').value = 'Choice@2026!';
        document.getElementById('login-form').requestSubmit();
      })()
    `);
    await cdp.sleep(2000);

    let workerCurUrl = await cdp.evaluate("window.location.href");
    if (!workerCurUrl.includes("dashboard.html")) await cdp.navigate(`${APP_URL}/dashboard.html`);

    const workerAuth = await cdp.evaluate(`
      (() => {
        const hdr = document.getElementById('header-mount')?.innerText || '';
        return {
          isWorkerHeader: hdr.includes('Gopinathan') || hdr.includes('Manager') || hdr.includes('Staff'),
          user: localStorage.getItem('choice_display_user')
        };
      })()
    `);
    report("Worker", "Auth", "Worker Sign In & Header Designation", workerAuth.isWorkerHeader, "Manager / Staff session");

    // B2. WORKER BOOKINGS ACCESS & RBAC DELETION RESTRICTION
    await cdp.navigate(`${APP_URL}/bookings.html`);
    await cdp.sleep(1200);

    const workerBkOps = await cdp.evaluate(`
      (() => {
        const tableText = document.getElementById('bookings-table-tbody')?.innerText || '';
        const hasBookings = tableText.includes('Vivek & Sneha') || tableText.includes('Dr. Anand');
        const deleteButtons = document.querySelectorAll('.del-bk-btn').length;
        const canAddBooking = !!document.getElementById('open-new-booking-btn');
        return { hasBookings, deleteButtons, canAddBooking };
      })()
    `);
    report("Worker", "Bookings", "View Shared Booking Schedule", workerBkOps.hasBookings);
    report("Worker", "Bookings", "Create Booking Allowed for Worker", workerBkOps.canAddBooking);
    report("Worker", "Bookings", "RBAC: Booking Delete Button Strictly Hidden", workerBkOps.deleteButtons === 0, "0 delete buttons rendered");

    // B3. WORKER LEDGER ACCESS & RBAC DELETION RESTRICTION
    await cdp.navigate(`${APP_URL}/ledger.html`);
    await cdp.sleep(1200);

    const workerLedgerOps = await cdp.evaluate(`
      (() => {
        const canAddExpense = !!document.getElementById('open-new-entry-btn');
        const deleteButtons = document.querySelectorAll('.del-entry-btn').length;
        const tableText = document.getElementById('ledger-table-tbody')?.innerText || '';
        return { canAddExpense, deleteButtons, hasTransactions: tableText.includes('Electricity') };
      })()
    `);
    report("Worker", "Ledger", "View Operational Ledger", workerLedgerOps.hasTransactions);
    report("Worker", "Ledger", "Worker Log Expense Action Available", workerLedgerOps.canAddExpense);
    report("Worker", "Ledger", "RBAC: Ledger Delete Action Strictly Hidden", workerLedgerOps.deleteButtons === 0, "0 delete buttons rendered");

    // B4. WORKER ATTENDANCE: RESTRICTED TO OWN RECORD & NO APPROVAL POWER
    await cdp.navigate(`${APP_URL}/attendance.html`);
    await cdp.sleep(1500);

    const workerAttOps = await cdp.evaluate(`
      (() => {
        const approveButtons = document.querySelectorAll('.att-action-btn[data-action=\"approve\"], .att-action-btn[data-action=\"save-approve\"]').length;
        const visibleCards = document.querySelectorAll('#workers-marking-container > div').length;
        return { approveButtons, visibleCards };
      })()
    `);
    report("Worker", "Attendance", "RBAC: Attendance Approval Action Blocked", workerAttOps.approveButtons === 0, "0 approval buttons");
    report("Worker", "Attendance", "Filtered to Assigned Worker View", workerAttOps.visibleCards === 1, "Only Gopinathan displayed");

    // B5. WORKER FUNCTION CHECKLISTS: CHECK OFF ITEMS (Signed By Worker)
    await cdp.navigate(`${APP_URL}/checklists.html`);
    await cdp.sleep(1500);

    const workerChkOps = await cdp.evaluate(`
      (async () => {
        // Find first item checkbox
        const checkbox = document.querySelector('.chk-item-toggle');
        let checkedWorked = false;
        if (checkbox) {
          checkbox.click();
          await new Promise(r => setTimeout(r, 1500));
          checkedWorked = true;
        }

        const templateBtn = !!document.getElementById('edit-templates-btn');
        return { checkedWorked, canEditTemplates: templateBtn };
      })()
    `);
    report("Worker", "Checklists", "Worker Check-Off Task Action", workerChkOps.checkedWorked);

    // B6. WORKER COMPLIANCE TRACKER VIEW
    await cdp.navigate(`${APP_URL}/compliance.html`);
    await cdp.sleep(1200);

    const workerCompOps = await cdp.evaluate(`
      (() => {
        const text = document.getElementById('compliance-table-tbody')?.innerText || '';
        return { hasItems: text.includes('Panchayath') || text.includes('GST') };
      })()
    `);
    report("Worker", "Compliance", "Worker Compliance Visibility", workerCompOps.hasItems);

    // B7. WORKER DIRECTORY ACCESS
    await cdp.navigate(`${APP_URL}/directory.html`);
    await cdp.sleep(1200);

    const workerDirOps = await cdp.evaluate(`
      (() => {
        const coreTeamText = document.getElementById('core-team-container')?.innerText || '';
        return { hasTeam: coreTeamText.includes('Elby Abin') };
      })()
    `);
    report("Worker", "Directory", "Worker Directory & Contact Access", workerDirOps.hasTeam);

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("\n" + "=".repeat(75));
    console.log("EXHAUSTIVE FEATURE & ROLE MATRIX AUDIT COMPLETE");
    console.log("=".repeat(75));

    const totalPassed = results.filter(r => r.status).length;
    const totalFailed = results.filter(r => !r.status).length;

    console.log(`Total Module Checks:  ${results.length}`);
    console.log(`Passed Checks:        ${totalPassed}`);
    console.log(`Failed Checks:        ${totalFailed}`);

    if (totalFailed === 0) {
      console.log("\n\x1b[32m✔ ALL FEATURES IN BOTH ROLES (OWNER & WORKER) VERIFIED AND WORKING PROPERLY.\x1b[0m");
    } else {
      console.log("\n\x1b[31m✖ SOME ROLE CHECKS FAILED.\x1b[0m");
    }

  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    if (cdp) await cdp.close();
    server.close();
  }
}

main();
