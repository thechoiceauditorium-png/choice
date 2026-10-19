/**
 * The Choice Auditorium - Directory, Contacts & User Access Management
 * Includes Core Team Directory, Vendor / Emergency List, and
 * Centralized User & Password Provisioning Console for Director Abin.
 */

import { requireAuth, isOwner, getCurrentUser } from "./auth.js";
import { renderHeader, showToast, openModal, closeModal, escapeHtml, sanitizeTel, sanitizeEmail } from "./common.js";
import { dbStore, getSupabase } from "./supabase-config.js";
import { evaluateNotifications } from "./notifications.js";

/**
 * Checks if active session belongs to Director Abin or System Administrator
 */
export function isDirectorAbin() {
  const user = getCurrentUser();
  if (!user) return false;
  const email = (user.email || "").toLowerCase();
  const name = (user.name || "").toLowerCase();
  return isOwner() && (email.includes("abin") || name.includes("abin") || email.includes("elby"));
}

async function initDirectoryPage() {
  const user = await requireAuth();
  if (!user) return;

  renderHeader("directory");
  evaluateNotifications();

  renderCoreTeam();
  renderAbinUserManagement();
  initModals();

  // Search filter for vendors
  document.getElementById("dir-search")?.addEventListener("input", () => {
    renderDirectoryTable(dbStore.get("directory"));
  });

  // Subscriptions to live updates
  dbStore.subscribe("directory", renderDirectoryTable);
  dbStore.subscribe("users", () => {
    renderCoreTeam();
    renderAbinUserManagement();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDirectoryPage);
} else {
  initDirectoryPage();
}

/**
 * Renders Core Management & Operations team cards with Admin edit controls
 */
function renderCoreTeam() {
  const container = document.getElementById("core-team-container");
  const hintEl = document.getElementById("team-edit-hint");
  if (!container) return;

  const users = dbStore.get("users");
  const userIsOwner = isOwner();
  const abinActive = isDirectorAbin();

  if (hintEl) {
    hintEl.textContent = userIsOwner ? "Admin Edit Enabled" : "";
  }

  if (!Array.isArray(users) || users.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.88rem;">No team profiles synced yet.</div>`;
    return;
  }

  container.innerHTML = users.map(u => `
    <div style="background: #FFF; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; box-shadow: var(--shadow-sm); border-top: 3px solid ${u.role === 'owner' ? 'var(--brand-red)' : '#00796B'}; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div>
            <h4 style="font-size: 1.05rem; margin-bottom: 2px;">${escapeHtml(u.name || '')}</h4>
            <span class="role-tag ${u.role === 'owner' ? 'role-owner' : 'role-worker'}">${escapeHtml(u.title || '')} (${escapeHtml(u.role || '')})</span>
          </div>
          <div class="user-avatar" style="background: ${u.role === 'owner' ? 'var(--brand-red)' : '#00796B'}; width: 34px; height: 34px;">
            ${escapeHtml(u.avatar || (u.name ? u.name.slice(0, 2).toUpperCase() : 'U'))}
          </div>
        </div>
        
        <div style="margin-top: 0.75rem; font-size: 0.88rem; line-height: 1.6;">
          <div>
            Tel: <a href="tel:${sanitizeTel(u.phone)}" style="font-weight: bold; color: var(--text);">${escapeHtml(u.phone || '—')}</a>
          </div>
          ${u.email && u.email !== '—' ? `
            <div style="font-size: 0.8rem; color: #666; word-break: break-all;">
              Email: <a href="mailto:${sanitizeEmail(u.email)}">${escapeHtml(u.email)}</a>
            </div>
          ` : '<div style="font-size: 0.8rem; color: #999;">Phone communication</div>'}
        </div>
      </div>

      ${userIsOwner ? `
        <div style="display: flex; gap: 0.4rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed var(--border);">
          <button class="btn btn-sm btn-secondary edit-team-btn" data-id="${escapeHtml(u.id)}" style="flex: 1; font-size: 0.75rem;">
            Edit Details
          </button>
          ${abinActive ? `
            <button class="btn btn-sm btn-outline abin-set-pw-btn" data-id="${escapeHtml(u.id)}" style="flex: 1; font-size: 0.75rem; border-color: #6A1B9A; color: #6A1B9A;">
              Set Password
            </button>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `).join("");

  // Attach card edit handlers
  container.querySelectorAll(".edit-team-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) openEditTeamUserModal(u);
    });
  });

  container.querySelectorAll(".abin-set-pw-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) openAbinPasswordModal(u);
    });
  });
}

