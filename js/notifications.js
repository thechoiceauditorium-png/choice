/**
 * The Choice Auditorium - Notification Evaluation Engine
 */

import { dbStore } from "./firebase-config.js";
import { getCurrentUser, isOwner } from "./auth.js";

export function evaluateNotifications() {
  const user = getCurrentUser();
  const bookings = dbStore.get("bookings");
  const checklists = dbStore.get("checklists");
  const compliance = dbStore.get("compliance");
  const attendance = dbStore.get("attendance");
  const existingNotifs = dbStore.get("notifications");

  const newNotifs = [...existingNotifs];
  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Check upcoming bookings (within 3 days)
  bookings.forEach(b => {
    if (b.status === "Confirmed") {
      const bDate = b.reservationDate;
      const daysDiff = Math.ceil((new Date(bDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysDiff >= 0 && daysDiff <= 3) {
        const key = `notif-bk-due-${b.id}`;
        if (!newNotifs.some(n => n.id === key)) {
          newNotifs.unshift({
            id: key,
            title: `Function in ${daysDiff === 0 ? 'Today' : daysDiff + ' days'}`,
            message: `Booking #${b.bookingNo} for ${b.customerName} is scheduled on ${b.reservationDate}.`,
            type: "booking",
            time: "Automated",
            read: false
          });
        }
      }
    }
  });

  // 2. Check compliance items due within 30 days
  compliance.forEach(c => {
    if (c.dueDate) {
      const daysDiff = Math.ceil((new Date(c.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysDiff >= 0 && daysDiff <= (c.leadDays || 30)) {
        const key = `notif-comp-${c.id}`;
        if (!newNotifs.some(n => n.id === key)) {
          newNotifs.unshift({
            id: key,
            title: `Statutory Due: ${c.title}`,
            message: `Due on ${c.dueDate}. Responsible: ${c.responsible}.`,
            type: "compliance",
            time: "Statutory alert",
            read: false
          });
        }
      }
    }
  });

  // 3. Attendance check for today (if after 4 PM and not marked)
  const hour = new Date().getHours();
  if (hour >= 16 && isOwner()) {
    const todayAttendance = attendance.filter(a => a.date === todayStr);
    if (todayAttendance.length < 2) {
      const key = `notif-att-${todayStr}`;
      if (!newNotifs.some(n => n.id === key)) {
        newNotifs.unshift({
          id: key,
          title: "Attendance Unmarked",
          message: "Staff attendance for Gopinathan / Sajitha is not fully recorded for today.",
          type: "attendance",
          time: "Daily reminder",
          read: false
        });
      }
    }
  }

  // 4. Check for attendance pending owner approval
  if (isOwner()) {
    const pendingAtt = attendance.filter(a => a.approvalStatus === "Pending Approval");
    pendingAtt.forEach(att => {
      const key = `notif-att-pending-${att.id || (att.workerId + '-' + att.date)}`;
      if (!newNotifs.some(n => n.id === key)) {
        newNotifs.unshift({
          id: key,
          title: `Attendance Approval: ${att.workerName}`,
          message: `${att.workerName} marked ${att.status} for ${att.date}. Pending owner sign-off.`,
          type: "attendance",
          time: "Action required",
          read: false
        });
      }
    });
  }

  dbStore.save("notifications", newNotifs);
}
