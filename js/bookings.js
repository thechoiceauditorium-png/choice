/**
 * The Choice Auditorium - Booking Calendar & Receipt Engine
 */

import { requireAuth, isOwner } from "./auth.js";
import { renderHeader, formatINR, formatDate, formatDateTime, numberToWordsINR, showToast, openModal, closeModal } from "./common.js";
import { dbStore } from "./firebase-config.js";
import { evaluateNotifications } from "./notifications.js";

let currentCalDate = new Date();
let currentBookingToPrint = null;

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;

  renderHeader("bookings");
  evaluateNotifications();

  initCalendarControls();
  initBookingForm();

  // Subscribe to bookings updates
  dbStore.subscribe("bookings", (bookings) => {
    renderCalendarView(bookings);
    renderListView(bookings);
    updateCountBadge(bookings);
  });

  // Check URL params for ?action=new
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("action") === "new") {
    openBookingModal();
  }
});

function initCalendarControls() {
  const prevBtn = document.getElementById("cal-prev-month");
  const nextBtn = document.getElementById("cal-next-month");
  const todayBtn = document.getElementById("cal-today-btn");

  prevBtn?.addEventListener("click", () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendarView(dbStore.get("bookings"));
  });

  nextBtn?.addEventListener("click", () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendarView(dbStore.get("bookings"));
  });

  todayBtn?.addEventListener("click", () => {
    currentCalDate = new Date();
    renderCalendarView(dbStore.get("bookings"));
  });

  // Toggle calendar / list view
  const calViewBtn = document.getElementById("view-calendar-btn");
  const listViewBtn = document.getElementById("view-list-btn");
  const calPanel = document.getElementById("calendar-view-panel");
  const listPanel = document.getElementById("list-view-panel");

  calViewBtn?.addEventListener("click", () => {
    calPanel.style.display = "block";
    listPanel.style.display = "none";
    calViewBtn.style.background = "var(--brand-red-light)";
    calViewBtn.style.color = "var(--brand-red)";
    listViewBtn.style.background = "#FFF";
    listViewBtn.style.color = "var(--text-light)";
  });

  listViewBtn?.addEventListener("click", () => {
    calPanel.style.display = "none";
    listPanel.style.display = "block";
    listViewBtn.style.background = "var(--brand-red-light)";
    listViewBtn.style.color = "var(--brand-red)";
    calViewBtn.style.background = "#FFF";
    calViewBtn.style.color = "var(--text-light)";
  });
}

function updateCountBadge(bookings) {
  const badge = document.getElementById("bookings-count-badge");
  if (badge) {
    badge.textContent = `${bookings.length} Bookings`;
  }
}

function renderCalendarView(bookings = []) {
  const titleEl = document.getElementById("cal-month-title");
  const gridCells = document.getElementById("calendar-grid-cells");
  if (!gridCells) return;

  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();

  if (titleEl) {
    titleEl.textContent = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(currentCalDate);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let html = "";

  // Prev month filler cells
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    html += `<div class="cal-day-cell diff-month"><span class="cal-day-number">${dayNum}</span></div>`;
  }

  // Current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = cellDateStr === todayStr;

    // Find bookings on this date
    const dayBookings = bookings.filter(b => b.reservationDate === cellDateStr);

    let eventPillsHtml = "";
    dayBookings.forEach(b => {
      const pillClass = b.status === "Confirmed" ? "confirmed" : b.status === "Enquiry" ? "enquiry" : "";
      eventPillsHtml += `
        <div class="cal-event-pill ${pillClass}" data-id="${b.id}" title="${b.customerName} (${b.status})">
          #${b.bookingNo} ${b.customerName}
        </div>
      `;
    });

    html += `
      <div class="cal-day-cell ${isToday ? 'today' : ''}" data-date="${cellDateStr}">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="cal-day-number">${d}</span>
          ${dayBookings.length > 1 ? `<span style="font-size: 0.65rem; color: #D97706; font-weight: bold;">(${dayBookings.length} bookings)</span>` : ''}
        </div>
        ${eventPillsHtml}
      </div>
    `;
  }

  // Next month filler cells to complete grid row
  const totalRendered = firstDay + daysInMonth;
  const remainingCells = (7 - (totalRendered % 7)) % 7;
  for (let j = 1; j <= remainingCells; j++) {
    html += `<div class="cal-day-cell diff-month"><span class="cal-day-number">${j}</span></div>`;
  }

  gridCells.innerHTML = html;

  // Add click handler to event pills
  gridCells.querySelectorAll(".cal-event-pill").forEach(pill => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = pill.dataset.id;
      const b = bookings.find(item => item.id === id);
      if (b) openBookingModal(b);
    });
  });

  // Add click handler to day cells to quickly open new booking on that date
  gridCells.querySelectorAll(".cal-day-cell:not(.diff-month)").forEach(cell => {
    cell.addEventListener("click", () => {
      const date = cell.dataset.date;
      openBookingModal(null, date);
    });
  });
}

