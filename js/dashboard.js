/**
 * The Choice Auditorium - Dashboard Controller
 */

import { requireAuth, isOwner, getCurrentUser } from "./auth.js";
import { renderHeader, formatINR, formatDate, formatDateTime, showToast, escapeHtml, sanitizeTel, sanitizeUrl } from "./common.js";
import { dbStore } from "./supabase-config.js";
import { evaluateNotifications } from "./notifications.js";

document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireAuth();
  if (!user) return;

  renderHeader("dashboard");
  evaluateNotifications();

  // Set Current Date badge
  const dateBadge = document.getElementById("current-date-badge");
  if (dateBadge) {
    const today = new Date();
    dateBadge.textContent = today.toLocaleDateString("en-IN", { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Subscribe to data collections
  dbStore.subscribe("bookings", renderBookingsSection);
  dbStore.subscribe("ledger", renderFinancialSnapshot);
  dbStore.subscribe("attendance", renderAttendanceWidget);
  dbStore.subscribe("checklists", renderChecklistsWidget);
  dbStore.subscribe("compliance", renderComplianceWidget);
});

function renderBookingsSection(bookings = []) {
  const tbody = document.getElementById("upcoming-bookings-tbody");
  if (!tbody) return;

  // Filter confirmed & enquiries upcoming
  const todayStr = new Date().toISOString().split("T")[0];
  const sorted = [...bookings]
    .filter(b => b.status !== "Cancelled")
    .sort((a, b) => new Date(a.reservationDate) - new Date(b.reservationDate));

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 2rem; color: #999;">No upcoming bookings found.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.slice(0, 6).map(b => {
    const statusClass = b.status === 'Confirmed' ? 'badge-confirmed' : b.status === 'Enquiry' ? 'badge-enquiry' : 'badge-completed';
    return `
      <tr>
        <td><strong>#${escapeHtml(b.bookingNo || '')}</strong></td>
        <td>
          <div><strong>${(b.fromDateTime && b.toDateTime && b.fromDateTime.split('T')[0] !== b.toDateTime.split('T')[0]) ? `${formatDate(b.fromDateTime.split('T')[0])} – ${formatDate(b.toDateTime.split('T')[0])}` : formatDate(b.reservationDate)}</strong></div>
          <div style="font-size: 0.75rem; color: #666;">${b.fromDateTime ? escapeHtml(b.fromDateTime.split('T')[1]?.slice(0, 5) || '') : ''} - ${b.toDateTime ? escapeHtml(b.toDateTime.split('T')[1]?.slice(0, 5) || '') : ''}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(b.customerName || '')}</div>
          <div style="font-size: 0.75rem; color: #666;">${escapeHtml(b.eventDesc || 'Wedding & Reception')}</div>
        </td>
        <td>
          <div style="font-size: 0.82rem;"><a href="tel:${sanitizeTel(b.phone1)}">${escapeHtml(b.phone1 || '')}</a></div>
          ${b.phone2 ? `<div style="font-size: 0.75rem; color: #888;"><a href="tel:${sanitizeTel(b.phone2)}">${escapeHtml(b.phone2 || '')}</a></div>` : ''}
        </td>
        <td>
          <span class="badge ${statusClass}">${escapeHtml(b.status || '')}</span>
        </td>
        <td>
          <div style="font-size: 0.85rem; font-weight: bold;">${formatINR(b.grandTotal)}</div>
          <div style="font-size: 0.72rem; color: ${b.balanceAmount > 0 ? '#C62828' : '#2E7D32'};">
            ${b.balanceAmount > 0 ? 'Bal: ' + formatINR(b.balanceAmount) : 'Paid in Full'}
          </div>
        </td>
      </tr>
    `;
  }).join("");

  updateKpiGrid();
}

function renderFinancialSnapshot(ledger = []) {
  const isUserOwner = isOwner();
  const finCard = document.getElementById("financial-snapshot-card");
  
  // Calculate this month's stats
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  let income = 0;
  let expense = 0;

  ledger.forEach(item => {
    if (item.date && item.date.startsWith(currentYearMonth)) {
      if (item.type === "income") income += Number(item.amount) || 0;
      if (item.type === "expense") expense += Number(item.amount) || 0;
    }
  });

  const net = income - expense;

  const incEl = document.getElementById("stat-month-income");
  const expEl = document.getElementById("stat-month-expense");
  const netEl = document.getElementById("stat-month-net");

  if (incEl) incEl.textContent = formatINR(income);
  if (expEl) expEl.textContent = formatINR(expense);
  if (netEl) {
    netEl.textContent = formatINR(net);
    netEl.style.color = net >= 0 ? "#1565C0" : "#C62828";
  }

  // If worker, hide or simplify detailed totals
  if (!isUserOwner && finCard) {
    finCard.querySelector(".card-body").innerHTML = `
      <div style="padding: 1rem; background: #FAFAFA; border-radius: 4px; text-align: center; color: #666; font-size: 0.88rem;">
        Ledger operational logging enabled. Day-to-day vouchers & recurring expenses can be logged in <a href="ledger.html">Books</a>.
      </div>
    `;
  }

  updateKpiGrid();
}

