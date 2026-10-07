/**
 * The Choice Auditorium - Common UI Helpers, Currency Formatter, Navigation & Notifications
 */

import { getCurrentUser, logout } from "./auth.js";
import { dbStore, isSupabaseConfigured, testSupabaseConnection } from "./supabase-config.js";

// Format currency as INR with Indian numbering system (e.g. ₹1,25,000)
export function formatINR(amount) {
  const val = Number(amount) || 0;
  return "₹" + val.toLocaleString("en-IN");
}

// Format date strings
export function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return "-";
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return dateTimeStr;
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
  const user = getCurrentUser();
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
            <div class="user-avatar">${user.avatar || user.name.charAt(0)}</div>
            <div>
              <div style="font-weight: 700; font-size: 0.82rem;">${user.name}</div>
              <span class="role-tag ${user.role === 'owner' ? 'role-owner' : 'role-worker'}">${user.title} (${user.role})</span>
            </div>
          </div>
          <button class="btn-icon" id="notif-bell-btn" title="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span class="badge-counter" id="notif-count">0</span>
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
          <li><a href="certificate.html" class="nav-link ${activePage === 'certificate' ? 'active' : ''}">Certificate</a></li>
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
          <h5>${n.title}</h5>
          <p>${n.message}</p>
          <div class="time">${n.time || 'Just now'}</div>
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
    <div>${message}</div>
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
