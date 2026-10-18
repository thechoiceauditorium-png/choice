/**
 * The Choice Auditorium - Notification Evaluation Engine
 */

import { dbStore } from "./supabase-config.js";
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

  // 2. Check compliance items (Pending/Due Soon within leadDays or Overdue)
  const todayForNotif = new Date();
  todayForNotif.setHours(0, 0, 0, 0);

  compliance.forEach(c => {
    if (c.dueDate && c.status !== "Completed") {
      const due = new Date(c.dueDate + "T00:00:00");
      if (isNaN(due.getTime())) return;
      const daysDiff = Math.ceil((due.getTime() - todayForNotif.getTime()) / (1000 * 60 * 60 * 24));
      const lead = Number(c.leadDays) || 10;

      if (daysDiff < 0) {
        const key = `notif-comp-overdue-${c.id}-${c.dueDate}`;
        if (!newNotifs.some(n => n.id === key)) {
          newNotifs.unshift({
            id: key,
            title: `Statutory / Bill Overdue: ${c.title}`,
            message: `Was due on ${c.dueDate}. Responsible: ${c.responsible}. Please complete immediately.`,
            type: "compliance",
            time: "Overdue alert",
            read: false
          });
        }
      } else if (daysDiff <= lead) {
        const key = `notif-comp-${c.id}-${c.dueDate}`;
        if (!newNotifs.some(n => n.id === key)) {
          newNotifs.unshift({
            id: key,
            title: `Bill / Statutory Due Soon: ${c.title}`,
            message: `Due on ${c.dueDate} (${daysDiff} day${daysDiff === 1 ? '' : 's'} remaining). Responsible: ${c.responsible}.`,
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
    const workers = (dbStore.get("users") || []).filter(u => u.role === "worker");
    const todayAttendance = attendance.filter(a => a.date === todayStr);
    const unmarkedWorkers = workers.filter(w => !todayAttendance.some(a => a.workerId === w.id));
    if (unmarkedWorkers.length > 0) {
      const key = `notif-att-${todayStr}`;
      if (!newNotifs.some(n => n.id === key)) {
        const workerNames = unmarkedWorkers.map(w => w.name).join(" / ");
        newNotifs.unshift({
          id: key,
          title: "Attendance Unmarked",
          message: `Staff attendance for ${workerNames} is not fully recorded for today.`,
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
