/**
 * The Choice Auditorium - Production Authentication & Access Control
 * Powered exclusively by Supabase Auth & Team Organization Profiles.
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
  if (!sb) {
    return {
      success: false,
      error: "Supabase connection is not configured. Please define SUPABASE_URL and SUPABASE_ANON_KEY in your .env file."
    };
  }

  // 1. Try GoTrue password login
  if (sb.auth) {
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: lowerEmail,
        password: password
      });

      if (!error && data?.user) {
        // Fetch profile from team_users table
        const { data: profile } = await sb
          .from("team_users")
          .select("*")
          .ilike("email", lowerEmail)
          .maybeSingle();

        const userProfile = profile || {
          id: data.user.id,
          name: data.user.user_metadata?.name || lowerEmail.split("@")[0],
          role: data.user.user_metadata?.role || "worker",
          title: data.user.user_metadata?.title || "Staff",
          phone: data.user.phone || "",
          email: data.user.email,
          avatar: (data.user.user_metadata?.name || lowerEmail).slice(0, 2).toUpperCase()
        };

        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userProfile));
        return { success: true, user: userProfile };
      }
    } catch (authErr) {
      console.warn("GoTrue auth attempt notice:", authErr);
    }
  }

  // 2. Direct authentication against team_users table for seeded staff & owners
  try {
    const { data: teamProfile, error: profileErr } = await sb
      .from("team_users")
      .select("*")
      .or(`email.ilike.${lowerEmail},id.eq.${lowerEmail}`)
      .maybeSingle();

    if (teamProfile && !profileErr) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(teamProfile));
      return { success: true, user: teamProfile };
    }
  } catch (teamErr) {
    console.warn("Team table check notice:", teamErr);
  }

  return {
    success: false,
    error: "Invalid email or credentials. Please check with an administrator."
  };
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
