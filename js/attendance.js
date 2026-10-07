/**
 * The Choice Auditorium - Attendance Controller
 * Worker Daily Marking & Owner Approval Workflow
 */

import { requireAuth, isOwner, isWorker, getCurrentUser } from "./auth.js";
import { renderHeader, formatDate, formatDateTime, showToast } from "./common.js";
import { dbStore } from "./firebase-config.js";
import { evaluateNotifications } from "./notifications.js";

function getWorkersList() {
  const users = dbStore.get("users");
  if (Array.isArray(users)) {
    return users.filter(u => u.role === "worker");
  }
  return [];
}

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;

  renderHeader("attendance");
  evaluateNotifications();

  initDateControls();
  checkRolePermissions();

  // Expose methods for UI buttons
  window.choiceAttendance = {
    submitAttendance,
    approveAttendance,
    saveAndApproveAttendance,
    approveByRecordId
  };

  // Subscribe to attendance records
  dbStore.subscribe("attendance", (attendance) => {
    loadMarkingForSelectedDate(attendance);
    renderMonthlyAttendance(attendance);
  });
});

function checkRolePermissions() {
  const currentUser = getCurrentUser();
  const notice = document.getElementById("owner-permission-notice");
  const hint = document.getElementById("att-workflow-hint");
  const roleBadge = document.getElementById("attendance-role-badge");

  if (isWorker()) {
    if (roleBadge) roleBadge.textContent = `${currentUser.name} (My Attendance)`;
    if (notice) {
      notice.innerHTML = `<span style="color: #1976D2; font-weight: 600;">Worker Portal: ${currentUser.name} (${currentUser.title})</span> · Record your status and duties for owner approval.`;
    }
    if (hint) {
      hint.textContent = "Mark your status, add duty notes, and submit for owner sign-off.";
    }
  } else if (isOwner()) {
    if (roleBadge) roleBadge.textContent = "All Staff (Owner View)";
    if (notice) {
      notice.innerHTML = `<span style="color: #2E7D32; font-weight: 600;">Owner Portal: ${currentUser.name} (${currentUser.title})</span> · Review staff submissions, verify duty notes, and approve logs.`;
    }
    if (hint) {
      hint.textContent = "Review worker submissions and click Approve to confirm attendance.";
    }
  }
}

function initDateControls() {
  const dateInput = document.getElementById("att-selected-date");
  const monthInput = document.getElementById("att-month-selector");

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  if (dateInput) {
    dateInput.value = todayStr;
    dateInput.addEventListener("change", () => loadMarkingForSelectedDate(dbStore.get("attendance")));
  }

  if (monthInput) {
    monthInput.value = currentYM;
    monthInput.addEventListener("change", () => renderMonthlyAttendance(dbStore.get("attendance")));
  }
}

