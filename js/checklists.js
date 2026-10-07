/**
 * The Choice Auditorium - Checklist Engine (Before, After, 15-Day Routine & Custom Checklists)
 * Editable checklist tasks and custom checklist creation. Zero emojis. No print.
 */

import { requireAuth, isOwner, getCurrentUser } from "./auth.js";
import { renderHeader, formatDate, formatDateTime, showToast, openModal, closeModal } from "./common.js";
import { dbStore } from "./firebase-config.js";
import { evaluateNotifications } from "./notifications.js";

let currentChecklistId = null;

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;

  renderHeader("checklists");
  evaluateNotifications();

  initModalEvents();

  // Check URL param for ?id=
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get("id");

  // Subscribe to checklists updates
  dbStore.subscribe("checklists", (checklists) => {
    if (checklists.length > 0) {
      if (!currentChecklistId || !checklists.some(c => c.id === currentChecklistId)) {
        currentChecklistId = targetId && checklists.some(c => c.id === targetId) ? targetId : checklists[0].id;
      }
    } else {
      currentChecklistId = null;
    }
    renderChecklistTabs(checklists);
    renderActiveChecklist(checklists);
  });
});

function initModalEvents() {
  // Custom checklist modal
  document.getElementById("create-custom-chk-btn")?.addEventListener("click", () => {
    document.getElementById("custom-chk-form")?.reset();
    openModal("custom-chk-modal");
  });
  document.getElementById("close-custom-chk-modal-btn")?.addEventListener("click", () => closeModal("custom-chk-modal"));
  document.getElementById("cancel-custom-chk-modal-btn")?.addEventListener("click", () => closeModal("custom-chk-modal"));
  document.getElementById("save-custom-chk-btn")?.addEventListener("click", handleCreateCustomChecklist);

  // New function checklist modal
  document.getElementById("new-function-chk-btn")?.addEventListener("click", openNewChecklistModal);
  document.getElementById("close-gen-chk-modal-btn")?.addEventListener("click", () => closeModal("gen-chk-modal"));
  document.getElementById("cancel-gen-chk-modal-btn")?.addEventListener("click", () => closeModal("gen-chk-modal"));
  document.getElementById("confirm-gen-chk-btn")?.addEventListener("click", handleCreateFunctionChecklist);

  // 15-day checklist generator
  document.getElementById("gen-15day-btn")?.addEventListener("click", handleGenerate15DayChecklist);

  // Template editor modal
  document.getElementById("edit-templates-btn")?.addEventListener("click", openTemplateEditorModal);
  document.getElementById("close-template-modal-btn")?.addEventListener("click", () => closeModal("template-editor-modal"));
  document.getElementById("cancel-template-modal-btn")?.addEventListener("click", () => closeModal("template-editor-modal"));
  document.getElementById("template-type-select")?.addEventListener("change", loadTemplateItemsToEdit);
  document.getElementById("save-template-items-btn")?.addEventListener("click", handleSaveTemplateItems);

  // Single Item Edit Modal
  document.getElementById("close-edit-item-modal-btn")?.addEventListener("click", () => closeModal("edit-item-modal"));
  document.getElementById("cancel-edit-item-modal-btn")?.addEventListener("click", () => closeModal("edit-item-modal"));
  document.getElementById("save-single-item-btn")?.addEventListener("click", handleSaveSingleItem);
}

function renderChecklistTabs(checklists = []) {
  const container = document.getElementById("chk-tabs-container");
  if (!container) return;

  if (checklists.length === 0) {
    container.innerHTML = `<span style="font-size: 0.85rem; color: #999;">No active checklists. Click "+ Add Own Checklist" above.</span>`;
    return;
  }

  container.innerHTML = checklists.map(c => {
    const isActive = c.id === currentChecklistId;
    const doneCount = c.items.filter(i => i.done).length;
    const total = c.items.length;

    let tag = "Custom";
    if (c.type === "every15Days") tag = "15-Day";
    else if (c.type === "beforeFunction") tag = "Before";
    else if (c.type === "afterFunction") tag = "After";

    return `
      <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}" data-id="${c.id}" style="white-space: nowrap;">
        ${tag}: ${c.title.slice(0, 24)}${c.title.length > 24 ? '...' : ''} (${doneCount}/${total})
      </button>
    `;
  }).join("");

  container.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      currentChecklistId = btn.dataset.id;
      renderChecklistTabs(checklists);
      renderActiveChecklist(checklists);
    });
  });
}

