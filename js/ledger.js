/**
 * The Choice Auditorium - Books & Financial Ledger Controller
 */

import { requireAuth, isOwner, getCurrentUser } from "./auth.js";
import { renderHeader, formatINR, formatDate, numberToWordsINR, showToast, openModal, closeModal, escapeHtml } from "./common.js";
import { dbStore } from "./firebase-config.js";
import { evaluateNotifications } from "./notifications.js";

const INCOME_CATEGORIES = [
  "Hall rent (advance)",
  "Hall rent (balance)",
  "Commission",
  "Donations",
  "Others"
];

const EXPENSE_CATEGORIES = [
  "Wages",
  "Allowance",
  "Broadband bill",
  "Mobile recharge",
  "Diesel charges",
  "Electricity bill",
  "Water charges",
  "Harithakarmasena (waste management)",
  "Panchayath tax (October–March cycle)",
  "Panchayath tax (April–September cycle)",
  "Revenue tax",
  "Professional tax",
  "Cleaning charges",
  "Electrical charges",
  "Plumbing charges",
  "Electrical Directorate renewal fees",
  "Fire and Safety licence fees",
  "Maintenance",
  "GST",
  "UPI charges",
  "Bank loan (EMI/payment)",
  "Fire and theft insurance",
  "New asset purchases",
  "Cash in hand (running balance)",
  "Others"
];

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;

  renderHeader("ledger");
  evaluateNotifications();

  initCategoryDropdowns();
  initFormAndModals();
  initFilters();

  // Set default month filter to current month
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthInput = document.getElementById("ledger-month-filter");
  if (monthInput) monthInput.value = currentYM;

  // Subscribe to ledger updates
  dbStore.subscribe("ledger", (ledger) => {
    renderLedgerTable(ledger);
    renderMonthlySummary(ledger);
  });

  // Check URL params for quick actions
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("action") === "new") {
    openEntryModal();
  }
});

function initCategoryDropdowns() {
  const catFilter = document.getElementById("ledger-cat-filter");
  if (catFilter) {
    const allCats = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
    allCats.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      catFilter.appendChild(opt);
    });
  }
}

function updateEntryCategoryDropdown(type) {
  const catSelect = document.getElementById("entry-category");
  if (!catSelect) return;
  catSelect.innerHTML = "";

  const list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  list.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  });

  handleCategoryChange();
}

function handleCategoryChange() {
  const cat = document.getElementById("entry-category")?.value;
  const maintWrapper = document.getElementById("maint-desc-wrapper");
  const maintDescInput = document.getElementById("entry-maint-desc");

  if (cat === "Maintenance") {
    maintWrapper.style.display = "block";
    maintDescInput.required = true;
  } else {
    maintWrapper.style.display = "none";
    maintDescInput.required = false;
  }
}

function initFormAndModals() {
  // New entry modal triggers
  document.getElementById("open-new-entry-btn")?.addEventListener("click", () => openEntryModal());
  document.getElementById("close-entry-modal-btn")?.addEventListener("click", () => closeModal("entry-modal"));
  document.getElementById("cancel-entry-modal-btn")?.addEventListener("click", () => closeModal("entry-modal"));

  // Transaction type change
  document.getElementById("entry-type")?.addEventListener("change", (e) => {
    updateEntryCategoryDropdown(e.target.value);
  });

  document.getElementById("entry-category")?.addEventListener("change", handleCategoryChange);

  // Save entry
  document.getElementById("save-entry-btn")?.addEventListener("click", handleSaveEntry);
}

