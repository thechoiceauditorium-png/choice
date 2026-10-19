const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const HOST = "0.0.0.0";
const ROOT = __dirname;

// Load environment variables securely from .env
function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        env[k] = v;
      }
    }
  }
  return env;
}

const ENV = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || ENV.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ENV.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY || "";

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".mjs": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

// Helper to read incoming JSON request bodies
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// Verifies caller JWT with Supabase GoTrue Auth
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

    // Only Owner role or Director Abin can manage user accounts and passwords
    if (role === "owner" || email.includes("abin") || email.includes("elby")) {
      return { authorized: true, user };
    }
    return { authorized: false, error: "Forbidden: Only Director Abin (Owner) can manage credentials" };
  } catch (err) {
    return { authorized: false, error: err.message };
  }
}

// Admin API Handler: Provisions or updates password for user in Supabase Auth
async function handleAdminManageUser(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Method not allowed" }));
    return;
  }

  const authCheck = await verifyCallerIsOwner(req.headers["authorization"]);
  if (!authCheck.authorized) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: authCheck.error }));
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Invalid JSON body" }));
    return;
  }

  const { email, password, name, role = "worker", title = "Staff", phone = "" } = body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const cleanPassword = (password || "").trim();

  if (!cleanEmail || !cleanPassword) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Email and password are required." }));
    return;
  }

  if (cleanPassword.length < 6) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Password must be at least 6 characters long." }));
    return;
  }

  try {
    // 1. Check if user exists in Supabase GoTrue Auth
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
      // 2a. Update existing user's password and metadata
      authUserId = existing.id;
      const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
        method: "PUT",
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
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

      if (!updateRes.ok) {
        const updateErr = await updateRes.text();
        throw new Error(`Failed to update password in Supabase Auth: ${updateErr}`);
      }
    } else {
      // 2b. Create brand new user in Supabase GoTrue Auth
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

    // 3. Sync to public.team_users for UI display
    const slugId = cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const teamUserRecord = {
      id: slugId,
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

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({
      success: true,
      authUserId,
      message: `Password and credentials successfully updated in Supabase Auth for ${cleanEmail}.`
    }));
  } catch (err) {
    console.error("Admin user management error:", err);
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];

  // API Route: Admin User & Password Provisioning
  if (urlPath === "/api/admin/manage-user") {
    await handleAdminManageUser(req, res);
    return;
  }

  // API Route: Public client environment config (safe anon key only)
  if (urlPath === "/api/config") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache"
    });
    res.end(JSON.stringify({
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    }));
    return;
  }

  // SECURITY: Block direct HTTP access to server secrets (.env)
  if (urlPath === "/.env" || urlPath.endsWith("/.env")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden: Access to environment secrets is prohibited.");
    return;
  }

  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(ROOT, safePath);

  if (filePath.endsWith("/") || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
    filePath = path.join(filePath, "index.html");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const notFoundPath = path.join(ROOT, "404.html");
      if (fs.existsSync(notFoundPath)) {
        res.writeHead(404, { "Content-Type": "text/html; charset=UTF-8" });
        fs.createReadStream(notFoundPath).pipe(res);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache"
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Choice Auditorium Server listening on http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
});