function renderActiveChecklist(checklists = []) {
  const container = document.getElementById("active-chk-body");
  if (!container) return;

  const current = checklists.find(c => c.id === currentChecklistId);
  if (!current) {
    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #999;">No checklist selected.</div>`;
    return;
  }

  const currentUser = getCurrentUser();
  const userIsOwner = isOwner();
  const doneCount = current.items.filter(i => i.done).length;
  const totalCount = current.items.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.85rem;">
      <div>
        <h3 style="font-size: 1.15rem; color: var(--text);">${current.title}</h3>
        <div style="font-size: 0.78rem; color: #777; margin-top: 2px;">
          Created: ${formatDateTime(current.createdAt)} · Type: <span style="text-transform: capitalize;">${current.type}</span>
          ${current.bookingNo ? ` · Booking: <strong>#${current.bookingNo}</strong>` : ''}
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <span class="badge ${pct === 100 ? 'badge-confirmed' : 'badge-enquiry'}">
          ${doneCount}/${totalCount} Done (${pct}%)
        </span>
        ${userIsOwner ? `<button class="btn btn-sm btn-outline-danger del-chk-btn" style="border: 1px solid #FFCDD2; color: #C62828;">Delete Checklist</button>` : ''}
      </div>
    </div>

    <!-- Items Table -->
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 45px;">Sl.</th>
            <th>Task Description</th>
            <th style="width: 80px;" class="text-center">Status</th>
            <th style="width: 160px;">Signed By (Worker)</th>
            <th style="width: 160px;">Verified By (Owner)</th>
            <th style="width: 120px;">Timestamp</th>
            <th style="width: 110px;" class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${current.items.map((item, idx) => `
            <tr style="${item.done ? 'background: #FAFCFA;' : ''}">
              <td class="text-center font-weight-bold">${item.sl || idx + 1}</td>
              <td style="font-size: 0.88rem; font-weight: ${item.done ? '500' : '600'}; color: ${item.done ? '#555' : '#1A1A1A'};">
                ${item.text}
              </td>
              <td class="text-center">
                <input type="checkbox" class="chk-item-toggle" data-index="${idx}" ${item.done ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 0.82rem; font-weight: bold; color: ${item.signedBy ? '#2E7D32' : '#999'};">
                    ${item.signedBy || 'Pending'}
                  </span>
                  ${!item.signedBy ? `
                    <button class="btn btn-sm btn-secondary sign-item-btn" data-index="${idx}" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;">
                      Sign
                    </button>
                  ` : ''}
                </div>
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 0.82rem; font-weight: bold; color: ${item.verifiedBy ? '#1565C0' : '#999'};">
                    ${item.verifiedBy || 'Pending'}
                  </span>
                  ${userIsOwner && !item.verifiedBy ? `
                    <button class="btn btn-sm btn-outline verify-item-btn" data-index="${idx}" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;">
                      Verify
                    </button>
                  ` : ''}
                </div>
              </td>
              <td style="font-size: 0.75rem; color: #888;">
                ${item.timestamp || '—'}
              </td>
              <td class="text-right">
                <button class="btn btn-sm btn-secondary edit-item-btn" data-index="${idx}" style="padding: 0.2rem 0.45rem; font-size: 0.72rem;">Edit</button>
                <button class="btn btn-sm btn-outline del-item-btn" data-index="${idx}" style="padding: 0.2rem 0.45rem; font-size: 0.72rem; color: #C62828;">Del</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <!-- Add New Task Row -->
    <div style="margin-top: 1.25rem; padding: 0.75rem; background: #F9FAFB; border: 1px solid var(--border); border-radius: var(--radius-sm); display: flex; gap: 0.5rem; align-items: center;">
      <input type="text" id="new-active-item-input" class="form-control" placeholder="Add a new task item to this checklist..." style="flex: 1;">
      <button class="btn btn-primary btn-sm" id="add-active-item-btn" style="white-space: nowrap;">+ Add Item</button>
    </div>
  `;

  // Attach item toggle/sign/verify events
  container.querySelectorAll(".chk-item-toggle").forEach(chk => {
    chk.addEventListener("change", () => {
      const idx = Number(chk.dataset.index);
      const isChecked = chk.checked;
      updateChecklistItem(currentChecklistId, idx, {
        done: isChecked,
        signedBy: isChecked ? (current.items[idx].signedBy || currentUser.name) : "",
        timestamp: isChecked ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""
      });
    });
  });

  container.querySelectorAll(".sign-item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      updateChecklistItem(currentChecklistId, idx, {
        done: true,
        signedBy: currentUser.name,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      });
      showToast(`Item signed by ${currentUser.name}`);
    });
  });

  container.querySelectorAll(".verify-item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      updateChecklistItem(currentChecklistId, idx, {
        verifiedBy: currentUser.name
      });
      showToast(`Verified by ${currentUser.name}`);
    });
  });

  // Edit single item
  container.querySelectorAll(".edit-item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      const item = current.items[idx];
      if (!item) return;

      document.getElementById("edit-item-idx").value = idx;
      document.getElementById("edit-item-text").value = item.text;
      openModal("edit-item-modal");
    });
  });

  // Delete single item
  container.querySelectorAll(".del-item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (confirm(`Remove item #${idx + 1}?`)) {
        const checklists = dbStore.get("checklists");
        const target = checklists.find(c => c.id === currentChecklistId);
        if (target) {
          target.items.splice(idx, 1);
          // Renumber items
          target.items.forEach((it, i) => it.sl = i + 1);
          dbStore.save("checklists", checklists);
          showToast("Item deleted.");
        }
      }
    });
  });

  // Add new item to current checklist
  const addBtn = document.getElementById("add-active-item-btn");
  const addInput = document.getElementById("new-active-item-input");

  const addNewItem = () => {
    const text = addInput?.value.trim();
    if (!text) return;

    const checklists = dbStore.get("checklists");
    const target = checklists.find(c => c.id === currentChecklistId);
    if (target) {
      target.items.push({
        sl: target.items.length + 1,
        text,
        done: false,
        signedBy: "",
        verifiedBy: "",
        timestamp: ""
      });
      dbStore.save("checklists", checklists);
      showToast("Item added to checklist.");
    }
  };

  addBtn?.addEventListener("click", addNewItem);
  addInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewItem();
    }
  });

  // Delete entire checklist
  container.querySelector(".del-chk-btn")?.addEventListener("click", () => {
    if (confirm("Delete this checklist instance?")) {
      dbStore.delete("checklists", currentChecklistId);
      currentChecklistId = null;
      showToast("Checklist deleted.");
    }
  });
}

