/**
 * The Choice Auditorium - Data Layer Bridge
 * Migrated to Supabase Postgres & Realtime Backend.
 * Re-exports dbStore and helpers for backward compatibility.
 */

export * from "./supabase-config.js";
export { dbStore as default } from "./supabase-config.js";

// Legacy Firebase config stub (unused, Supabase is now primary)
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
