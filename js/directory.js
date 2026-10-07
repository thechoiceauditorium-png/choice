/**
 * The Choice Auditorium - Directory & Emergency Contacts Controller
 */

import { requireAuth, isOwner } from "./auth.js";
import { renderHeader, showToast, openModal, closeModal } from "./common.js";
import { dbStore } from "./firebase-config.js";
import { evaluateNotifications } from "./notifications.js";

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;

  renderHeader("directory");
  evaluateNotifications();

  renderCoreTeam();
  initModals();

  // Search filter
  document.getElementById("dir-search")?.addEventListener("input", () => {
    renderDirectoryTable(dbStore.get("directory"));
  });

  // Subscribe to directory and users updates
  dbStore.subscribe("directory", renderDirectoryTable);
  dbStore.subscribe("users", renderCoreTeam);
});

function renderCoreTeam() {
  const container = document.getElementById("core-team-container");
  if (!container) return;

  const users = dbStore.get("users");
  if (!Array.isArray(users) || users.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.88rem;">No team profiles synced yet.</div>`;
    return;
  }

  container.innerHTML = users.map(u => `
    <div style="background: #FFF; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; box-shadow: var(--shadow-sm); border-top: 3px solid ${u.role === 'owner' ? 'var(--brand-red)' : '#00796B'};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
        <div>
          <h4 style="font-size: 1.05rem; margin-bottom: 2px;">${u.name}</h4>
          <span class="role-tag ${u.role === 'owner' ? 'role-owner' : 'role-worker'}">${u.title || ''} (${u.role})</span>
        </div>
        <div class="user-avatar" style="background: ${u.role === 'owner' ? 'var(--brand-red)' : '#00796B'}; width: 34px; height: 34px;">
          ${u.avatar || (u.name ? u.name.slice(0, 2).toUpperCase() : 'U')}
        </div>
      </div>
      
      <div style="margin-top: 0.75rem; font-size: 0.88rem; line-height: 1.6;">
        <div>
          Tel: <a href="tel:${u.phone}" style="font-weight: bold; color: var(--text);">${u.phone || '—'}</a>
        </div>
        ${u.email && u.email !== '—' ? `
          <div style="font-size: 0.8rem; color: #666; word-break: break-all;">
            Email: <a href="mailto:${u.email}">${u.email}</a>
          </div>
        ` : '<div style="font-size: 0.8rem; color: #999;">Phone communication</div>'}
      </div>
    </div>
  `).join("");
}

function renderDirectoryTable(directory = []) {
  const tbody = document.getElementById("directory-table-tbody");
  if (!tbody) return;

  const search = document.getElementById("dir-search")?.value.toLowerCase() || "";

  const filtered = directory.filter(item => {
    return !search ||
      item.name.toLowerCase().includes(search) ||
      item.role.toLowerCase().includes(search) ||
      item.category.toLowerCase().includes(search) ||
      item.phone.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 2rem; color: #999;">No contacts match search query.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr>
      <td><strong>${item.name}</strong></td>
      <td>${item.role}</td>
      <td>
        <span class="badge" style="background: #F0F0F0; color: #333;">${item.category}</span>
      </td>
      <td>
        <a href="tel:${item.phone}" style="font-weight: bold; color: var(--brand-red);">${item.phone}</a>
      </td>
      <td style="font-size: 0.82rem; color: #666;">${item.notes || '—'}</td>
      <td class="text-right">
        <button class="btn btn-sm btn-secondary edit-dir-btn" data-id="${item.id}">Edit</button>
        ${isOwner() ? `<button class="btn btn-sm btn-danger del-dir-btn" data-id="${item.id}" style="padding: 0.2rem 0.4rem;">Delete</button>` : ''}
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".edit-dir-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = directory.find(x => x.id === btn.dataset.id);
      if (item) openContactModal(item);
    });
  });

  tbody.querySelectorAll(".del-dir-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("Delete this contact?")) {
        dbStore.delete("directory", btn.dataset.id);
        showToast("Contact deleted.");
      }
    });
  });
}

function initModals() {
  document.getElementById("new-contact-btn")?.addEventListener("click", () => openContactModal());
  document.getElementById("close-contact-modal-btn")?.addEventListener("click", () => closeModal("contact-modal"));
  document.getElementById("cancel-contact-modal-btn")?.addEventListener("click", () => closeModal("contact-modal"));
  document.getElementById("save-contact-btn")?.addEventListener("click", handleSaveContact);
}

function openContactModal(item = null) {
  const form = document.getElementById("contact-form");
  form.reset();

  const titleEl = document.getElementById("contact-modal-title");

  if (item) {
    titleEl.textContent = "Edit Contact";
    document.getElementById("contact-id").value = item.id;
    document.getElementById("contact-name").value = item.name;
    document.getElementById("contact-role").value = item.role;
    document.getElementById("contact-category").value = item.category;
    document.getElementById("contact-phone").value = item.phone;
    document.getElementById("contact-notes").value = item.notes || "";
  } else {
    titleEl.textContent = "Add Vendor / Emergency Contact";
    document.getElementById("contact-id").value = "";
    document.getElementById("contact-category").value = "Maintenance";
  }

  openModal("contact-modal");
}

function handleSaveContact() {
  const form = document.getElementById("contact-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const id = document.getElementById("contact-id").value;
  const name = document.getElementById("contact-name").value.trim();
  const role = document.getElementById("contact-role").value.trim();
  const category = document.getElementById("contact-category").value;
  const phone = document.getElementById("contact-phone").value.trim();
  const notes = document.getElementById("contact-notes").value.trim();

  const data = { name, role, category, phone, notes };

  if (id) {
    dbStore.update("directory", id, data);
    showToast("Contact updated.");
  } else {
    dbStore.add("directory", data);
    showToast("Contact added.");
  }

  closeModal("contact-modal");
}