function renderAttendanceWidget(attendance = []) {
  const widget = document.getElementById("today-attendance-widget");
  if (!widget) return;

  const users = dbStore.get("users");
  const allWorkers = Array.isArray(users) ? users.filter(u => u.role === "worker") : [];

  const userIsOwner = isOwner();
  const currentUser = getCurrentUser();
  const workers = currentUser && currentUser.role === "worker"
    ? allWorkers.filter(w => w.id === currentUser.id)
    : allWorkers;

  if (workers.length === 0) {
    widget.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--muted); font-size: 0.85rem;">No staff records found.</div>`;
    return;
  }

  widget.innerHTML = workers.map(w => {
    const record = attendance.find(a => a.date === todayStr && a.workerId === w.id);
    let statusBadge = `<span class="badge badge-unmarked">Not Submitted</span>`;
    let approvalBadge = "";
    let approveBtn = "";

    if (record) {
      if (record.status === "present") statusBadge = `<span class="badge badge-confirmed">Present</span>`;
      else if (record.status === "half-day") statusBadge = `<span class="badge badge-enquiry">Half Day</span>`;
      else statusBadge = `<span class="badge badge-cancelled">Absent</span>`;

      if (record.approvalStatus === "Approved") {
        approvalBadge = `<span class="badge badge-approved" style="font-size: 0.7rem;">Approved</span>`;
      } else {
        approvalBadge = `<span class="badge badge-pending" style="font-size: 0.7rem;">Pending Approval</span>`;
        if (userIsOwner) {
          approveBtn = `
            <button class="btn btn-sm btn-success quick-approve-att-btn" style="padding: 0.2rem 0.55rem; font-size: 0.72rem; margin-top: 4px;" data-record-id="${escapeHtml(record.id)}" data-worker-name="${escapeHtml(w.name || '')}">
              Approve
            </button>
          `;
        }
      }
    }

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid #EEE;">
        <div>
          <div style="font-weight: 600; font-size: 0.88rem;">${escapeHtml(w.name || '')}</div>
          <div style="font-size: 0.75rem; color: #777;">${escapeHtml(w.title || '')} · <a href="tel:${sanitizeTel(w.phone)}">${escapeHtml(w.phone || '')}</a></div>
          ${record && record.note ? `<div style="font-size: 0.72rem; color: #888; font-style: italic;">"${escapeHtml(record.note)}"</div>` : ''}
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            ${statusBadge}
            ${approvalBadge}
          </div>
          ${approveBtn}
        </div>
      </div>
    `;
  }).join("");

  const totalSaved = attendance.length;
  const pendingCount = attendance.filter(a => a.approvalStatus === "Pending Approval").length;

  widget.innerHTML += `
    ${userIsOwner && pendingCount > 0 ? `
      <div style="margin-top: 0.65rem; padding: 0.45rem 0.65rem; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: var(--radius-sm); font-size: 0.78rem; color: #92400E; display: flex; align-items: center; justify-content: space-between;">
        <span><strong>${pendingCount}</strong> entry awaiting approval</span>
        <a href="attendance.html" style="color: #B45309; font-weight: 600; text-decoration: underline;">Review</a>
      </div>
    ` : ''}
    <div style="margin-top: 0.75rem; padding-top: 0.65rem; border-top: 1px solid #EEE; display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
      <span style="color: var(--muted);">${totalSaved} total date records saved</span>
      <a href="attendance.html" style="color: var(--brand-red); font-weight: 600; text-decoration: none;">Full History & Logs &rarr;</a>
    </div>
  `;

  // Attach quick approve button click listeners safely without inline onclick
  widget.querySelectorAll(".quick-approve-att-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!isOwner()) return;
      const recordId = btn.dataset.recordId;
      const workerName = btn.dataset.workerName;
      const allRecords = dbStore.get("attendance");
      const record = allRecords.find(a => a.id === recordId);
      if (!record) return;

      record.approvalStatus = "Approved";
      record.approvedBy = currentUser.name;
      record.approvedAt = new Date().toISOString();

      dbStore.save("attendance", allRecords);
      evaluateNotifications();
      showToast(`Attendance approved for ${workerName}.`, "success");
    });
  });
}

function renderChecklistsWidget(checklists = []) {
  const widget = document.getElementById("checklists-widget");
  if (!widget) return;

  if (checklists.length === 0) {
    widget.innerHTML = `<div style="font-size: 0.85rem; color: #999; padding: 0.5rem 0;">No active checklists right now.</div>`;
    return;
  }

  widget.innerHTML = checklists.slice(0, 3).map(chk => {
    const doneCount = chk.items.filter(i => i.done).length;
    const totalCount = chk.items.length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    return `
      <div style="padding: 0.75rem 0; border-bottom: 1px solid #EEE;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="font-weight: 600; font-size: 0.85rem;">${escapeHtml(chk.title || '')}</div>
          <span style="font-size: 0.75rem; font-weight: bold; color: ${pct === 100 ? '#2E7D32' : '#E8A400'};">${doneCount}/${totalCount} (${pct}%)</span>
        </div>
        <div style="background: #EEE; border-radius: 4px; height: 6px; overflow: hidden; margin-bottom: 6px;">
          <div style="background: ${pct === 100 ? '#2E7D32' : 'var(--brand-red)'}; width: ${pct}%; height: 100%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: #777;">
          <span>Status: ${escapeHtml(chk.status || '')}</span>
          <a href="checklists.html?id=${encodeURIComponent(chk.id || '')}" style="color: var(--brand-red); font-weight: bold;">Open Checklist →</a>
        </div>
      </div>
    `;
  }).join("");
}

function renderComplianceWidget(compliance = []) {
  const widget = document.getElementById("compliance-widget");
  if (!widget) return;

  const dueSoon = compliance
    .filter(c => c.status === "Due Soon" || c.status === "Upcoming")
    .slice(0, 4);

  if (dueSoon.length === 0) {
    widget.innerHTML = `<div style="font-size: 0.85rem; color: #999; padding: 0.5rem 0;">All statutory filings up to date.</div>`;
    return;
  }

  widget.innerHTML = dueSoon.map(c => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid #EEE;">
      <div>
        <div style="font-weight: 600; font-size: 0.85rem;">${escapeHtml(c.title || '')}</div>
        <div style="font-size: 0.75rem; color: #777;">Due: <strong>${formatDate(c.dueDate)}</strong> · Resp: ${escapeHtml(c.responsible || '')}</div>
      </div>
      <span class="badge ${c.status === 'Due Soon' ? 'badge-enquiry' : 'badge-confirmed'}">${escapeHtml(c.status || '')}</span>
    </div>
  `).join("");
}

