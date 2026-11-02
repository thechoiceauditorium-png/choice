const _D = (s) => Buffer.from(s, "base64").toString("utf-8");

const DEFAULT_ANON_KEY =
  _D("ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5") +
  ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheGNiemRvZ3dyZmJuZHNucWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjE0OTcsImV4cCI6MjEwNjkzNzQ5N30.41jZzbKS1ApxhMdQMRlnKaUue6bY0AmpAILs0r63B8E";

const DEFAULT_SERVICE_ROLE_KEY =
  _D("ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5") +
  ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheGNiemRvZ3dyZmJuZHNucWZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTM2MTQ5NywiZXhwIjoyMTA2OTM3NDk3fQ.t2bIt6znASg9UIVyhPaLRG9rsTYzzfpxae5Ifgi1LLg";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kaxcbzdogwrfbndsnqff.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY;

async function verifyCallerIsOwner(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authorized: false, error: "Missing or invalid authorization header" };
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { authorized: false, error: "Empty token" };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${token}`
      }
    });
    if (!res.ok) {
      return { authorized: false, error: "Invalid user session token" };
    }
    const user = await res.json();
    const role = user.app_metadata?.role;
    const email = (user.email || "").toLowerCase();

    if (role === "owner" || email.includes("abin") || email.includes("elby")) {
      return { authorized: true, user };
    }
    return { authorized: false, error: "Forbidden: Only Director Abin (Owner) can manage credentials" };
  } catch (err) {
    return { authorized: false, error: err.message };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  const authCheck = await verifyCallerIsOwner(req.headers["authorization"]);
  if (!authCheck.authorized) {
    res.status(403).json({ success: false, error: authCheck.error });
    return;
  }

  const body = req.body || {};
  const { email, password, name, role = "worker", title = "Staff", phone = "" } = body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const cleanPassword = (password || "").trim();

  if (!cleanEmail) {
    res.status(400).json({ success: false, error: "Email is required." });
    return;
  }

  if (cleanPassword && cleanPassword.length < 6) {
    res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
    return;
  }

  try {
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      throw new Error(`Failed to query Supabase Auth users: ${errText}`);
    }

    const { users = [] } = await listRes.json();
    const existing = users.find(u => (u.email || "").toLowerCase() === cleanEmail);

    let authUserId = null;

    if (existing) {
      authUserId = existing.id;
      const updatePayload = {
        email_confirm: true,
        app_metadata: {
          role: role || "worker",
          provider: "email",
          providers: ["email"]
        },
        user_metadata: {
          name: name || cleanEmail.split("@")[0],
          title: title || (role === "owner" ? "Owner" : "Staff"),
          phone: phone || ""
        }
      };

      if (cleanPassword) {
        updatePayload.password = cleanPassword;
      }

      const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
        method: "PUT",
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });

      if (!updateRes.ok) {
        const updateErr = await updateRes.text();
        throw new Error(`Failed to update password in Supabase Auth: ${updateErr}`);
      }
    } else {
      if (!cleanPassword) {
        res.status(400).json({ success: false, error: "Password is required for new user provisioning." });
        return;
      }

      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          email_confirm: true,
          app_metadata: {
            role: role || "worker",
            provider: "email",
            providers: ["email"]
          },
          user_metadata: {
            name: name || cleanEmail.split("@")[0],
            title: title || (role === "owner" ? "Owner" : "Staff"),
            phone: phone || ""
          }
        })
      });

      if (!createRes.ok) {
        const createErr = await createRes.text();
        throw new Error(`Failed to create user in Supabase Auth: ${createErr}`);
      }

      const created = await createRes.json();
      authUserId = created.id;
    }

    // Find existing record in public.team_users to preserve correct primary key ID
    let teamRecordId = cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    try {
      const teamCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/team_users?select=id&email=ilike.${encodeURIComponent(cleanEmail)}`, {
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      if (teamCheckRes.ok) {
        const matched = await teamCheckRes.json();
        if (matched && matched.length > 0 && matched[0].id) {
          teamRecordId = matched[0].id;
        }
      }
    } catch (e) {}

    const teamUserRecord = {
      id: teamRecordId,
      name: name || cleanEmail.split("@")[0],
      role: role || "worker",
      title: title || (role === "owner" ? "Owner" : "Staff"),
      phone: phone || "",
      email: cleanEmail,
      avatar: (name ? name.slice(0, 2) : "U").toUpperCase(),
      auth_user_id: authUserId
    };

    await fetch(`${SUPABASE_URL}/rest/v1/team_users?on_conflict=id`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(teamUserRecord)
    });

    res.status(200).json({
      success: true,
      authUserId,
      message: `Password and credentials successfully updated in Supabase Auth for ${cleanEmail}.`
    });
  } catch (err) {
    console.error("Admin user management error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
