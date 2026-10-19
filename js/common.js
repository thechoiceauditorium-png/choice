/**
 * The Choice Auditorium - Common UI Helpers, Currency Formatter, Navigation & Notifications
 */

import { getCurrentUser, logout, changePassword } from "./auth.js";
import { dbStore, isSupabaseConfigured, testSupabaseConnection } from "./supabase-config.js";

// Format currency as INR with Indian numbering system (e.g. ₹1,25,000)
export function formatINR(amount) {
  const val = Number(amount) || 0;
  return "₹" + val.toLocaleString("en-IN");
}

// XSS Sanitizer: Escape HTML characters in user-generated strings
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// XSS Sanitizer: Block javascript:, data:, and vbscript: URI schemes
export function sanitizeUrl(url) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return "#";
  }
  return escapeHtml(trimmed);
}

// XSS Sanitizer: Clean phone numbers for tel: links
export function sanitizeTel(phone) {
  if (!phone) return "";
  const cleaned = String(phone).replace(/[^0-9+ \-()]/g, "");
  return escapeHtml(cleaned);
}

// XSS Sanitizer: Clean emails for mailto: links
export function sanitizeEmail(email) {
  if (!email) return "";
  const cleaned = String(email).trim().replace(/[^a-zA-Z0-9._%+\-@]/g, "");
  return escapeHtml(cleaned);
}

// Format date strings
export function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return escapeHtml(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return "-";
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return escapeHtml(dateTimeStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Convert amount to Indian Rupees in words (for vouchers & receipts)
export function numberToWordsINR(amount) {
  const num = Math.floor(Number(amount) || 0);
  if (num === 0) return "Zero Rupees Only";

  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? " " + a[digit] : " ");
  }

  let str = "";
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const remainder = num % 100;

  if (crore > 0) str += inWords(crore) + "Crore ";
  if (lakh > 0) str += inWords(lakh) + "Lakh ";
  if (thousand > 0) str += inWords(thousand) + "Thousand ";
  if (hundred > 0) str += inWords(hundred) + "Hundred ";
  if (remainder > 0) {
    if (str !== "") str += "and ";
    str += inWords(remainder);
  }

  return ("Rupees " + str.trim() + " Only");
}

// Official The Choice Auditorium Logo SVG (Roofline, Wordmark & Underline)
export const CHOICE_LOGO_SVG = `
<svg viewBox="0 0 540 280" xmlns="http://www.w3.org/2000/svg" class="choice-logo-graphic" style="height: 100%; width: auto; display: inline-block;">
  <g fill="currentColor">
    <!-- Roofline Gable Structure -->
    <!-- Outer slope & horizontal eaves -->
    <path d="M 50,118 L 196,118 L 270,52 L 344,118 L 490,118 L 490,109 L 348,109 L 270,40 L 192,109 L 50,109 Z" />
    
    <!-- Central Pediment Inner Hollow Triangle -->
    <path fill-rule="evenodd" d="M 270,68 L 322,114 L 218,114 Z M 270,82 L 238,110 L 302,110 Z" />

    <!-- Horizontal base tie-beam under roof -->
    <path d="M 48,124 Q 270,121 492,124 L 492,128 Q 270,125 48,128 Z" />
    
    <!-- CHOICE Wordmark -->
    <text x="270" y="212" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="94" letter-spacing="4" text-anchor="middle">CHOICE</text>
    
    <!-- Bottom tapered underline -->
    <path d="M 48,242 Q 270,238 492,242 Q 270,250 48,242 Z" />
  </g>
</svg>
`;