/**
 * Renders Director Abin User & Login Management Console
 */
function renderAbinUserManagement() {
  const card = document.getElementById("abin-management-card");
  const topBtn = document.getElementById("abin-add-user-btn");
  const tbody = document.getElementById("abin-users-table-tbody");
  if (!card || !tbody) return;

  const abinActive = isDirectorAbin();
  if (!abinActive) {
    card.style.display = "none";
    if (topBtn) topBtn.style.display = "none";
    return;
  }

  card.style.display = "block";
  if (topBtn) topBtn.style.display = "inline-block";

  const users = dbStore.get("users") || [];

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 1.5rem; color: #999;">No user accounts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.name || '')}</strong></td>
      <td>
        <span class="role-tag ${u.role === 'owner' ? 'role-owner' : 'role-worker'}">
          ${escapeHtml(u.role || '')}
        </span>
      </td>
      <td style="font-size: 0.82rem; color: #555;">${escapeHtml(u.title || '')}</td>
      <td style="font-family: monospace; font-size: 0.82rem;">${escapeHtml(u.email || '—')}</td>
      <td><a href="tel:${sanitizeTel(u.phone)}" style="font-weight: 600; color: var(--text);">${escapeHtml(u.phone || '—')}</a></td>
      <td class="text-right" style="white-space: nowrap;">
        <div style="display: inline-flex; gap: 0.35rem; align-items: center;">
          <button class="btn btn-sm btn-outline abin-table-pw-btn" data-id="${escapeHtml(u.id)}" style="border-color: #6A1B9A; color: #6A1B9A; font-size: 0.75rem;">
            Set Password
          </button>
          <button class="btn btn-sm btn-secondary abin-table-edit-btn" data-id="${escapeHtml(u.id)}" style="font-size: 0.75rem;">
            Edit Info
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".abin-table-pw-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) openAbinPasswordModal(u);
    });
  });

  tbody.querySelectorAll(".abin-table-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) openEditTeamUserModal(u);
    });
  });
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
      <td><strong>${escapeHtml(item.name || '')}</strong></td>
      <td>${escapeHtml(item.role || '')}</td>
      <td>
        <span class="badge" style="background: #F0F0F0; color: #333;">${escapeHtml(item.category || '')}</span>
      </td>
      <td>
        <a href="tel:${sanitizeTel(item.phone)}" style="font-weight: bold; color: var(--brand-red);">${escapeHtml(item.phone || '')}</a>
      </td>
      <td style="font-size: 0.82rem; color: #666;">${escapeHtml(item.notes || '—')}</td>
      <td class="text-right">
        <button class="btn btn-sm btn-secondary edit-dir-btn" data-id="${escapeHtml(item.id)}">Edit</button>
        ${isOwner() ? `<button class="btn btn-sm btn-danger del-dir-btn" data-id="${escapeHtml(item.id)}" style="padding: 0.2rem 0.4rem;">Delete</button>` : ''}
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
  // Vendor / Emergency contact modal
  document.getElementById("new-contact-btn")?.addEventListener("click", () => openContactModal());
  document.getElementById("close-contact-modal-btn")?.addEventListener("click", () => closeModal("contact-modal"));
  document.getElementById("cancel-contact-modal-btn")?.addEventListener("click", () => closeModal("contact-modal"));
  document.getElementById("save-contact-btn")?.addEventListener("click", handleSaveContact);

  // Edit Core Team Member Modal
  document.getElementById("close-team-modal-btn")?.addEventListener("click", () => closeModal("edit-team-user-modal"));
  document.getElementById("cancel-team-modal-btn")?.addEventListener("click", () => closeModal("edit-team-user-modal"));
  document.getElementById("save-team-user-btn")?.addEventListener("click", handleSaveTeamUser);

  // Director Abin User Provisioning Modal
  const openCreateHandler = () => openAbinCreateUserModal();
  document.getElementById("abin-add-user-btn")?.addEventListener("click", openCreateHandler);
  document.getElementById("abin-open-create-user-btn")?.addEventListener("click", openCreateHandler);
  document.getElementById("close-abin-modal-btn")?.addEventListener("click", () => closeModal("abin-user-modal"));
  document.getElementById("cancel-abin-modal-btn")?.addEventListener("click", () => closeModal("abin-user-modal"));
  document.getElementById("save-abin-user-btn")?.addEventListener("click", handleSaveAbinUser);
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

