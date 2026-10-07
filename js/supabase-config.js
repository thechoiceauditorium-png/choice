/**
 * The Choice Auditorium - Production Supabase Data Layer & Realtime Sync Engine
 * Direct PostgreSQL + Realtime subscription with zero-latency optimistic local cache.
 */

import { ENV } from "./env.js";

// Cache for env credentials
let envConfig = {
  url: (typeof ENV !== "undefined" && ENV.SUPABASE_URL) ? ENV.SUPABASE_URL : "",
  anonKey: (typeof ENV !== "undefined" && ENV.SUPABASE_ANON_KEY) ? ENV.SUPABASE_ANON_KEY : ""
};

// Asynchronously load .env file from root
export async function loadEnv() {
  if (envConfig.url && envConfig.anonKey) return envConfig;
  try {
    const res = await fetch(".env");
    if (res.ok) {
      const text = await res.text();
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...v] = trimmed.split("=");
        const key = k?.trim();
        const val = v?.join("=").trim().replace(/^["']|["']$/g, "");
        if (key === "SUPABASE_URL" || key === "VITE_SUPABASE_URL" || key === "NEXT_PUBLIC_SUPABASE_URL") {
          envConfig.url = val;
        }
        if (key === "SUPABASE_ANON_KEY" || key === "VITE_SUPABASE_ANON_KEY" || key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
          envConfig.anonKey = val;
        }
      }
    }
  } catch (e) {
    // Non-server or local file environment
  }
  return envConfig;
}

// Strict Supabase PostgreSQL table schema mapping to prevent PGRST204 errors
export const TABLE_COLUMNS = {
  bookings: [
    "id", "bookingNo", "customerName", "address", "phone1", "phone2",
    "reference", "eventDesc", "reservationDate", "fromDateTime", "toDateTime",
    "status", "lineItems", "totalAmount", "serviceTax", "grandTotal",
    "advanceReceived", "balanceAmount", "balanceDueDate", "signature", "createdAt"
  ],
  ledger: [
    "id", "date", "type", "category", "amount", "description",
    "loggedBy", "bookingId", "createdAt"
  ],
  compliance: [
    "id", "title", "cycle", "dueDate", "recurrence", "status",
    "leadDays", "responsible", "notes", "completedDate", "completedBy", "createdAt"
  ],
  compliance_history: [
    "id", "complianceId", "title", "cycle", "completedDate",
    "completedBy", "refNo", "amountPaid", "notes", "createdAt"
  ],
  checklists: [
    "id", "type", "title", "bookingId", "bookingNo", "eventDate",
    "period", "items", "status", "createdAt"
  ],
  checklist_templates: [
    "id", "templates", "updatedAt"
  ],
  attendance: [
    "id", "date", "workerId", "workerName", "status", "note",
    "markedBy", "markedAt", "approvalStatus", "approvedBy", "approvedAt", "createdAt"
  ],
  directory: [
    "id", "name", "role", "phone", "category", "notes", "createdAt"
  ],
  notifications: [
    "id", "title", "message", "type", "time", "read", "createdAt"
  ],
  team_users: [
    "id", "name", "role", "title", "phone", "email", "avatar", "createdAt"
  ]
};

/**
 * Filter record properties to only valid PostgreSQL table columns.
 */
export function sanitizeForSupabase(tableName, record) {
  if (!record || typeof record !== "object") return record;
  const validCols = TABLE_COLUMNS[tableName];
  if (!validCols) return record;

  const sanitized = {};
  for (const col of validCols) {
    if (col in record) {
      sanitized[col] = record[col];
    }
  }
  if (!sanitized.id && record.id) {
    sanitized.id = record.id;
  }
  return sanitized;
}

// Broadcast channel for multi-tab sync
const broadcastChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("choice_auditorium_sync") : null;

// Supabase Client Instance Holder
let supabaseInstance = null;
let realtimeChannel = null;

/**
 * Dynamically load Supabase client library (local bundle or CDN)
 */
async function loadSupabaseSdk() {
  if (typeof window !== "undefined" && window.supabase && window.supabase.createClient) {
    return window.supabase;
  }
  if (typeof document !== "undefined") {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "js/supabase.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      if (window.supabase) return window.supabase;
    } catch (e) {
      console.warn("Could not load local js/supabase.min.js, trying CDN module...", e);
    }
  }
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    return mod;
  } catch (err) {
    console.error("Failed to load Supabase SDK", err);
    return null;
  }
}

/**
 * Initialize Supabase Client
 */