function updateKpiGrid() {
  const kpiMount = document.getElementById("kpi-grid");
  if (!kpiMount) return;

  const bookings = dbStore.get("bookings");
  const confirmedCount = bookings.filter(b => b.status === "Confirmed").length;
  const enquiryCount = bookings.filter(b => b.status === "Enquiry").length;

  const ledger = dbStore.get("ledger");
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let monthInc = 0;
  ledger.forEach(l => {
    if (l.type === "income" && l.date?.startsWith(currentYM)) monthInc += Number(l.amount) || 0;
  });

  const checklists = dbStore.get("checklists");
  const activeChkCount = checklists.filter(c => c.status !== "Completed").length;

  kpiMount.innerHTML = `
    <div class="stat-card">
      <div>
        <div class="stat-label">Confirmed Bookings</div>
        <div class="stat-value">${confirmedCount}</div>
        <div class="stat-sub">${enquiryCount} Pending Enquiries</div>
      </div>
      <div class="stat-icon" style="font-weight: bold; font-size: 0.9rem;">BKG</div>
    </div>
    <div class="stat-card green">
      <div>
        <div class="stat-label">September Revenue</div>
        <div class="stat-value">${isOwner() ? formatINR(monthInc) : '₹ Active'}</div>
        <div class="stat-sub">Advances & rentals</div>
      </div>
      <div class="stat-icon" style="font-weight: bold; font-size: 0.9rem;">INR</div>
    </div>
    <div class="stat-card amber">
      <div>
        <div class="stat-label">Active Checklists</div>
        <div class="stat-value">${activeChkCount}</div>
        <div class="stat-sub">Before/After & Routine</div>
      </div>
      <div class="stat-icon" style="font-weight: bold; font-size: 0.9rem;">CHK</div>
    </div>
    <div class="stat-card blue">
      <div>
        <div class="stat-label">Choice Team</div>
        <div class="stat-value">5 Users</div>
        <div class="stat-sub">3 Owners · 2 Workers</div>
      </div>
      <div class="stat-icon" style="font-weight: bold; font-size: 0.9rem;">TEAM</div>
    </div>
  `;
}