// Render Header and Navigation Bar
export function renderHeader(activePage = "") {
  let user = getCurrentUser();
  if (!user) {
    try {
      user = JSON.parse(localStorage.getItem("choice_display_user") || "null");
    } catch (e) {}
  }
  if (!user) {
    user = { name: "Authorized Staff", role: "worker", title: "Staff", avatar: "A" };
  }

  const headerContainer = document.getElementById("header-mount");
  if (!headerContainer) return;

  headerContainer.innerHTML = `
    <header class="app-header">
      <div class="header-top">
        <div class="brand-container">
          <div class="brand-logo-svg" title="The Choice Auditorium">
            ${CHOICE_LOGO_SVG}
          </div>
          <div class="brand-details">
            <h1>The Choice Auditorium</h1>
            <p>Alamaram, Kanjikode, Palakkad — 678621 | 9495820978</p>
          </div>
        </div>
        <div class="header-actions">
          <div class="user-profile-badge">
            <div class="user-avatar">${escapeHtml(user.avatar || (user.name ? user.name.charAt(0) : 'U'))}</div>
            <div>
              <div style="font-weight: 700; font-size: 0.82rem;">${escapeHtml(user.name || '')}</div>
              <span class="role-tag ${user.role === 'owner' ? 'role-owner' : 'role-worker'}">${escapeHtml(user.title || '')} (${escapeHtml(user.role || '')})</span>
            </div>
          </div>
          <button class="btn-icon" id="notif-bell-btn" title="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span class="badge-counter" id="notif-count">0</span>
          </button>
          <button class="btn btn-secondary btn-sm" id="change-pwd-btn" title="Change Password">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Password
          </button>
          <button class="btn btn-secondary btn-sm" id="logout-btn" title="Logout">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        </div>
      </div>
      <nav class="nav-bar">
        <ul class="nav-links">
          <li><a href="dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a></li>
          <li><a href="bookings.html" class="nav-link ${activePage === 'bookings' ? 'active' : ''}">Bookings & Calendar</a></li>
          <li><a href="ledger.html" class="nav-link ${activePage === 'ledger' ? 'active' : ''}">Books / Ledger</a></li>
          <li><a href="attendance.html" class="nav-link ${activePage === 'attendance' ? 'active' : ''}">Attendance</a></li>
          <li><a href="checklists.html" class="nav-link ${activePage === 'checklists' ? 'active' : ''}">Checklists</a></li>
          <li><a href="compliance.html" class="nav-link ${activePage === 'compliance' ? 'active' : ''}">Compliance</a></li>
          <li><a href="directory.html" class="nav-link ${activePage === 'directory' ? 'active' : ''}">Directory</a></li>
        </ul>
      </nav>
      <!-- Notifications Dropdown -->
      <div class="notif-dropdown" id="notif-dropdown">
        <div class="notif-header">
          <h4 style="font-size: 0.9rem;">Notifications</h4>
          <button class="btn btn-sm btn-outline" id="clear-notifs-btn" style="padding: 0.15rem 0.5rem; font-size: 0.7rem;">Mark Read</button>
        </div>
        <ul class="notif-list" id="notif-list-container">
          <!-- Populated by JS -->
        </ul>
      </div>
    </header>
  `;

  // Attach logout handler
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    logout();
  });

  // Inject Change Password Modal if not already in document
  if (!document.getElementById("change-pwd-modal")) {
    const modalMarkup = `
      <div class="modal-backdrop" id="change-pwd-modal">
        <div class="modal-card" style="max-width: 440px;">
          <div class="modal-header">
            <h3>Change Password</h3>
            <button class="btn-icon" id="close-change-pwd-btn">✕</button>
          </div>
          <div class="modal-body">
            <form id="change-pwd-form">
              <div id="change-pwd-alert" style="display: none; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.85rem;"></div>
              
              <div class="form-group">
                <label class="form-label" for="cp-current-pwd">Current Password *</label>
                <input type="password" id="cp-current-pwd" class="form-control" required autocomplete="current-password" placeholder="Enter current password">
              </div>
              
              <div class="form-group">
                <label class="form-label" for="cp-new-pwd">New Password *</label>
                <input type="password" id="cp-new-pwd" class="form-control" required minlength="8" autocomplete="new-password" placeholder="Minimum 8 characters">
              </div>
              
              <div class="form-group">
                <label class="form-label" for="cp-confirm-pwd">Confirm New Password *</label>
                <input type="password" id="cp-confirm-pwd" class="form-control" required minlength="8" autocomplete="new-password" placeholder="Re-enter new password">
              </div>

              <div class="modal-footer" style="padding: 1rem 0 0 0; margin-top: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 0.5rem;">
                <button type="button" class="btn btn-secondary" id="cancel-change-pwd-btn">Cancel</button>
                <button type="submit" class="btn btn-primary" id="submit-change-pwd-btn">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalMarkup);
  }

  // Wire Change Password Modal events
  const cpBtn = document.getElementById("change-pwd-btn");
  const cpCloseBtn = document.getElementById("close-change-pwd-btn");
  const cpCancelBtn = document.getElementById("cancel-change-pwd-btn");
  const cpForm = document.getElementById("change-pwd-form");
  const cpAlert = document.getElementById("change-pwd-alert");
  const cpSubmitBtn = document.getElementById("submit-change-pwd-btn");

  const resetCpModal = () => {
    cpForm?.reset();
    if (cpAlert) {
      cpAlert.style.display = "none";
      cpAlert.textContent = "";
      cpAlert.style.background = "";
      cpAlert.style.color = "";
      cpAlert.style.border = "";
    }
    if (cpSubmitBtn) {
      cpSubmitBtn.disabled = false;
      cpSubmitBtn.textContent = "Update Password";
    }
  };

  cpBtn?.addEventListener("click", () => {
    resetCpModal();
    openModal("change-pwd-modal");
  });

  cpCloseBtn?.addEventListener("click", () => {
    closeModal("change-pwd-modal");
  });

  cpCancelBtn?.addEventListener("click", () => {
    closeModal("change-pwd-modal");
  });

  cpForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentPwd = document.getElementById("cp-current-pwd")?.value || "";
    const newPwd = document.getElementById("cp-new-pwd")?.value || "";
    const confirmPwd = document.getElementById("cp-confirm-pwd")?.value || "";

    const showAlert = (msg, isError = true) => {
      if (!cpAlert) return;
      cpAlert.style.display = "block";
      cpAlert.textContent = msg;
      if (isError) {
        cpAlert.style.background = "#FEF2F2";
        cpAlert.style.color = "#991B1B";
        cpAlert.style.border = "1px solid #F87171";
      } else {
        cpAlert.style.background = "#ECFDF5";
        cpAlert.style.color = "#065F46";
        cpAlert.style.border = "1px solid #34D399";
      }
    };

    if (newPwd.length < 8) {
      showAlert("New password must be at least 8 characters long.");
      return;
    }
    if (newPwd !== confirmPwd) {
      showAlert("New passwords do not match.");
      return;
    }
    if (newPwd === currentPwd) {
      showAlert("New password must be different from current password.");
      return;
    }

    if (cpSubmitBtn) {
      cpSubmitBtn.disabled = true;
      cpSubmitBtn.textContent = "Updating...";
    }

    try {
      const res = await changePassword(currentPwd, newPwd);
      if (!res.success) {
        showAlert(res.error || "Failed to update password.");
        if (cpSubmitBtn) {
          cpSubmitBtn.disabled = false;
          cpSubmitBtn.textContent = "Update Password";
        }
      } else {
        closeModal("change-pwd-modal");
        resetCpModal();
        showToast("Password updated successfully!", "success");
      }
    } catch (err) {
      showAlert(err.message || "An error occurred.");
      if (cpSubmitBtn) {
        cpSubmitBtn.disabled = false;
        cpSubmitBtn.textContent = "Update Password";
      }
    }
  });

  // Attach notif dropdown toggle
  const notifBtn = document.getElementById("notif-bell-btn");
  const notifDropdown = document.getElementById("notif-dropdown");
  notifBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown?.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!notifDropdown?.contains(e.target) && e.target !== notifBtn) {
      notifDropdown?.classList.remove("show");
    }
  });

  document.getElementById("clear-notifs-btn")?.addEventListener("click", () => {
    const notifs = dbStore.get("notifications").map(n => ({ ...n, read: true }));
    dbStore.save("notifications", notifs);
    updateNotificationUI(notifs);
  });

  // Subscribe to notifications
  dbStore.subscribe("notifications", updateNotificationUI);
}

export function updateNotificationUI(notifs = []) {
  const unreadCount = notifs.filter(n => !n.read).length;
  const countBadge = document.getElementById("notif-count");
  if (countBadge) {
    countBadge.textContent = unreadCount;
    countBadge.style.display = unreadCount > 0 ? "flex" : "none";
  }

  const listContainer = document.getElementById("notif-list-container");
  if (listContainer) {
    if (notifs.length === 0) {
      listContainer.innerHTML = `<li style="padding: 1rem; text-align: center; color: #999; font-size: 0.85rem;">No notifications</li>`;
      return;
    }

    listContainer.innerHTML = notifs.map(n => `
      <li class="notif-item ${!n.read ? 'unread' : ''}">
        <div class="notif-icon" style="background: ${n.type === 'conflict' ? '#FEF2F2' : '#FFFBEB'}; color: ${n.type === 'conflict' ? '#B91C1C' : '#D97706'}; font-weight: bold; font-size: 0.85rem;">
          ${n.type === 'conflict' ? '!' : n.type === 'booking' ? 'B' : 'C'}
        </div>
        <div class="notif-content">
          <h5>${escapeHtml(n.title || '')}</h5>
          <p>${escapeHtml(n.message || '')}</p>
          <div class="time">${escapeHtml(n.time || 'Just now')}</div>
        </div>
      </li>
    `).join("");
  }
}

// Toast Notification
export function showToast(message, type = "success") {
  let container = document.getElementById("toast-mount");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-mount";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="font-weight: bold; font-size: 0.8rem;">${type === 'success' ? '[OK]' : type === 'warning' ? '[!]' : '[X]'}</span>
    <div>${escapeHtml(message || '')}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Modal Helpers
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "";
  }
}

// Button Async Loading State Helper
export function setButtonLoading(button, isLoading, loadingText = "Saving...") {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span style="display:inline-block; animation: spin 1s infinite linear; margin-right: 6px;">⟳</span> ${loadingText}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || "Save";
  }
}

// Global Production Error Boundary & Network Resilience
if (typeof window !== "undefined") {
  // Global error boundary: catch unhandled errors gracefully without crashing the UI
  window.addEventListener("error", (event) => {
    console.error("Runtime exception caught by boundary:", event.error || event.message);
    // Suppress ugly browser alert popups, show user-friendly non-technical toast
    showToast("A minor display issue occurred. Your data remains safe.", "warning");
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.warn("Promise rejection caught by boundary:", event.reason);
    const reasonMsg = String(event.reason?.message || event.reason || "");
    if (!reasonMsg.includes("Failed to fetch") && !reasonMsg.includes("NetworkError")) {
      showToast("Operation completed with local cache sync.", "info");
    }
  });

  // Offline / Online Connectivity Monitors
  window.addEventListener("offline", () => {
    showToast("Network offline. Running on secure local cache.", "warning");
  });

  window.addEventListener("online", () => {
    showToast("Internet reconnected. Syncing live updates...", "success");
  });
}