function renderListView(bookings = []) {
  const tbody = document.getElementById("bookings-table-tbody");
  if (!tbody) return;

  const searchInput = document.getElementById("booking-search")?.value.toLowerCase() || "";
  const statusFilter = document.getElementById("booking-status-filter")?.value || "all";

  const filtered = bookings.filter(b => {
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    const matchSearch = !searchInput ||
      b.customerName.toLowerCase().includes(searchInput) ||
      b.bookingNo.toString().includes(searchInput) ||
      (b.phone1 && b.phone1.includes(searchInput)) ||
      (b.eventDesc && b.eventDesc.toLowerCase().includes(searchInput));
    return matchStatus && matchSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 2rem; color: #999;">No bookings match the filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td><strong>#${b.bookingNo}</strong></td>
      <td>
        <div><strong>${formatDate(b.reservationDate)}</strong></div>
        <div style="font-size: 0.75rem; color: #666;">${b.fromDateTime ? b.fromDateTime.replace('T', ' ') : ''} to ${b.toDateTime ? b.toDateTime.replace('T', ' ') : ''}</div>
      </td>
      <td>
        <div style="font-weight: 600;">${b.customerName}</div>
        <div style="font-size: 0.75rem; color: #777;">${b.address || '—'}</div>
      </td>
      <td>
        <div><a href="tel:${b.phone1}">${b.phone1}</a></div>
        <div style="font-size: 0.75rem; color: #888;"><a href="tel:${b.phone2}">${b.phone2}</a></div>
      </td>
      <td style="font-size: 0.8rem; color: #666;">${b.reference || '—'}</td>
      <td style="font-weight: 700;">${formatINR(b.grandTotal)}</td>
      <td style="font-weight: 700; color: ${b.balanceAmount > 0 ? '#C62828' : '#2E7D32'};">
        ${b.balanceAmount > 0 ? formatINR(b.balanceAmount) : 'Paid'}
      </td>
      <td>
        <span class="badge ${b.status === 'Confirmed' ? 'badge-confirmed' : b.status === 'Enquiry' ? 'badge-enquiry' : b.status === 'Completed' ? 'badge-completed' : 'badge-cancelled'}">
          ${b.status}
        </span>
      </td>
      <td class="text-right">
        <button class="btn btn-sm btn-secondary edit-bk-btn" data-id="${b.id}">Edit</button>
        ${isOwner() ? `<button class="btn btn-sm btn-danger del-bk-btn" data-id="${b.id}" style="padding: 0.2rem 0.4rem;">Delete</button>` : ''}
      </td>
    </tr>
  `).join("");

  // Attach row button events
  tbody.querySelectorAll(".edit-bk-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const b = bookings.find(x => x.id === btn.dataset.id);
      if (b) openBookingModal(b);
    });
  });

  tbody.querySelectorAll(".del-bk-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this booking record?")) {
        dbStore.delete("bookings", btn.dataset.id);
        showToast("Booking deleted.");
      }
    });
  });
}

function initBookingForm() {
  document.getElementById("open-new-booking-btn")?.addEventListener("click", () => openBookingModal());
  document.getElementById("close-booking-modal-btn")?.addEventListener("click", () => closeModal("booking-modal"));
  document.getElementById("cancel-booking-modal-btn")?.addEventListener("click", () => closeModal("booking-modal"));

  // Search and filter triggers
  document.getElementById("booking-search")?.addEventListener("input", () => renderListView(dbStore.get("bookings")));
  document.getElementById("booking-status-filter")?.addEventListener("change", () => renderListView(dbStore.get("bookings")));

  // Calculate totals dynamically on input
  document.querySelectorAll(".line-item-amt, .line-item-adv, #calc-tax").forEach(inp => {
    inp.addEventListener("input", recalculateFormFinancials);
  });

  // Save Booking submission
  document.getElementById("save-booking-btn")?.addEventListener("click", handleSaveBooking);
}

function openBookingModal(booking = null, defaultDate = null) {
  const form = document.getElementById("booking-form");
  form.reset();

  const titleEl = document.getElementById("booking-modal-title");
  const banner = document.getElementById("conflict-alert-banner");
  banner.style.display = "none";

  const allBookings = dbStore.get("bookings");

  if (booking) {
    titleEl.textContent = `Edit Booking Receipt #${booking.bookingNo}`;
    document.getElementById("booking-id").value = booking.id;
    document.getElementById("booking-no").value = booking.bookingNo;
    document.getElementById("customer-name").value = booking.customerName || "";
    document.getElementById("customer-address").value = booking.address || "";
    document.getElementById("customer-phone1").value = booking.phone1 || "";
    document.getElementById("customer-phone2").value = booking.phone2 || "";
    document.getElementById("booking-reference").value = booking.reference || "";
    document.getElementById("event-desc").value = booking.eventDesc || "";
    document.getElementById("reservation-date").value = booking.reservationDate || "";
    document.getElementById("from-datetime").value = booking.fromDateTime || "";
    document.getElementById("to-datetime").value = booking.toDateTime || "";
    document.getElementById("booking-status").value = booking.status || "Confirmed";

    // Fill line items
    const li = booking.lineItems || {};
    document.getElementById("li-rent-adv").value = li.rent?.advance || 0;
    document.getElementById("li-rent-amt").value = li.rent?.amount || 0;
    document.getElementById("li-furniture-adv").value = li.furniture?.advance || 0;
    document.getElementById("li-furniture-amt").value = li.furniture?.amount || 0;
    document.getElementById("li-utensils-adv").value = li.utensils?.advance || 0;
    document.getElementById("li-utensils-amt").value = li.utensils?.amount || 0;
    document.getElementById("li-generator-adv").value = li.generator?.advance || 0;
    document.getElementById("li-generator-amt").value = li.generator?.amount || 0;
    document.getElementById("li-service-adv").value = li.serviceCharge?.advance || 0;
    document.getElementById("li-service-amt").value = li.serviceCharge?.amount || 0;
    document.getElementById("li-misc-adv").value = li.miscellaneous?.advance || 0;
    document.getElementById("li-misc-amt").value = li.miscellaneous?.amount || 0;
    document.getElementById("li-elec-adv").value = li.electricityPhotography?.advance || 0;
    document.getElementById("li-elec-amt").value = li.electricityPhotography?.amount || 0;

    document.getElementById("calc-tax").value = booking.serviceTax || 0;
    document.getElementById("balance-due-date").value = booking.balanceDueDate || "";
  } else {
    titleEl.textContent = "New Booking Receipt / Reservation";
    document.getElementById("booking-id").value = "";
    
    // Auto-increment booking number
    const maxNo = allBookings.reduce((max, b) => Math.max(max, Number(b.bookingNo) || 1000), 1000);
    document.getElementById("booking-no").value = maxNo + 1;

    const resDate = defaultDate || new Date().toISOString().split("T")[0];
    document.getElementById("reservation-date").value = resDate;
    document.getElementById("from-datetime").value = `${resDate}T08:00`;
    document.getElementById("to-datetime").value = `${resDate}T16:00`;
    document.getElementById("booking-status").value = "Confirmed";
  }

  recalculateFormFinancials();
  openModal("booking-modal");
}

function recalculateFormFinancials() {
  const getVal = (id) => Number(document.getElementById(id)?.value) || 0;

  const totalAmount =
    getVal("li-rent-amt") +
    getVal("li-furniture-amt") +
    getVal("li-utensils-amt") +
    getVal("li-generator-amt") +
    getVal("li-service-amt") +
    getVal("li-misc-amt") +
    getVal("li-elec-amt");

  const totalAdvance =
    getVal("li-rent-adv") +
    getVal("li-furniture-adv") +
    getVal("li-utensils-adv") +
    getVal("li-generator-adv") +
    getVal("li-service-adv") +
    getVal("li-misc-adv") +
    getVal("li-elec-adv");

  const tax = getVal("calc-tax");
  const grandTotal = totalAmount + tax;
  const balance = Math.max(0, grandTotal - totalAdvance);

  document.getElementById("calc-total").value = formatINR(totalAmount);
  document.getElementById("calc-grand-total").value = formatINR(grandTotal);
  document.getElementById("calc-advance-received").value = formatINR(totalAdvance);
  document.getElementById("calc-balance").value = formatINR(balance);
}

/**
 * Conflict detection engine:
 * Checks for date/time overlap against all existing Confirmed bookings.
 */
function checkForConflicts(currentId, newFromStr, newToStr, newStatus) {
  if (newStatus !== "Confirmed") return null;

  const newFrom = new Date(newFromStr).getTime();
  const newTo = new Date(newToStr).getTime();
  const allBookings = dbStore.get("bookings");

  for (const b of allBookings) {
    if (b.id === currentId) continue;
    if (b.status !== "Confirmed") continue;

    const bFrom = new Date(b.fromDateTime).getTime();
    const bTo = new Date(b.toDateTime).getTime();

    // Check overlap: (StartA < EndB) and (EndA > StartB)
    if (newFrom < bTo && newTo > bFrom) {
      return b; // Conflicting booking object found
    }
  }

  return null;
}

function handleSaveBooking() {
  const form = document.getElementById("booking-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const currentId = document.getElementById("booking-id").value;
  const bookingNo = Number(document.getElementById("booking-no").value);
  const customerName = document.getElementById("customer-name").value.trim();
  const address = document.getElementById("customer-address").value.trim();
  const phone1 = document.getElementById("customer-phone1").value.trim();
  const phone2 = document.getElementById("customer-phone2").value.trim();
  const reference = document.getElementById("booking-reference").value.trim();
  const eventDesc = document.getElementById("event-desc").value.trim();
  const reservationDate = document.getElementById("reservation-date").value;
  const fromDateTime = document.getElementById("from-datetime").value;
  const toDateTime = document.getElementById("to-datetime").value;
  const status = document.getElementById("booking-status").value;

  // Conflict Detection Check
  const conflictingBooking = checkForConflicts(currentId, fromDateTime, toDateTime, status);
  const banner = document.getElementById("conflict-alert-banner");

  if (conflictingBooking) {
    banner.style.display = "block";
    banner.style.background = "var(--danger-light)";
    banner.style.border = "1px solid var(--danger)";
    banner.style.color = "var(--danger)";
    banner.innerHTML = `
      <strong>[Conflict] Overlap Conflict Detected!</strong><br>
      This reservation overlaps with existing Confirmed Booking <strong>#${conflictingBooking.bookingNo} (${conflictingBooking.customerName})</strong><br>
      Dates: ${formatDateTime(conflictingBooking.fromDateTime)} to ${formatDateTime(conflictingBooking.toDateTime)}.<br>
      <em>Two Confirmed bookings cannot be scheduled simultaneously. Please resolve the time conflict or save as Enquiry.</em>
    `;
    showToast("Conflict detected! Cannot save overlapping confirmed booking.", "danger");
    return;
  }

  const getVal = (id) => Number(document.getElementById(id)?.value) || 0;

  const lineItems = {
    rent: { advance: getVal("li-rent-adv"), amount: getVal("li-rent-amt") },
    furniture: { advance: getVal("li-furniture-adv"), amount: getVal("li-furniture-amt") },
    utensils: { advance: getVal("li-utensils-adv"), amount: getVal("li-utensils-amt") },
    generator: { advance: getVal("li-generator-adv"), amount: getVal("li-generator-amt") },
    serviceCharge: { advance: getVal("li-service-adv"), amount: getVal("li-service-amt") },
    miscellaneous: { advance: getVal("li-misc-adv"), amount: getVal("li-misc-amt") },
    electricityPhotography: { advance: getVal("li-elec-adv"), amount: getVal("li-elec-amt") }
  };

  const totalAmount = Object.values(lineItems).reduce((sum, item) => sum + item.amount, 0);
  const advanceReceived = Object.values(lineItems).reduce((sum, item) => sum + item.advance, 0);
  const serviceTax = getVal("calc-tax");
  const grandTotal = totalAmount + serviceTax;
  const balanceAmount = Math.max(0, grandTotal - advanceReceived);
  const balanceDueDate = document.getElementById("balance-due-date").value;

  const bookingData = {
    bookingNo,
    customerName,
    address,
    phone1,
    phone2,
    reference,
    eventDesc,
    reservationDate,
    fromDateTime,
    toDateTime,
    status,
    lineItems,
    totalAmount,
    serviceTax,
    grandTotal,
    advanceReceived,
    balanceAmount,
    balanceDueDate,
    updatedAt: new Date().toISOString()
  };

  if (currentId) {
    dbStore.update("bookings", currentId, bookingData);
    showToast(`Booking #${bookingNo} updated successfully.`);
  } else {
    bookingData.createdAt = new Date().toISOString();
    const newBk = dbStore.add("bookings", bookingData);

    // If advance was received upon booking, auto-log in ledger
    if (advanceReceived > 0) {
      dbStore.add("ledger", {
        date: reservationDate,
        type: "income",
        category: "Hall rent (advance)",
        amount: advanceReceived,
        description: `Advance received for Booking #${bookingNo} (${customerName})`,
        loggedBy: "System / Front Desk",
        bookingId: newBk.id
      });
    }

    showToast(`Booking #${bookingNo} created successfully!`);
  }

  evaluateNotifications();
  closeModal("booking-modal");
}