/**
 * Admin: Open modal to edit existing core team member details
 */
function openEditTeamUserModal(user) {
  if (!isOwner()) {
    showToast("Only administrators can edit team member profiles.", "danger");
    return;
  }

  document.getElementById("edit-team-user-id").value = user.id;
  document.getElementById("edit-team-name").value = user.name || "";
  document.getElementById("edit-team-title").value = user.title || "";
  document.getElementById("edit-team-role").value = user.role || "worker";
  document.getElementById("edit-team-phone").value = user.phone || "";
  document.getElementById("edit-team-email").value = user.email || "";

  openModal("edit-team-user-modal");
}

function handleSaveTeamUser() {
  if (!isOwner()) {
    showToast("Only administrators can edit team profiles.", "danger");
    return;
  }

  const form = document.getElementById("edit-team-user-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const id = document.getElementById("edit-team-user-id").value;
  const name = document.getElementById("edit-team-name").value.trim();
  const title = document.getElementById("edit-team-title").value.trim();
  const role = document.getElementById("edit-team-role").value;
  const phone = document.getElementById("edit-team-phone").value.trim();
  const email = document.getElementById("edit-team-email").value.trim();

  const users = dbStore.get("users");
  const idx = users.findIndex(u => u.id === id);

  if (idx !== -1) {
    users[idx].name = name;
    users[idx].title = title;
    users[idx].role = role;
    users[idx].phone = phone;
    users[idx].email = email;
    users[idx].avatar = name.slice(0, 2).toUpperCase();

    dbStore.save("users", users);
    showToast(`Updated details for ${name}.`, "success");
  }

  closeModal("edit-team-user-modal");
}

/**
 * Director Abin: Open modal to create a new user and set their password
 */
function openAbinCreateUserModal() {
  if (!isDirectorAbin()) {
    showToast("Only Director Abin can provision accounts and assign passwords.", "danger");
    return;
  }

  const form = document.getElementById("abin-user-form");
  form.reset();

  document.getElementById("abin-modal-title").textContent = "Provision New User & Password (Director Abin)";
  document.getElementById("abin-edit-mode").value = "create";
  document.getElementById("abin-user-email").readOnly = false;
  document.getElementById("abin-user-email").style.background = "#FFF";
  document.getElementById("abin-user-password").required = true;

  openModal("abin-user-modal");
}

/**
 * Director Abin: Open modal to set / change password for an existing user
 */
function openAbinPasswordModal(user) {
  if (!isDirectorAbin()) {
    showToast("Only Director Abin can set or change user passwords.", "danger");
    return;
  }

  const form = document.getElementById("abin-user-form");
  form.reset();

  document.getElementById("abin-modal-title").textContent = `Set Password for ${user.name} (Director Abin)`;
  document.getElementById("abin-edit-mode").value = "password";
  document.getElementById("abin-user-name").value = user.name || "";
  document.getElementById("abin-user-role").value = user.role || "worker";
  document.getElementById("abin-user-title").value = user.title || "";
  document.getElementById("abin-user-email").value = user.email || "";
  document.getElementById("abin-user-email").readOnly = true;
  document.getElementById("abin-user-email").style.background = "#F5F5F5";
  document.getElementById("abin-user-phone").value = user.phone || "";
  document.getElementById("abin-user-password").value = "";
  document.getElementById("abin-user-password").placeholder = "Enter new password (min 6 characters)";
  document.getElementById("abin-user-password").required = true;

  openModal("abin-user-modal");
}

/**
 * Director Abin: Save user credentials via Supabase RPC and local synchronization
 */
async function handleSaveAbinUser() {
  if (!isDirectorAbin()) {
    showToast("Only Director Abin can issue credentials.", "danger");
    return;
  }

  const form = document.getElementById("abin-user-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const mode = document.getElementById("abin-edit-mode").value;
  const name = document.getElementById("abin-user-name").value.trim();
  const role = document.getElementById("abin-user-role").value;
  const title = document.getElementById("abin-user-title").value.trim();
  const email = document.getElementById("abin-user-email").value.trim().toLowerCase();
  const phone = document.getElementById("abin-user-phone").value.trim();
  const password = document.getElementById("abin-user-password").value;

  const btn = document.getElementById("save-abin-user-btn");
  if (btn) btn.disabled = true;

  try {
    const sb = await getSupabase();
    let authUpdated = false;
    let authError = null;

    // 1. Call server-side Admin API (uses service role key to set password in Supabase Auth GoTrue)
    try {
      const { data: { session } } = sb?.auth ? await sb.auth.getSession() : { data: {} };
      const authToken = session?.access_token || "";

      const apiRes = await fetch("/api/admin/manage-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authToken ? `Bearer ${authToken}` : ""
        },
        body: JSON.stringify({
          email,
          password,
          name,
          role,
          title,
          phone
        })
      });

      const apiData = await apiRes.json();
      if (apiRes.ok && apiData.success) {
        authUpdated = true;
      } else {
        authError = apiData.error || "Server admin API returned error.";
      }
    } catch (apiErr) {
      authError = apiErr.message;
    }

    // 2. Fallback: try Postgres RPC if API endpoint unavailable
    if (!authUpdated && sb && sb.rpc) {
      try {
        const { data, error } = await sb.rpc("admin_manage_user", {
          p_email: email,
          p_password: password,
          p_name: name,
          p_role: role,
          p_title: title,
          p_phone: phone
        });

        if (!error && data?.success) {
          authUpdated = true;
          authError = null;
        }
      } catch (err) {}
    }

    if (!authUpdated) {
      throw new Error(authError || "Failed to update user password in Supabase Auth.");
    }

    // Synchronize with public.team_users & dbStore
    const users = dbStore.get("users") || [];
    const slugId = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const existingIdx = users.findIndex(u => u.email?.toLowerCase() === email || u.id === slugId);

    const userProfile = {
      id: existingIdx !== -1 ? users[existingIdx].id : slugId,
      name,
      role,
      title,
      phone,
      email,
      avatar: name.slice(0, 2).toUpperCase(),
      createdAt: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      users[existingIdx] = { ...users[existingIdx], ...userProfile };
    } else {
      users.push(userProfile);
    }

    dbStore.save("users", users);
    closeModal("abin-user-modal");

    const actionText = mode === "create" ? "created and login password set in Supabase" : "password updated in Supabase";
    showToast(`User ${name} ${actionText} by Director Abin!`, "success");
  } catch (e) {
    console.error("Error managing user:", e);
    showToast(e.message || "Error updating user credentials.", "danger");
  } finally {
    if (btn) btn.disabled = false;
  }
}