function handleSaveSingleItem() {
  const idx = Number(document.getElementById("edit-item-idx")?.value);
  const text = document.getElementById("edit-item-text")?.value.trim();

  if (!text) {
    showToast("Task description cannot be empty.", "warning");
    return;
  }

  const checklists = dbStore.get("checklists");
  const target = checklists.find(c => c.id === currentChecklistId);
  if (target && target.items[idx]) {
    target.items[idx].text = text;
    dbStore.save("checklists", checklists);
    showToast("Checklist item updated.");
    closeModal("edit-item-modal");
  }
}

function handleCreateCustomChecklist() {
  const title = document.getElementById("custom-chk-title")?.value.trim();
  const rawItems = document.getElementById("custom-chk-items")?.value.trim();

  if (!title) {
    showToast("Please enter a checklist title.", "warning");
    return;
  }

  const lines = (rawItems || "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) {
    showToast("Please enter at least one task item.", "warning");
    return;
  }

  const allChecklists = dbStore.get("checklists");
  const newChk = {
    id: `chk-custom-${Date.now()}`,
    type: "custom",
    title,
    items: lines.map((text, idx) => ({
      sl: idx + 1,
      text,
      done: false,
      signedBy: "",
      verifiedBy: "",
      timestamp: ""
    })),
    status: "In Progress",
    createdAt: new Date().toISOString()
  };

  allChecklists.unshift(newChk);
  currentChecklistId = newChk.id;
  dbStore.save("checklists", allChecklists);

  closeModal("custom-chk-modal");
  showToast(`Custom checklist "${title}" created successfully.`);
}

function updateChecklistItem(chkId, itemIndex, updates) {
  const checklists = dbStore.get("checklists");
  const target = checklists.find(c => c.id === chkId);
  if (target && target.items[itemIndex]) {
    target.items[itemIndex] = { ...target.items[itemIndex], ...updates };
    const allDone = target.items.every(i => i.done);
    target.status = allDone ? "Completed" : "In Progress";
    dbStore.save("checklists", checklists);
  }
}

function openNewChecklistModal() {
  const bkSelect = document.getElementById("gen-chk-booking");
  if (!bkSelect) return;

  const bookings = dbStore.get("bookings").filter(b => b.status === "Confirmed");
  if (bookings.length === 0) {
    bkSelect.innerHTML = `<option value="">No confirmed bookings available</option>`;
  } else {
    bkSelect.innerHTML = bookings.map(b => `
      <option value="${b.id}">#${b.bookingNo} - ${b.customerName} (${formatDate(b.reservationDate)})</option>
    `).join("");
  }

  openModal("gen-chk-modal");
}