function initFilters() {
  const rerender = () => renderLedgerTable(dbStore.get("ledger"));
  document.getElementById("ledger-search")?.addEventListener("input", rerender);
  document.getElementById("ledger-type-filter")?.addEventListener("change", rerender);
  document.getElementById("ledger-cat-filter")?.addEventListener("change", rerender);
  document.getElementById("ledger-month-filter")?.addEventListener("change", () => {
    rerender();
    renderMonthlySummary(dbStore.get("ledger"));
  });

  document.getElementById("reset-filters-btn")?.addEventListener("click", () => {
    document.getElementById("ledger-search").value = "";
    document.getElementById("ledger-type-filter").value = "all";
    document.getElementById("ledger-cat-filter").value = "all";
    document.getElementById("ledger-month-filter").value = "";
    rerender();
    renderMonthlySummary(dbStore.get("ledger"));
  });
}

function openEntryModal(entry = null) {
  const form = document.getElementById("entry-form");
  form.reset();

  const titleEl = document.getElementById("entry-modal-title");
  const bkSelect = document.getElementById("entry-booking");

  // Populate booking dropdown
  const bookings = dbStore.get("bookings");
  bkSelect.innerHTML = `<option value="">-- None (Standalone) --</option>`;
  bookings.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = `#${b.bookingNo} - ${b.customerName} (${formatDate(b.reservationDate)})`;
    bkSelect.appendChild(opt);
  });

  if (entry) {
    titleEl.textContent = "Edit Ledger Entry";
    document.getElementById("entry-id").value = entry.id;
    document.getElementById("entry-date").value = entry.date;
    document.getElementById("entry-type").value = entry.type;
    updateEntryCategoryDropdown(entry.type);
    document.getElementById("entry-category").value = entry.category;
    document.getElementById("entry-amount").value = entry.amount;
    document.getElementById("entry-desc").value = entry.description || "";
    document.getElementById("entry-booking").value = entry.bookingId || "";
    if (entry.category === "Maintenance") {
      document.getElementById("entry-maint-desc").value = entry.description || "";
    }
  } else {
    titleEl.textContent = "Log Ledger Entry";
    document.getElementById("entry-id").value = "";
    document.getElementById("entry-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("entry-type").value = "expense";
    updateEntryCategoryDropdown("expense");
  }

  handleCategoryChange();
  openModal("entry-modal");
}

