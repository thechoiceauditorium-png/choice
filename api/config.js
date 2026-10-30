const _D = (s) => Buffer.from(s, "base64").toString("utf-8");

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-cache");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const defaultAnon = _D("ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5") +
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheGNiemRvZ3dyZmJuZHNucWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjE0OTcsImV4cCI6MjEwNjkzNzQ5N30.41jZzbKS1ApxhMdQMRlnKaUue6bY0AmpAILs0r63B8E";

  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL || "https://kaxcbzdogwrfbndsnqff.supabase.co",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || defaultAnon
  });
};
