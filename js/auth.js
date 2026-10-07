/**
 * The Choice Auditorium - Production Authentication & Access Control
 * Powered exclusively by Supabase Auth with Role-Based Access Control.
 */

import { getSupabase } from "./supabase-config.js";

const CURRENT_USER_KEY = "choice_current_user";

export function getCurrentUser() {
  const saved = localStorage.getItem(CURRENT_USER_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse current user session", e);
    }
  }
  return null;
}

export function isOwner() {
  const user = getCurrentUser();
  return Boolean(user && user.role === "owner");
}

export function isWorker() {
  const user = getCurrentUser();
  return Boolean(user && user.role === "worker");
}

export async function login(email, password) {
  const lowerEmail = email.toLowerCase().trim();

  const sb = await getSupabase();
  if (!sb || !sb.auth) {
    return {
      success: false,
      error: "Supabase connection is not configured. Please define SUPABASE_URL and SUPABASE_ANON_KEY in your .env file."
    };
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email: lowerEmail,
    password: password
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data?.user) {
    return { success: false, error: "Authentication failed. No user record returned." };
  }

  // Fetch team member profile from team_users table
  let userProfile = null;
  try {
    const { data: profile } = await sb
      .from("team_users")
      .select("*")
      .ilike("email", lowerEmail)
      .maybeSingle();

    if (profile) {
      userProfile = profile;
    }
  } catch (err) {
    console.warn("Could not fetch team profile:", err);
  }

  if (!userProfile) {
    const meta = data.user.user_metadata || {};
    userProfile = {
      id: data.user.id,
      name: meta.name || meta.full_name || lowerEmail.split("@")[0],
      role: meta.role || "worker",
      title: meta.title || "Staff",
      phone: data.user.phone || meta.phone || "",
      email: data.user.email,
      avatar: (meta.name || lowerEmail).slice(0, 2).toUpperCase()
    };
  }

  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userProfile));
  return { success: true, user: userProfile };
}

export async function logout() {
  try {
    const sb = await getSupabase();
    if (sb?.auth) {
      await sb.auth.signOut();
    }
  } catch (e) {
    console.warn("Error during sign out:", e);
  }
  localStorage.removeItem(CURRENT_USER_KEY);
  window.location.href = "index.html";
}

export function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}