function handleCreateFunctionChecklist() {
  const type = document.getElementById("gen-chk-type").value;
  const bookingId = document.getElementById("gen-chk-booking").value;

  if (!bookingId) {
    showToast("Please choose a booking.", "warning");
    return;
  }

  const booking = dbStore.get("bookings").find(b => b.id === bookingId);
  if (!booking) return;

  const templates = dbStore.get("checklist_templates") || {};
  const defaultItems = (templates[type] || []).map((text, i) => ({
    sl: i + 1,
    text,
    done: false,
    signedBy: "",
    verifiedBy: "",
    timestamp: ""
  }));

  const prefix = type === "beforeFunction" ? "Before-Function" : "After-Function";
  const newChk = {
    id: `chk-${type}-${booking.bookingNo}-${Date.now()}`,
    type,
    title: `${prefix} Checklist: ${booking.customerName} (CA-${booking.bookingNo})`,
    bookingId: booking.id,
    bookingNo: booking.bookingNo,
    eventDate: booking.reservationDate,
    items: defaultItems,
    status: "In Progress",
    createdAt: new Date().toISOString()
  };

  const all = dbStore.get("checklists");
  all.unshift(newChk);
  currentChecklistId = newChk.id;
  dbStore.save("checklists", all);

  closeModal("gen-chk-modal");
  showToast(`Created ${prefix} checklist for ${booking.customerName}`);
}

function handleGenerate15DayChecklist() {
  const templates = dbStore.get("checklist_templates") || {};
  const defaultItems = (templates.every15Days || []).map((text, i) => ({
    sl: i + 1,
    text,
    done: false,
    signedBy: "",
    verifiedBy: "",
    timestamp: ""
  }));

  const today = new Date();
  const period = `${today.getDate() <= 15 ? '1st' : '2nd'} Half ${today.toLocaleDateString("en-IN", { month: 'long', year: 'numeric' })}`;

  const newChk = {
    id: `chk-15day-${Date.now()}`,
    type: "every15Days",
    title: `Routine 15-Day Facility Checklist (${period})`,
    period,
    items: defaultItems,
    status: "In Progress",
    createdAt: new Date().toISOString()
  };

  const all = dbStore.get("checklists");
  all.unshift(newChk);
  currentChecklistId = newChk.id;
  dbStore.save("checklists", all);

  showToast(`Generated 15-Day Facility Checklist for ${period}`);
}

function openTemplateEditorModal() {
  loadTemplateItemsToEdit();
  openModal("template-editor-modal");
}

function loadTemplateItemsToEdit() {
  const type = document.getElementById("template-type-select").value;
  const container = document.getElementById("template-items-list");
  if (!container) return;

  const templates = dbStore.get("checklist_templates") || {};
  const items = templates[type] || [];

  container.innerHTML = items.map((text, i) => `
    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
      <span style="width: 25px; font-weight: bold; font-size: 0.85rem; color: #777;">${i + 1}.</span>
      <input type="text" class="form-control template-item-input" value="${text.replace(/"/g, '&quot;')}" style="flex: 1;">
      <button type="button" class="btn btn-sm btn-outline del-tmpl-row" style="color: #C62828;">Del</button>
    </div>
  `).join("") + `
    <div style="margin-top: 0.75rem;">
      <button type="button" class="btn btn-sm btn-secondary" id="add-tmpl-item-btn">+ Add Template Item</button>
    </div>
  `;

  container.querySelectorAll(".del-tmpl-row").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.parentElement.remove();
    });
  });

  document.getElementById("add-tmpl-item-btn")?.addEventListener("click", () => {
    const div = document.createElement("div");
    div.style = "display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;";
    div.innerHTML = `
      <span style="width: 25px; font-weight: bold; font-size: 0.85rem; color: #777;">+</span>
      <input type="text" class="form-control template-item-input" placeholder="New template item..." style="flex: 1;">
      <button type="button" class="btn btn-sm btn-outline del-tmpl-row" style="color: #C62828;">Del</button>
    `;
    div.querySelector(".del-tmpl-row").addEventListener("click", () => div.remove());
    container.insertBefore(div, document.getElementById("add-tmpl-item-btn").parentElement);
  });
}

function handleSaveTemplateItems() {
  const type = document.getElementById("template-type-select").value;
  const inputs = document.querySelectorAll(".template-item-input");
  const newItems = [];

  inputs.forEach(inp => {
    const val = inp.value.trim();
    if (val) newItems.push(val);
  });

  const templates = dbStore.get("checklist_templates") || {};
  templates[type] = newItems;
  dbStore.save("checklist_templates", templates);

  closeModal("template-editor-modal");
  showToast(`Updated master template for ${type} with ${newItems.length} items.`);
}
