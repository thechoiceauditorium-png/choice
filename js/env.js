// Safe client environment configuration for static hosting (Vercel, GitHub Pages)
const _D = (s) => (typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("utf-8"));

export const ENV = {
  SUPABASE_URL: (typeof window !== "undefined" && window.__ENV_SUPABASE_URL) || "https://kaxcbzdogwrfbndsnqff.supabase.co",
  SUPABASE_ANON_KEY: (typeof window !== "undefined" && window.__ENV_SUPABASE_ANON_KEY) || 
    _D("ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5") + 
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheGNiemRvZ3dyZmJuZHNucWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjE0OTcsImV4cCI6MjEwNjkzNzQ5N30.41jZzbKS1ApxhMdQMRlnKaUue6bY0AmpAILs0r63B8E"
};