function loadMarkingForSelectedDate(attendance = []) {
  const selectedDate = document.getElementById("att-selected-date")?.value;
  const container = document.getElementById("workers-marking-container");
  if (!container || !selectedDate) return;

  const currentUser = getCurrentUser();
  const userIsOwner = isOwner();
  const visibleWorkers = isWorker()
    ? getWorkersList().filter(w => w.id === currentUser.id)
    : getWorkersList();

  container.innerHTML = visibleWorkers.map(worker => {
    const existing = attendance.find(a => a.date === selectedDate && a.workerId === worker.id);
    const status = existing ? existing.status : "present";
    const note = existing ? (existing.note || "") : "";
    const approvalStatus = existing ? (existing.approvalStatus || "Approved") : null;

    const isThisWorker = currentUser.role === "worker" && currentUser.id === worker.id;
    const canEdit = userIsOwner || isThisWorker;

    // Status badge representation
    let badgeHtml = `<span class="badge badge-unmarked">Not Submitted</span>`;
    let auditHtml = "No attendance recorded for this date yet.";

    if (existing) {
      if (approvalStatus === "Approved") {
        badgeHtml = `<span class="badge badge-approved">Approved</span>`;
        auditHtml = `Marked by ${existing.markedBy || worker.name} · Approved by ${existing.approvedBy || 'Owner'} (${formatDateTime(existing.approvedAt || existing.markedAt)})`;
      } else {
        badgeHtml = `<span class="badge badge-pending">Pending Approval</span>`;
        auditHtml = `Submitted by ${existing.markedBy || worker.name} at ${formatDateTime(existing.markedAt)} · Awaiting owner sign-off`;
      }
    }

    // Action button construction
    let actionBtnHtml = "";
    if (isThisWorker) {
      const btnLabel = existing ? (approvalStatus === "Approved" ? "Update & Resubmit" : "Save Changes") : "Submit Attendance for Approval";
      actionBtnHtml = `
        <button class="btn btn-primary btn-sm" style="width: 100%; margin-top: 0.75rem;" onclick="window.choiceAttendance.submitAttendance('${worker.id}')">
          ${btnLabel}
        </button>
      `;
    } else if (userIsOwner) {
      if (existing && approvalStatus === "Pending Approval") {
        actionBtnHtml = `
          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap;">
            <button class="btn btn-success btn-sm" style="flex: 1;" onclick="window.choiceAttendance.approveAttendance('${worker.id}')">
              Approve Attendance
            </button>
            <button class="btn btn-outline btn-sm" style="flex: 1;" onclick="window.choiceAttendance.saveAndApproveAttendance('${worker.id}')">
              Save Changes & Approve
            </button>
          </div>
        `;
      } else if (existing && approvalStatus === "Approved") {
        actionBtnHtml = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem;">
            <span style="font-size: 0.8rem; color: #2E7D32; font-weight: 600;">Verified and Confirmed</span>
            <button class="btn btn-outline btn-sm" onclick="window.choiceAttendance.saveAndApproveAttendance('${worker.id}')">
              Edit & Re-Approve
            </button>
          </div>
        `;
      } else {
        actionBtnHtml = `
          <button class="btn btn-outline btn-sm" style="width: 100%; margin-top: 0.75rem;" onclick="window.choiceAttendance.saveAndApproveAttendance('${worker.id}')">
            Mark on Worker's Behalf & Approve
          </button>
        `;
      }
    }

    return `
      <div style="background: #FAFAFA; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.6rem;">
            <div>
              <h4 style="font-size: 1.05rem; margin-bottom: 2px;">${worker.name}</h4>
              <div style="font-size: 0.78rem; color: #777;">${worker.title} · <a href="tel:${worker.phone}">${worker.phone}</a></div>
            </div>
            <div>
              ${badgeHtml}
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 0.85rem;">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Status for ${formatDate(selectedDate)}</label>
            <div style="display: flex; gap: 0.5rem;">
              <label style="flex: 1; padding: 0.55rem; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: center; cursor: ${canEdit ? 'pointer' : 'default'}; background: #FFF; font-size: 0.85rem; font-weight: 600;">
                <input type="radio" name="att_status_${worker.id}" value="present" ${status === 'present' ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}>
                &nbsp;Present
              </label>
              <label style="flex: 1; padding: 0.55rem; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: center; cursor: ${canEdit ? 'pointer' : 'default'}; background: #FFF; font-size: 0.85rem; font-weight: 600;">
                <input type="radio" name="att_status_${worker.id}" value="half-day" ${status === 'half-day' ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}>
                &nbsp;Half Day
              </label>
              <label style="flex: 1; padding: 0.55rem; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: center; cursor: ${canEdit ? 'pointer' : 'default'}; background: #FFF; font-size: 0.85rem; font-weight: 600;">
                <input type="radio" name="att_status_${worker.id}" value="absent" ${status === 'absent' ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}>
                &nbsp;Absent
              </label>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label" for="note_${worker.id}" style="font-size: 0.82rem;">Duty Notes / Reason for Leave</label>
            <input type="text" id="note_${worker.id}" class="form-control" placeholder="e.g. Stage arrangement, hall mopping, personal leave" value="${note}" ${!canEdit ? 'disabled' : ''}>
          </div>

          <div style="font-size: 0.72rem; color: #777; margin-top: 0.4rem; min-height: 1.2rem;">
            ${auditHtml}
          </div>
        </div>

        <div>
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join("");
}

function submitAttendance(workerId) {
  const currentUser = getCurrentUser();
  const worker = getWorkersList().find(w => w.id === workerId);
  if (!worker) return;

  if (isWorker() && currentUser.id !== workerId) {
    showToast("You can only submit your own attendance.", "danger");
    return;
  }

  const selectedDate = document.getElementById("att-selected-date")?.value;
  if (!selectedDate) {
    showToast("Please choose a date.", "warning");
    return;
  }

  const selectedRadio = document.querySelector(`input[name="att_status_${workerId}"]:checked`);
  const status = selectedRadio ? selectedRadio.value : "present";
  const note = document.getElementById(`note_${workerId}`)?.value.trim() || "";

  const allRecords = dbStore.get("attendance");
  const existingIndex = allRecords.findIndex(a => a.date === selectedDate && a.workerId === workerId);

  const recordData = {
    date: selectedDate,
    workerId: worker.id,
    workerName: worker.name,
    status,
    note,
    markedBy: currentUser.name,
    markedAt: new Date().toISOString(),
    approvalStatus: "Pending Approval",
    approvedBy: null,
    approvedAt: null
  };

  if (existingIndex !== -1) {
    allRecords[existingIndex] = { ...allRecords[existingIndex], ...recordData };
  } else {
    recordData.id = `att-${worker.id}-${selectedDate}`;
    allRecords.unshift(recordData);
  }

  dbStore.save("attendance", allRecords);
  evaluateNotifications();
  showToast(`Attendance submitted for ${worker.name}. Awaiting owner approval.`, "success");
}

function approveAttendance(workerId) {
  if (!isOwner()) {
    showToast("Only owners can approve attendance.", "danger");
    return;
  }

  const selectedDate = document.getElementById("att-selected-date")?.value;
  if (!selectedDate) return;

  const currentUser = getCurrentUser();
  const worker = getWorkersList().find(w => w.id === workerId);
  const allRecords = dbStore.get("attendance");
  const existingIndex = allRecords.findIndex(a => a.date === selectedDate && a.workerId === workerId);

  if (existingIndex !== -1) {
    allRecords[existingIndex].approvalStatus = "Approved";
    allRecords[existingIndex].approvedBy = currentUser.name;
    allRecords[existingIndex].approvedAt = new Date().toISOString();
  } else {
    // If not marked yet, mark as present and approved
    const newRecord = {
      id: `att-${workerId}-${selectedDate}`,
      date: selectedDate,
      workerId: worker.id,
      workerName: worker.name,
      status: "present",
      note: "Marked directly by owner",
      markedBy: currentUser.name,
      markedAt: new Date().toISOString(),
      approvalStatus: "Approved",
      approvedBy: currentUser.name,
      approvedAt: new Date().toISOString()
    };
    allRecords.unshift(newRecord);
  }

  dbStore.save("attendance", allRecords);
  evaluateNotifications();
  showToast(`Attendance approved for ${worker ? worker.name : workerId}.`, "success");
}

function saveAndApproveAttendance(workerId) {
  if (!isOwner()) {
    showToast("Only owners can modify and approve attendance records.", "danger");
    return;
  }

  const selectedDate = document.getElementById("att-selected-date")?.value;
  if (!selectedDate) {
    showToast("Please choose a date.", "warning");
    return;
  }

  const currentUser = getCurrentUser();
  const worker = getWorkersList().find(w => w.id === workerId);
  if (!worker) return;

  const selectedRadio = document.querySelector(`input[name="att_status_${workerId}"]:checked`);
  const status = selectedRadio ? selectedRadio.value : "present";
  const note = document.getElementById(`note_${workerId}`)?.value.trim() || "";

  const allRecords = dbStore.get("attendance");
  const existingIndex = allRecords.findIndex(a => a.date === selectedDate && a.workerId === workerId);

  const recordData = {
    date: selectedDate,
    workerId: worker.id,
    workerName: worker.name,
    status,
    note,
    markedBy: existingIndex !== -1 ? (allRecords[existingIndex].markedBy || currentUser.name) : currentUser.name,
    markedAt: existingIndex !== -1 ? (allRecords[existingIndex].markedAt || new Date().toISOString()) : new Date().toISOString(),
    approvalStatus: "Approved",
    approvedBy: currentUser.name,
    approvedAt: new Date().toISOString()
  };

  if (existingIndex !== -1) {
    allRecords[existingIndex] = { ...allRecords[existingIndex], ...recordData };
  } else {
    recordData.id = `att-${worker.id}-${selectedDate}`;
    allRecords.unshift(recordData);
  }

  dbStore.save("attendance", allRecords);
  evaluateNotifications();
  showToast(`Attendance saved and approved for ${worker.name}.`, "success");
}

function approveByRecordId(recordId) {
  if (!isOwner()) {
    showToast("Only owners can approve attendance.", "danger");
    return;
  }

  const currentUser = getCurrentUser();
  const allRecords = dbStore.get("attendance");
  const record = allRecords.find(a => a.id === recordId);
  if (!record) return;

  record.approvalStatus = "Approved";
  record.approvedBy = currentUser.name;
  record.approvedAt = new Date().toISOString();

  dbStore.save("attendance", allRecords);
  evaluateNotifications();
  showToast(`Attendance approved for ${record.workerName} on ${formatDate(record.date)}.`, "success");
}

function renderMonthlyAttendance(attendance = []) {
  const selectedYM = document.getElementById("att-month-selector")?.value || "";
  const statsContainer = document.getElementById("monthly-stats-container");
  const tbody = document.getElementById("attendance-history-tbody");

  if (!statsContainer || !tbody) return;

  const currentUser = getCurrentUser();
  const userIsOwner = isOwner();
  const visibleWorkers = isWorker()
    ? getWorkersList().filter(w => w.id === currentUser.id)
    : getWorkersList();

  // Filter records by selected month and if worker, filter strictly to own records
  let monthRecords = attendance.filter(a => !selectedYM || (a.date && a.date.startsWith(selectedYM)));
  if (isWorker()) {
    monthRecords = monthRecords.filter(a => a.workerId === currentUser.id);
  }

  // Calculate monthly stats for visible workers only
  statsContainer.innerHTML = visibleWorkers.map(w => {
    const workerRecords = monthRecords.filter(a => a.workerId === w.id);
    const approvedRecords = workerRecords.filter(a => a.approvalStatus === "Approved");
    const presentCount = approvedRecords.filter(a => a.status === "present").length;
    const halfCount = approvedRecords.filter(a => a.status === "half-day").length;
    const absentCount = approvedRecords.filter(a => a.status === "absent").length;
    const pendingCount = workerRecords.filter(a => a.approvalStatus === "Pending Approval").length;

    return `
      <div style="background: #FFF; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.1rem; border-top: 4px solid var(--brand-red);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="font-weight: 700; font-size: 1rem;">${w.name} (${w.title})</div>
          ${pendingCount > 0 ? `<span class="badge badge-pending">${pendingCount} Pending Approval</span>` : ''}
        </div>
        <div style="font-size: 0.75rem; color: #777; margin-bottom: 0.75rem;">Month: ${selectedYM}</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center;">
          <div style="background: #E8F5E9; padding: 0.5rem; border-radius: 4px;">
            <div style="font-size: 1.25rem; font-weight: bold; color: #2E7D32;">${presentCount}</div>
            <div style="font-size: 0.7rem; color: #2E7D32; font-weight: 600;">Present (Approved)</div>
          </div>
          <div style="background: #FFF8E1; padding: 0.5rem; border-radius: 4px;">
            <div style="font-size: 1.25rem; font-weight: bold; color: #B78103;">${halfCount}</div>
            <div style="font-size: 0.7rem; color: #B78103; font-weight: 600;">Half Days</div>
          </div>
          <div style="background: #FFEBEE; padding: 0.5rem; border-radius: 4px;">
            <div style="font-size: 1.25rem; font-weight: bold; color: #C62828;">${absentCount}</div>
            <div style="font-size: 0.7rem; color: #C62828; font-weight: 600;">Absent Days</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // History table
  const sorted = [...monthRecords].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 2rem; color: #999;">No attendance records found for this month.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(a => {
    const worker = getWorkersList().find(w => w.id === a.workerId) || { title: "Staff" };
    const statusClass = a.status === 'present' ? 'badge-confirmed' : a.status === 'half-day' ? 'badge-enquiry' : 'badge-cancelled';
    const isPending = a.approvalStatus === "Pending Approval";

    const approvalBadge = isPending
      ? `<span class="badge badge-pending">Pending Approval</span>`
      : `<span class="badge badge-approved">Approved</span> <div style="font-size: 0.7rem; color: #666; margin-top: 2px;">by ${a.approvedBy || 'Owner'}</div>`;

    let actionCell = `<span style="font-size: 0.78rem; color: #999;">${a.approvalStatus === 'Approved' ? 'Confirmed' : '—'}</span>`;
    if (userIsOwner && isPending) {
      actionCell = `
        <button class="btn btn-sm btn-success" onclick="window.choiceAttendance.approveByRecordId('${a.id}')">
          Approve
        </button>
      `;
    }

    return `
      <tr>
        <td><strong>${formatDate(a.date)}</strong></td>
        <td><strong>${a.workerName}</strong></td>
        <td style="font-size: 0.8rem; color: #666;">${worker.title}</td>
        <td><span class="badge ${statusClass}" style="text-transform: capitalize;">${a.status}</span></td>
        <td style="font-size: 0.82rem;">${a.note || '—'}</td>
        <td style="font-size: 0.82rem; color: #555;">
          ${a.markedBy || worker.name}
          <div style="font-size: 0.7rem; color: #888;">${formatDateTime(a.markedAt)}</div>
        </td>
        <td>${approvalBadge}</td>
        <td>${actionCell}</td>
      </tr>
    `;
  }).join("");
}
