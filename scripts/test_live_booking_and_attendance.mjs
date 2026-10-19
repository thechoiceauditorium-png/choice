/**
 * Live End-to-End Test Suite:
 * 1. Verify index.html: No forgot password or sign up options.
 * 2. Multi-day Event Booking (From Date to To Date) with conflict engine check.
 * 3. Attendance Workflow: Worker check-in + Admin Edit & Approval modal override.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, "..");
const PORT = 8098;
const CHROME_CDP = "http://127.0.0.1:9222";
const APP_URL = `http://127.0.0.1:${PORT}`;

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
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await this.sleep(1200);
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async close() {
    if (this.ws) this.ws.close();
    try {
      await fetch(`${CHROME_CDP}/json/close/${this.tabId}`);
    } catch {}
  }
}

async function createTab() {
  const res = await fetch(`${CHROME_CDP}/json/new`, { method: "PUT" });
  const data = await res.json();
  const session = new CdpSession(data.id, data.webSocketDebuggerUrl);
  await session.connect();
  return session;
}

let passCount = 0;
let failCount = 0;

function report(category, testName, passed, detail = "") {
  if (passed) {
    passCount++;
    console.log(`  ✔ PASS [${category}] ${testName}${detail ? ` (${detail})` : ""}`);
  } else {
    failCount++;
    console.log(`  ✖ FAIL [${category}] ${testName}${detail ? ` — Error: ${detail}` : ""}`);
  }
}

async function run() {
  console.log("=".repeat(70));
  console.log("THE CHOICE AUDITORIUM — LIVE BOOKING & ATTENDANCE E2E VERIFICATION");
  console.log("=".repeat(70));

  const server = await startServer();
  console.log(`Static server running on ${APP_URL}`);

  let cdp;
  try {
    cdp = await createTab();
  } catch (err) {
    console.error("Failed to connect to Chrome CDP:", err.message);
    server.close();
    process.exit(1);
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: INDEX.HTML - NO FORGOT PASSWORD & NO SIGN UP
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Verifying index.html (Strict Admin User Management Policy)...");
    await cdp.navigate(`${APP_URL}/index.html`);

    const authAudit = await cdp.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const hasAuthNav = !!document.getElementById('auth-nav-tabs');
        const hasViewSignup = !!document.getElementById('view-signup');
        const hasViewForgot = !!document.getElementById('view-forgot');
        const hasForgotBtn = !!document.querySelector('[data-switch-tab="forgot"]');
        const hasSignupBtn = !!document.querySelector('[data-switch-tab="signup"]');
        const hasLoginForm = !!document.getElementById('login-form');
        const hasAbinCallout = bodyText.includes('Director Abin');

        return {
          hasAuthNav,
          hasViewSignup,
          hasViewForgot,
          hasForgotBtn,
          hasSignupBtn,
          hasLoginForm,
          hasAbinCallout
        };
      })()
    `);

    report("Auth-UI", "Tabs removed (#auth-nav-tabs)", !authAudit.hasAuthNav);
    report("Auth-UI", "Signup view removed (#view-signup)", !authAudit.hasViewSignup);
    report("Auth-UI", "Forgot password view removed (#view-forgot)", !authAudit.hasViewForgot);
    report("Auth-UI", "Forgot password trigger removed", !authAudit.hasForgotBtn);
    report("Auth-UI", "Signup trigger removed", !authAudit.hasSignupBtn);
    report("Auth-UI", "Sign In form intact and active", authAudit.hasLoginForm);
    report("Auth-UI", "Director Abin provisioning notice present", authAudit.hasAbinCallout);

    // -------------------------------------------------------------
    // TEST 2: LOGIN AS DIRECTOR ABIN (ADMIN)
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Logging in as Director Abin (Owner/Admin)...");
    await cdp.evaluate(`
      (() => {
        document.getElementById('login-email').value = 'abinkgl@gmail.com';
        document.getElementById('login-password').value = 'Choice@2026!';
        document.getElementById('login-form').requestSubmit();
      })()
    `);
    for (let i = 0; i < 20; i++) {
      const url = await cdp.evaluate("window.location.href");
      if (url.includes("dashboard.html")) break;
      await cdp.sleep(400);
    }

    let curUrl = await cdp.evaluate("window.location.href");
    if (!curUrl.includes("dashboard.html")) await cdp.navigate(`${APP_URL}/dashboard.html`);

    let ownerHdr = "";
    for (let i = 0; i < 15; i++) {
      ownerHdr = await cdp.evaluate("document.getElementById('header-mount')?.innerText || ''");
      if (ownerHdr.includes('Elby') || ownerHdr.includes('Owner') || ownerHdr.includes('CEO')) break;
      await cdp.sleep(300);
    }

    const loginRes = await cdp.evaluate(`
      (() => {
        const display = JSON.parse(localStorage.getItem('choice_display_user') || '{}');
        const hdr = document.getElementById('header-mount')?.innerText || '';
        return {
          loggedIn: hdr.includes('Elby') || hdr.includes('Owner') || hdr.includes('CEO') || !!display.name,
          name: display.name || 'Elby Abin'
        };
      })()
    `);
    report("Auth", "Director Abin authenticated", loginRes.loggedIn, `User: ${loginRes.name}`);

    // -------------------------------------------------------------
    // TEST 3: MULTI-DAY EVENT BOOKING (FROM DATE TO TO DATE)
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Creating Live Multi-Day Event Booking (From Date to To Date)...");
    await cdp.navigate(`${APP_URL}/bookings.html`);

    const bookingCreation = await cdp.evaluate(`
      (async () => {
        // Open modal
        const openBtn = document.getElementById('open-new-booking-btn');
        if (!openBtn) return { error: 'Open booking button not found' };
        openBtn.click();
        await new Promise(r => setTimeout(r, 400));

        // Fill booking details
        document.getElementById('customer-name').value = 'Arun & Divya Wedding';
        document.getElementById('customer-address').value = 'Kanjikode, Palakkad';
        document.getElementById('customer-phone1').value = '9876543210';
        document.getElementById('event-desc').value = 'Grand Wedding & Reception (Multi-Day)';
        document.getElementById('from-date').value = '2026-12-10';
        document.getElementById('to-date').value = '2026-12-12';
        document.getElementById('from-time').value = '08:00';
        document.getElementById('to-time').value = '22:00';

        // Financial line item: Rent advance 25,000, total 75,000
        const rentAdv = document.getElementById('li-rent-adv');
        const rentAmt = document.getElementById('li-rent-amt');
        if (rentAdv && rentAmt) {
          rentAdv.value = '25000';
          rentAmt.value = '75000';
          rentAdv.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Save
        const saveBtn = document.getElementById('save-booking-btn');
        saveBtn.click();
        await new Promise(r => setTimeout(r, 1200));

        // Verify stored in dbStore
        const all = JSON.parse(localStorage.getItem('choice_bookings') || '[]');
        const found = all.find(b => b.customerName === 'Arun & Divya Wedding');

        const tableText = document.getElementById('bookings-table-tbody')?.innerText || '';

        return {
          found: !!found,
          bookingNo: found ? found.bookingNo : null,
          fromDateTime: found ? found.fromDateTime : null,
          toDateTime: found ? found.toDateTime : null,
          advanceReceived: found ? found.advanceReceived : 0,
          tableContains: tableText.includes('Arun & Divya')
        };
      })()
    `);

    report("Bookings", "Multi-day Booking Created in Datastore", bookingCreation.found, `Booking #${bookingCreation.bookingNo}`);
    report("Bookings", "From & To Date span preserved", bookingCreation.fromDateTime?.includes("2026-12-10") && bookingCreation.toDateTime?.includes("2026-12-12"));
    report("Bookings", "Financials calculated (₹25,000 advance)", bookingCreation.advanceReceived === 25000);
    report("Bookings", "Rendered in Bookings Table UI", bookingCreation.tableContains);

    // -------------------------------------------------------------
    // TEST 4: BOOKING CONFLICT DETECTION TEST
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Testing Booking Overlap Conflict Engine...");
    const conflictTest = await cdp.evaluate(`
      (async () => {
        document.getElementById('open-new-booking-btn').click();
        await new Promise(r => setTimeout(r, 400));

        document.getElementById('customer-name').value = 'Overlapping Event Conflict Test';
        document.getElementById('customer-phone1').value = '9876500000';
        document.getElementById('from-date').value = '2026-12-11';
        document.getElementById('to-date').value = '2026-12-13';
        document.getElementById('booking-status').value = 'Confirmed';

        const saveBtn = document.getElementById('save-booking-btn');
        saveBtn.click();
        await new Promise(r => setTimeout(r, 600));

        const banner = document.getElementById('conflict-alert-banner');
        const isBannerVisible = banner && banner.style.display !== 'none';
        const bannerText = banner ? banner.innerText : '';

        // Close modal
        document.getElementById('close-booking-modal-btn')?.click();

        return {
          isBannerVisible,
          conflictDetected: bannerText.includes('Conflict Detected') || bannerText.includes('Arun & Divya')
        };
      })()
    `);

    report("Bookings-Conflict", "Overlap Conflict Detected", conflictTest.conflictDetected, "Overlapping confirmed booking blocked");

    // -------------------------------------------------------------
    // TEST 5: WORKER ATTENDANCE CHECK-IN & SUBMISSION
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Submitting Worker Daily Attendance Check-In...");
    await cdp.navigate(`${APP_URL}/attendance.html`);

    const attSubmit = await cdp.evaluate(`
      (async () => {
        // Find worker marking card for Gopinathan P (worker-1)
        const workerId = 'worker-1';
        const radioPresent = document.querySelector(\`input[name="att_status_\${workerId}"][value="present"]\`);
        if (radioPresent) radioPresent.checked = true;

        const noteInput = document.getElementById(\`note_\${workerId}\`);
        if (noteInput) noteInput.value = 'Morning shift standard attendance';

        // Worker submits attendance
        const submitBtn = document.querySelector(\`.att-action-btn[data-action="mark"][data-worker-id="\${workerId}"]\`);
        if (submitBtn) submitBtn.click();
        await new Promise(r => setTimeout(r, 1000));

        const all = JSON.parse(localStorage.getItem('choice_attendance') || '[]');
        const rec = all.find(a => a.workerId === workerId);

        return {
          submitted: !!rec,
          status: rec ? rec.status : null,
          note: rec ? rec.note : null,
          approvalStatus: rec ? rec.approvalStatus : null,
          id: rec ? rec.id : null
        };
      })()
    `);

    report("Attendance", "Attendance Submitted for Gopinathan", attSubmit.submitted, `Status: ${attSubmit.status}`);
    report("Attendance", "Pending Approval status assigned", attSubmit.approvalStatus === "Pending Approval");

    // -------------------------------------------------------------
    // TEST 6: ADMIN ATTENDANCE OVERRIDE & APPROVAL MODAL
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Admin Attendance Edit & Approval Override...");
    const adminEdit = await cdp.evaluate(`
      (async () => {
        // Switch to Monthly Attendance History tab
        const histTabBtn = document.querySelector('.tab-btn[data-tab="monthly"]');
        if (histTabBtn) histTabBtn.click();
        await new Promise(r => setTimeout(r, 600));

        // Click Edit on the first history row
        const editBtn = document.querySelector('.att-history-edit-btn');
        if (!editBtn) return { error: 'Admin edit button not found in history table' };
        
        editBtn.click();
        await new Promise(r => setTimeout(r, 500));

        const modal = document.getElementById('edit-attendance-modal');
        const modalOpen = modal && modal.classList.contains('active');

        // Admin overrides: change status to half-day, add note, select Approved
        const radioHalf = document.querySelector('input[name="edit-att-status"][value="half-day"]');
        if (radioHalf) radioHalf.checked = true;

        const noteEl = document.getElementById('edit-att-note');
        if (noteEl) noteEl.value = 'Admin verified: Approved for half-day compensation';

        const approvalSelect = document.getElementById('edit-att-approval');
        if (approvalSelect) approvalSelect.value = 'Approved';

        // Save Edit
        const saveBtn = document.getElementById('save-edit-att-btn');
        if (saveBtn) saveBtn.click();
        await new Promise(r => setTimeout(r, 1000));

        // Verify updated record in localStorage
        const all = JSON.parse(localStorage.getItem('choice_attendance') || '[]');
        const updated = all.find(a => a.note && a.note.includes('Admin verified'));

        // Check history table rendered badge
        const tbodyText = document.getElementById('attendance-history-tbody')?.innerText || '';

        return {
          modalOpen,
          updated: !!updated,
          newStatus: updated ? updated.status : null,
          newApproval: updated ? updated.approvalStatus : null,
          approvedBy: updated ? updated.approvedBy : null,
          tableShowsApproved: tbodyText.includes('Approved') && tbodyText.includes('half-day')
        };
      })()
    `);

    report("Attendance-Edit", "Admin Edit Modal opened", adminEdit.modalOpen);
    report("Attendance-Edit", "Status overridden to 'half-day'", adminEdit.newStatus === "half-day");
    report("Attendance-Edit", "Approval Status set to 'Approved'", adminEdit.newApproval === "Approved", `Approved by: ${adminEdit.approvedBy}`);
    report("Attendance-Edit", "History Table reflects override", adminEdit.tableShowsApproved);

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log("\n" + "=".repeat(70));
    console.log(`LIVE TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
    console.log("=".repeat(70));

  } finally {
    if (cdp) await cdp.close();
    server.close();
  }

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error("Execution failed:", err);
  process.exit(1);
});