export async function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  await loadEnv();

  const url = envConfig.url || localStorage.getItem("choice_supabase_url") || "";
  const anonKey = envConfig.anonKey || localStorage.getItem("choice_supabase_anon_key") || "";

  if (!url || !anonKey) {
    return null;
  }

  const sdk = await loadSupabaseSdk();
  if (!sdk || !sdk.createClient) {
    console.warn("Supabase SDK unavailable");
    return null;
  }

  try {
    supabaseInstance = sdk.createClient(url.trim(), anonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    return supabaseInstance;
  } catch (err) {
    console.error("Error creating Supabase client:", err);
    return null;
  }
}

export function isSupabaseConfigured() {
  return Boolean(
    (envConfig.url || (typeof ENV !== "undefined" && ENV.SUPABASE_URL) || localStorage.getItem("choice_supabase_url")) &&
    (envConfig.anonKey || (typeof ENV !== "undefined" && ENV.SUPABASE_ANON_KEY) || localStorage.getItem("choice_supabase_anon_key"))
  );
}

export async function testSupabaseConnection() {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured" };
  try {
    const { data, error } = await sb.from("team_users").select("id").limit(1);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Universal Data Store with Supabase Postgres & Realtime Backend
 */
class ChoiceDataStore {
  constructor() {
    this.subscribers = new Map();
    this.isRemoteSyncActive = false;
    this.initStorage();

    if (broadcastChannel) {
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.collection) {
          this.notifySubscribers(event.data.collection);
        }
      };
    }

    // Connect to Supabase in background
    this.initSupabaseSync();
  }

  initStorage() {
    const collections = [
      "users",
      "bookings",
      "ledger",
      "compliance",
      "compliance_history",
      "checklists",
      "attendance",
      "directory",
      "notifications"
    ];

    collections.forEach(col => {
      if (!localStorage.getItem(`choice_${col}`)) {
        localStorage.setItem(`choice_${col}`, JSON.stringify([]));
      }
    });

    if (!localStorage.getItem("choice_checklist_templates")) {
      localStorage.setItem("choice_checklist_templates", JSON.stringify({ beforeFunction: [], afterFunction: [], every15Days: [] }));
    }
  }

  async initSupabaseSync() {
    await loadEnv();
    if (!isSupabaseConfigured()) {
      return;
    }

    const sb = await getSupabase();
    if (!sb) return;

    try {
      await this.pullAllFromSupabase(sb);
      this.setupRealtimeSubscriptions(sb);
      this.isRemoteSyncActive = true;
    } catch (e) {
      console.warn("Supabase initial sync error:", e);
    }
  }

  async pullAllFromSupabase(sb) {
    const collections = [
      "bookings",
      "ledger",
      "compliance",
      "compliance_history",
      "checklists",
      "attendance",
      "directory",
      "notifications"
    ];

    for (const col of collections) {
      try {
        const { data, error } = await sb.from(col).select("*");
        if (!error && Array.isArray(data)) {
          localStorage.setItem(`choice_${col}`, JSON.stringify(data));
          this.notifySubscribers(col);
        }
      } catch (err) {
        console.warn(`Error pulling ${col} from Supabase:`, err);
      }
    }

    // Pull checklist templates
    try {
      const { data: tplData, error: tplErr } = await sb.from("checklist_templates").select("*").eq("id", "default").maybeSingle();
      if (!tplErr && tplData && tplData.templates) {
        localStorage.setItem("choice_checklist_templates", JSON.stringify(tplData.templates));
      }
    } catch (err) {}

    // Pull team members
    try {
      const { data: teamData, error: teamErr } = await sb.from("team_users").select("*");
      if (!teamErr && Array.isArray(teamData) && teamData.length > 0) {
        localStorage.setItem("choice_users", JSON.stringify(teamData));
        this.notifySubscribers("users");
      }
    } catch (err) {}
  }

  setupRealtimeSubscriptions(sb) {
    if (realtimeChannel) {
      try { sb.removeChannel(realtimeChannel); } catch (e) {}
    }

    const tables = [
      "bookings",
      "ledger",
      "compliance",
      "compliance_history",
      "checklists",
      "attendance",
      "directory",
      "notifications",
      "team_users"
    ];

    realtimeChannel = sb.channel("choice-realtime-all");

    tables.forEach(tableName => {
      const localCollection = tableName === "team_users" ? "users" : tableName;
      realtimeChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tableName },
        (payload) => {
          this.handleRemoteChange(localCollection, payload);
        }
      );
    });

    realtimeChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Choice Supabase Realtime connected successfully.");
      }
    });
  }

  handleRemoteChange(collectionName, payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    let items = this.get(collectionName);
    if (!Array.isArray(items)) items = [];

    if (eventType === "INSERT") {
      const idx = items.findIndex(i => i.id === newRecord.id);
      if (idx === -1) {
        items.unshift(newRecord);
      } else {
        items[idx] = newRecord;
      }
    } else if (eventType === "UPDATE") {
      const idx = items.findIndex(i => i.id === newRecord.id);
      if (idx !== -1) {
        items[idx] = newRecord;
      } else {
        items.unshift(newRecord);
      }
    } else if (eventType === "DELETE") {
      items = items.filter(i => i.id !== oldRecord.id);
    }

    localStorage.setItem(`choice_${collectionName}`, JSON.stringify(items));
    this.notifySubscribers(collectionName);
  }

  get(collectionName) {
    const data = localStorage.getItem(`choice_${collectionName}`);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  save(collectionName, items, syncRemote = true) {
    localStorage.setItem(`choice_${collectionName}`, JSON.stringify(items));
    this.notifySubscribers(collectionName);
    if (broadcastChannel) {
      broadcastChannel.postMessage({ collection: collectionName });
    }

    // Remote sync
    if (syncRemote && isSupabaseConfigured() && Array.isArray(items)) {
      getSupabase().then(sb => {
        if (sb) {
          const tableName = collectionName === "users" ? "team_users" : collectionName;
          const sanitizedItems = items.map(i => sanitizeForSupabase(tableName, i));
          sb.from(tableName).upsert(sanitizedItems).then(({ error }) => {
            if (error) console.warn(`Supabase save error on ${collectionName}:`, error);
          });
        }
      }).catch(err => console.warn(err));
    }
  }

  add(collectionName, item) {
    const items = this.get(collectionName);
    if (!item.id) {
      item.id = `${collectionName.slice(0, 3)}-${Date.now()}`;
    }
    if (!item.createdAt) {
      item.createdAt = new Date().toISOString();
    }
    items.unshift(item);
    this.save(collectionName, items, false);

    // Sync individual record to Supabase
    if (isSupabaseConfigured()) {
      getSupabase().then(sb => {
        if (sb) {
          const tableName = collectionName === "users" ? "team_users" : collectionName;
          const sanitized = sanitizeForSupabase(tableName, item);
          sb.from(tableName).upsert([sanitized]).then(({ error }) => {
            if (error) console.warn(`Supabase add error on ${collectionName}:`, error);
          });
        }
      }).catch(err => console.warn(err));
    }

    return item;
  }

  update(collectionName, id, updates) {
    const items = this.get(collectionName);
    const index = items.findIndex(i => i.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates };
      this.save(collectionName, items, false);

      // Sync individual update to Supabase
      if (isSupabaseConfigured()) {
        getSupabase().then(sb => {
          if (sb) {
            const tableName = collectionName === "users" ? "team_users" : collectionName;
            const sanitized = sanitizeForSupabase(tableName, { ...updates, id });
            sb.from(tableName).update(sanitized).eq("id", id).then(({ error }) => {
              if (error) console.warn(`Supabase update error on ${collectionName}:`, error);
            });
          }
        }).catch(err => console.warn(err));
      }

      return items[index];
    }
    return null;
  }

  delete(collectionName, id) {
    const items = this.get(collectionName);
    const filtered = items.filter(i => i.id !== id);
    this.save(collectionName, filtered, false);

    // Sync delete to Supabase
    if (isSupabaseConfigured()) {
      getSupabase().then(sb => {
        if (sb) {
          const tableName = collectionName === "users" ? "team_users" : collectionName;
          sb.from(tableName).delete().eq("id", id).then(({ error }) => {
            if (error) console.warn(`Supabase delete error on ${collectionName}:`, error);
          });
        }
      }).catch(err => console.warn(err));
    }

    return true;
  }

  subscribe(collectionName, callback) {
    if (!this.subscribers.has(collectionName)) {
      this.subscribers.set(collectionName, new Set());
    }
    this.subscribers.get(collectionName).add(callback);
    callback(this.get(collectionName));

    return () => {
      const set = this.subscribers.get(collectionName);
      if (set) {
        set.delete(callback);
      }
    };
  }

  notifySubscribers(collectionName) {
    const set = this.subscribers.get(collectionName);
    if (set) {
      const data = this.get(collectionName);
      set.forEach(cb => {
        try { cb(data); } catch (err) { console.error("Subscriber error:", err); }
      });
    }
  }
}

export const dbStore = new ChoiceDataStore();
