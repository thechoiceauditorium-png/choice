/**
 * The Choice Auditorium - Statutory Compliance & Filings Tracker
 * Proper action buttons, cycle renewal, and completed compliance history log.
 */

import { requireAuth, isOwner, getCurrentUser } from "./auth.js";
import { renderHeader, formatDate, formatDateTime, formatINR, showToast, openModal, closeModal } from "./common.js";
import { dbStore } from "./firebase-config.js";
import { evaluateNotifications } from "./notifications.js";

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;

  renderHeader("compliance");
  evaluateNotifications();

  initModals();

  // Subscribe to compliance items
  dbStore.subscribe("compliance", (compliance) => {
    updateComplianceStatuses(compliance);
    renderComplianceTable(compliance);
    renderAlertBanner(compliance);
    renderComplianceHistory();
  });
});

function initModals() {
  document.getElementById("new-compliance-btn")?.addEventListener("click", () => openComplianceModal());
  document.getElementById("close-comp-modal-btn")?.addEventListener("click", () => closeModal("compliance-modal"));
  document.getElementById("cancel-comp-modal-btn")?.addEventListener("click", () => closeModal("compliance-modal"));
  document.getElementById("save-comp-btn")?.addEventListener("click", handleSaveCompliance);

  // Mark Done modal
  document.getElementById("close-done-modal-btn")?.addEventListener("click", () => closeModal("mark-done-modal"));
  document.getElementById("cancel-done-modal-btn")?.addEventListener("click", () => closeModal("mark-done-modal"));
  document.getElementById("save-done-comp-btn")?.addEventListener("click", handleConfirmDone);
}

function updateComplianceStatuses(compliance = []) {
  const today = new Date();
  let changed = false;

  compliance.forEach(item => {
    if (!item.dueDate || item.status === "Completed") return;
    const due = new Date(item.dueDate);
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    const lead = item.leadDays || 15;

    let newStatus = "Upcoming";
    if (diffDays < 0) {
      newStatus = "Overdue";
    } else if (diffDays <= lead) {
      newStatus = "Due Soon";
    }

    if (item.status !== newStatus) {
      item.status = newStatus;
      changed = true;
    }
  });

  if (changed) {
    dbStore.save("compliance", compliance);
  }
}