function handleSaveEntry() {
  const form = document.getElementById("entry-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const id = document.getElementById("entry-id").value;
  const date = document.getElementById("entry-date").value;
  const type = document.getElementById("entry-type").value;
  const category = document.getElementById("entry-category").value;
  const amount = Number(document.getElementById("entry-amount").value);
  if (isNaN(amount) || amount <= 0) {
    showToast("Please enter a valid positive amount.", "warning");
    return;
  }
  const bookingId = document.getElementById("entry-booking").value;
  const user = getCurrentUser();

  let description = document.getElementById("entry-desc").value.trim();
  if (category === "Maintenance") {
    const maintText = document.getElementById("entry-maint-desc").value.trim();
    if (!maintText) {
      showToast("Maintenance description is mandatory.", "warning");
      return;
    }
    description = maintText;
  }

  const entryData = {
    date,
    type,
    category,
    amount,
    description,
    bookingId: bookingId || null,
    loggedBy: user.name
  };

  if (id) {
    dbStore.update("ledger", id, entryData);
    showToast("Ledger entry updated.");
  } else {
    entryData.createdAt = new Date().toISOString();
    dbStore.add("ledger", entryData);
    showToast("Ledger entry logged successfully.");
  }

  closeModal("entry-modal");
}

function renderLedgerTable(ledger = []) {
  const tbody = document.getElementById("ledger-table-tbody");
  if (!tbody) return;

  const search = document.getElementById("ledger-search")?.value.toLowerCase() || "";
  const typeFilter = document.getElementById("ledger-type-filter")?.value || "all";
  const catFilter = document.getElementById("ledger-cat-filter")?.value || "all";
  const monthFilter = document.getElementById("ledger-month-filter")?.value || "";

  const bookings = dbStore.get("bookings");

  const filtered = ledger.filter(entry => {
    const matchType = typeFilter === "all" || entry.type === typeFilter;
    const matchCat = catFilter === "all" || entry.category === catFilter;
    const matchMonth = !monthFilter || (entry.date && entry.date.startsWith(monthFilter));
    const matchSearch = !search ||
      (entry.description && entry.description.toLowerCase().includes(search)) ||
      (entry.category && entry.category.toLowerCase().includes(search)) ||
      (entry.loggedBy && entry.loggedBy.toLowerCase().includes(search));
    return matchType && matchCat && matchMonth && matchSearch;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const countBadge = document.getElementById("ledger-records-badge");
  if (countBadge) countBadge.textContent = `${filtered.length} Records`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 2rem; color: #999;">No transactions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isIncome = item.type === "income";
    const linkedBk = item.bookingId ? bookings.find(b => b.id === item.bookingId) : null;

    return `
      <tr>
        <td><strong>${formatDate(item.date)}</strong></td>
        <td>
          <span class="badge ${isIncome ? 'badge-confirmed' : 'badge-cancelled'}" style="text-transform: capitalize;">
            ${isIncome ? 'Income' : 'Expense'}
          </span>
        </td>
        <td><strong>${escapeHtml(item.category || '')}</strong></td>
        <td>
          <div style="max-width: 320px; font-size: 0.85rem;">${escapeHtml(item.description || '—')}</div>
        </td>
        <td style="font-size: 0.82rem;">
          ${linkedBk ? `<a href="bookings.html">#${escapeHtml(linkedBk.bookingNo || '')} (${escapeHtml(linkedBk.customerName || '')})</a>` : '<span style="color: #999;">—</span>'}
        </td>
        <td class="text-right" style="font-weight: 800; color: ${isIncome ? '#2E7D32' : '#C62828'};">
          ${isIncome ? '+' : '-'}${formatINR(item.amount)}
        </td>
        <td style="font-size: 0.82rem; color: #666;">${escapeHtml(item.loggedBy || 'Staff')}</td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 6px; justify-content: flex-end; align-items: center;">
            <button class="btn btn-sm btn-secondary edit-entry-btn" data-id="${item.id}" style="padding: 0.3rem 0.65rem; font-size: 0.78rem;">Edit</button>
            ${isOwner() ? `<button class="btn btn-sm btn-danger del-entry-btn" data-id="${item.id}" style="padding: 0.3rem 0.65rem; font-size: 0.78rem;">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".edit-entry-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const e = ledger.find(x => x.id === btn.dataset.id);
      if (e) openEntryModal(e);
    });
  });

  tbody.querySelectorAll(".del-entry-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("Delete this ledger transaction?")) {
        dbStore.delete("ledger", btn.dataset.id);
        showToast("Transaction deleted.");
      }
    });
  });
}

function renderMonthlySummary(ledger = []) {
  const monthFilter = document.getElementById("ledger-month-filter")?.value || "";
  
  let income = 0;
  let expense = 0;
  let incCount = 0;
  let expCount = 0;

  ledger.forEach(item => {
    if (!monthFilter || (item.date && item.date.startsWith(monthFilter))) {
      if (item.type === "income") {
        income += Number(item.amount) || 0;
        incCount++;
      } else if (item.type === "expense") {
        expense += Number(item.amount) || 0;
        expCount++;
      }
    }
  });

  const net = income - expense;

  const incEl = document.getElementById("summary-total-income");
  const expEl = document.getElementById("summary-total-expense");
  const netEl = document.getElementById("summary-net-balance");

  if (incEl) incEl.textContent = formatINR(income);
  if (expEl) expEl.textContent = formatINR(expense);
  if (netEl) {
    netEl.textContent = formatINR(net);
    netEl.style.color = net >= 0 ? "#1565C0" : "#C62828";
  }

  const incSub = document.getElementById("summary-income-count");
  const expSub = document.getElementById("summary-expense-count");
  if (incSub) incSub.textContent = `${incCount} transactions`;
  if (expSub) expSub.textContent = `${expCount} transactions`;
}