function renderAlertBanner(compliance = []) {
  const box = document.getElementById("compliance-alert-box");
  if (!box) return;

  const urgent = compliance.filter(c => (c.status === "Due Soon" || c.status === "Overdue") && c.status !== "Completed");

  if (urgent.length === 0) {
    box.innerHTML = `
      <div style="background: #E8F5E9; border: 1px solid #C8E6C9; padding: 0.85rem 1.25rem; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 0.75rem;">
        <div style="font-size: 0.88rem; color: #2E7D32;">
          <strong>All statutory filings are up to date.</strong> No tax cycles or license renewals due within the next 15 days.
        </div>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div style="background: #FFF8E1; border: 1px solid #FFE082; padding: 0.9rem 1.25rem; border-radius: var(--radius-sm); border-left: 3px solid var(--warning);">
      <div style="font-weight: 700; color: #B78103; margin-bottom: 4px;">Statutory Filings Requiring Attention (${urgent.length})</div>
      <ul style="margin-left: 1.25rem; font-size: 0.85rem; color: #555;">
        ${urgent.map(u => `
          <li><strong>${u.title}</strong> — Due: <strong>${formatDate(u.dueDate)}</strong> (Assigned: ${u.responsible})</li>
        `).join("")}
      </ul>
    </div>
  `;
}

function renderComplianceTable(compliance = []) {
  const tbody = document.getElementById("compliance-table-tbody");
  if (!tbody) return;

  const sorted = [...compliance].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  tbody.innerHTML = sorted.map(c => {
    let badgeClass = 'badge-confirmed';
    if (c.status === 'Due Soon') badgeClass = 'badge-enquiry';
    else if (c.status === 'Overdue') badgeClass = 'badge-cancelled';
    else if (c.status === 'Completed') badgeClass = 'badge-completed';

    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${c.title}</div>
          ${c.cycle ? `<div style="font-size: 0.75rem; color: #666;">Cycle: ${c.cycle}</div>` : ''}
        </td>
        <td><span style="font-size: 0.82rem; font-weight: 600;">${c.recurrence || 'Annual'}</span></td>
        <td><strong>${formatDate(c.dueDate)}</strong></td>
        <td style="font-size: 0.82rem; color: #666;">${c.leadDays || 15} days lead</td>
        <td style="font-weight: 600; font-size: 0.85rem;">${c.responsible}</td>
        <td><span class="badge ${badgeClass}">${c.status}</span></td>
        <td style="font-size: 0.8rem; color: #666; max-width: 220px;">${c.notes || '—'}</td>
        <td class="text-right" style="white-space: nowrap;">
          <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end; align-items: center;">
            <button class="btn btn-sm btn-success mark-done-btn" data-id="${c.id}">
              Mark Done
            </button>
            <button class="btn btn-sm btn-secondary edit-comp-btn" data-id="${c.id}">
              Edit
            </button>
            ${isOwner() ? `<button class="btn btn-sm btn-outline del-comp-btn" data-id="${c.id}" style="border: 1px solid #FFCDD2; color: #C62828;">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".mark-done-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = compliance.find(x => x.id === btn.dataset.id);
      if (item) openDoneModal(item);
    });
  });

  tbody.querySelectorAll(".edit-comp-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = compliance.find(x => x.id === btn.dataset.id);
      if (item) openComplianceModal(item);
    });
  });

  tbody.querySelectorAll(".del-comp-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("Delete this compliance item?")) {
        dbStore.delete("compliance", btn.dataset.id);
        showToast("Item deleted.");
      }
    });
  });
}

function openDoneModal(item) {
  document.getElementById("done-comp-id").value = item.id;
  document.getElementById("done-comp-title").value = item.title;
  document.getElementById("done-comp-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("done-comp-amount").value = "";
  document.getElementById("done-comp-ref").value = "";
  document.getElementById("done-comp-notes").value = "";

  openModal("mark-done-modal");
}

function handleConfirmDone() {
  const compId = document.getElementById("done-comp-id").value;
  const completedDate = document.getElementById("done-comp-date").value;
  const amountPaid = Number(document.getElementById("done-comp-amount").value) || 0;
  const refNo = document.getElementById("done-comp-ref").value.trim();
  const notes = document.getElementById("done-comp-notes").value.trim();

  if (!completedDate) {
    showToast("Please select completion date.", "warning");
    return;
  }

  const compliance = dbStore.get("compliance");
  const item = compliance.find(c => c.id === compId);
  if (!item) return;

  const currentUser = getCurrentUser();

  // 1. Save into permanent Completed Compliance History
  const logEntry = {
    id: `comp-hist-${Date.now()}`,
    complianceId: item.id,
    title: item.title,
    cycle: item.cycle || item.recurrence || "Annual",
    completedDate,
    completedBy: currentUser.name,
    refNo: refNo || "—",
    amountPaid,
    notes: notes || "Filed on schedule",
    savedAt: new Date().toISOString()
  };

  dbStore.add("compliance_history", logEntry);

  // 2. Advance active compliance obligation date for next cycle
  const currentDue = new Date(item.dueDate);
  let nextCycleMsg = "";

  if (item.recurrence === "Half-yearly") {
    currentDue.setMonth(currentDue.getMonth() + 6);
    item.dueDate = currentDue.toISOString().split("T")[0];
    item.status = "Upcoming";
    nextCycleMsg = ` Next cycle due on ${formatDate(item.dueDate)}.`;
  } else if (item.recurrence === "Annual") {
    currentDue.setFullYear(currentDue.getFullYear() + 1);
    item.dueDate = currentDue.toISOString().split("T")[0];
    item.status = "Upcoming";
    nextCycleMsg = ` Next cycle due on ${formatDate(item.dueDate)}.`;
  } else if (item.recurrence === "Monthly") {
    currentDue.setMonth(currentDue.getMonth() + 1);
    item.dueDate = currentDue.toISOString().split("T")[0];
    item.status = "Upcoming";
    nextCycleMsg = ` Next cycle due on ${formatDate(item.dueDate)}.`;
  } else {
    item.status = "Completed";
  }

  item.lastCompleted = completedDate;
  dbStore.save("compliance", compliance);

  closeModal("mark-done-modal");
  renderComplianceHistory();
  showToast(`Recorded completion for "${item.title}".${nextCycleMsg}`, "success");
}

function renderComplianceHistory() {
  const tbody = document.getElementById("compliance-history-tbody");
  const countBadge = document.getElementById("completed-count-badge");
  if (!tbody) return;

  const history = dbStore.get("compliance_history") || [];

  if (countBadge) {
    countBadge.textContent = `${history.length} Record${history.length === 1 ? '' : 's'}`;
  }

  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 1.5rem; color: #999;">No completed compliance records saved yet.</td></tr>`;
    return;
  }

  const sorted = [...history].sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));

  tbody.innerHTML = sorted.map(h => `
    <tr>
      <td><strong>${formatDate(h.completedDate)}</strong></td>
      <td><div style="font-weight: 700;">${h.title}</div></td>
      <td style="font-size: 0.82rem; color: #666;">${h.cycle || '—'}</td>
      <td style="font-size: 0.85rem; font-weight: 600;">${h.completedBy || 'Elby Abin'}</td>
      <td style="font-family: monospace; font-size: 0.82rem; color: #444;">${h.refNo || '—'}</td>
      <td style="font-weight: 600; color: ${h.amountPaid > 0 ? '#2E7D32' : '#888'};">
        ${h.amountPaid > 0 ? formatINR(h.amountPaid) : '—'}
      </td>
      <td style="font-size: 0.8rem; color: #555; max-width: 250px;">${h.notes || '—'}</td>
    </tr>
  `).join("");
}

function openComplianceModal(item = null) {
  const form = document.getElementById("compliance-form");
  form.reset();

  const titleEl = document.getElementById("comp-modal-title");
  if (item) {
    titleEl.textContent = "Edit Statutory Obligation";
    document.getElementById("comp-id").value = item.id;
    document.getElementById("comp-title").value = item.title;
    document.getElementById("comp-recurrence").value = item.recurrence || "Annual";
    document.getElementById("comp-due-date").value = item.dueDate || "";
    document.getElementById("comp-responsible").value = item.responsible || "Elby Abin";
    document.getElementById("comp-lead").value = item.leadDays || 15;
    document.getElementById("comp-notes").value = item.notes || "";
  } else {
    titleEl.textContent = "New Statutory Obligation";
    document.getElementById("comp-id").value = "";
    document.getElementById("comp-recurrence").value = "Annual";
    document.getElementById("comp-lead").value = 15;
  }

  openModal("compliance-modal");
}

function handleSaveCompliance() {
  const form = document.getElementById("compliance-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const id = document.getElementById("comp-id").value;
  const title = document.getElementById("comp-title").value.trim();
  const recurrence = document.getElementById("comp-recurrence").value;
  const dueDate = document.getElementById("comp-due-date").value;
  const responsible = document.getElementById("comp-responsible").value;
  const leadDays = Number(document.getElementById("comp-lead").value) || 15;
  const notes = document.getElementById("comp-notes").value.trim();

  const data = {
    title,
    recurrence,
    dueDate,
    responsible,
    leadDays,
    notes,
    status: "Upcoming"
  };

  if (id) {
    dbStore.update("compliance", id, data);
    showToast("Compliance item updated.");
  } else {
    dbStore.add("compliance", data);
    showToast("New compliance item registered.");
  }

  closeModal("compliance-modal");
}
