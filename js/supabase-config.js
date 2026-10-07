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

// Standard Operational Checklist Templates
export const DEFAULT_CHECKLIST_TEMPLATES = {
  beforeFunction: [
    "Main Hall cleaning, mopping & dust-wipe completed",
    "Dining hall & handwash area sanitation checked",
    "Restrooms cleaned, smelling fresh, soaps & towels refilled",
    "Stage lighting & spotlight focus verified",
    "Audio system, cord/wireless microphones & amplifiers tested",
    "Air Conditioning units turned on 1 hr prior to function",
    "Cummins Generator fuel level & battery voltage verified",
    "Kitchen gas pipeline & burner connections inspected",
    "Cooking vessels & serving utensils handed over to catering team",
    "Drinking water filter / RO system & cooler checked",
    "Parking area cleared and security signboards positioned",
    "Bride & Groom dressing rooms unlocked, cleaned & AC tested",
    "VIP lounge & guest reception chairs arranged",
    "Waste bins with liners placed at all key locations"
  ],
  afterFunction: [
    "Auditorium premises inspected for any guest belongings left behind",
    "Stage floral / decoration dismantling verified without damage to wall/curtains",
    "Audio equipment, microphones & cables safely locked in control room",
    "Air conditioners turned off in main hall, dining hall & dressing rooms",
    "All lighting switches, chandeliers and external floodlights switched off",
    "Diesel generator turned off and running hours recorded in logbook",
    "Kitchen gas valves shut off and cylinders inspected",
    "All kitchen utensils and furniture counted and received back from caterers",
    "Breakage or damage during function noted for caution deposit deduction",
    "Solid waste segregated into wet & dry bags for Harithakarmasena",
    "Dining hall floors scrubbed and sanitised",
    "Restrooms washed and taps closed tightly",
    "Water overhead tank pumps turned off",
    "All emergency exits, side gates and main entrance gate locked",
    "Electricity meter reading recorded",
    "Final clearance signed off with customer/caterer representative"
  ],
  every15Days: [
    "Diesel Generator test run for 15 minutes on idle load",
    "Generator coolant level, engine oil and battery water inspected",
    "Main Electrical panel, MCBs and ELCB trip switches tested",
    "Central AC filters removed, washed and refitted",
    "Fire extinguishers pressure gauge verified in green zone",
    "Emergency lighting and exit sign batteries tested",
    "Overhead water tank and underground sump water levels checked",
    "RO Drinking water filter cartridges inspected for pressure drop",
    "Handwash taps, urinals and toilet flush valves checked for leaks",
    "Stage motor curtains and screen sliders lubricated",
    "Sound system cables, amplifier fans and speakers sound tested",
    "Kitchen exhaust hood & duct grease filters inspected",
    "Parking area high-mast floodlights checked at night",
    "Auditorium roof sheets & gutter downpipes inspected for blockages",
    "Pest control & termite inspection in wooden stage structure",
    "First-aid kit replenishment check",
    "Maintenance logbook updated with all findings"
  ]
};

// Default Statutory Obligations for The Choice Auditorium
export const DEFAULT_COMPLIANCE_ITEMS = [
  {
    id: "comp-panchayath-oct-mar",
    title: "Panchayath Tax (October–March cycle)",
    cycle: "October–March",
    dueDate: "2026-11-30",
    recurrence: "Half-yearly",
    status: "Upcoming",
    leadDays: 15,
    responsible: "Elby Abin",
    notes: "Panchayath local body tax assessment & payment"
  },
  {
    id: "comp-panchayath-apr-sep",
    title: "Panchayath Tax (April–September cycle)",
    cycle: "April–September",
    dueDate: "2027-05-31",
    recurrence: "Half-yearly",
    status: "Upcoming",
    leadDays: 15,
    responsible: "Elby Abin",
    notes: "Panchayath local body tax assessment & payment"
  },
  {
    id: "comp-fire-safety",
    title: "Fire and Safety Licence Renewal",
    cycle: "Annual",
    dueDate: "2027-03-31",
    recurrence: "Annual",
    status: "Upcoming",
    leadDays: 30,
    responsible: "Gopinathan P",
    notes: "Kerala Fire & Rescue Services auditorium inspection & certificate"
  },
  {
    id: "comp-electrical-renewal",
    title: "Electrical Directorate Renewal Fees",
    cycle: "Annual",
    dueDate: "2027-04-30",
    recurrence: "Annual",
    status: "Upcoming",
    leadDays: 20,
    responsible: "Vibin Varghese K",
    notes: "Electrical Inspectorate annual inspection & safety certificate"
  },
  {
    id: "comp-fire-theft-ins",
    title: "Fire and Theft Insurance Policy Renewal",
    cycle: "Annual",
    dueDate: "2027-06-30",
    recurrence: "Annual",
    status: "Upcoming",
    leadDays: 30,
    responsible: "Abin Varghese K",
    notes: "Comprehensive building, machinery and public liability coverage"
  },
  {
    id: "comp-gst-return",
    title: "GST Return Filing",
    cycle: "Monthly",
    dueDate: "2026-10-20",
    recurrence: "Monthly",
    status: "Upcoming",
    leadDays: 10,
    responsible: "Elby Abin",
    notes: "GSTR-1 and GSTR-3B monthly filing"
  },
  {
    id: "comp-bank-loan-emi",
    title: "Bank Loan EMI / Monthly Debt Servicing",
    cycle: "Monthly",
    dueDate: "2026-10-10",
    recurrence: "Monthly",
    status: "Upcoming",
    leadDays: 5,
    responsible: "Elby Abin",
    notes: "Auditorium term loan instalment payment"
  },
  {
    id: "comp-revenue-tax",
    title: "Revenue Tax / Land Tax",
    cycle: "Annual",
    dueDate: "2027-03-15",
    recurrence: "Annual",
    status: "Upcoming",
    leadDays: 15,
    responsible: "Abin Varghese K",
    notes: "Village office land revenue tax receipt"
  },
  {
    id: "comp-prof-tax",
    title: "Professional Tax",
    cycle: "Half-yearly",
    dueDate: "2026-11-30",
    recurrence: "Half-yearly",
    status: "Upcoming",
    leadDays: 15,
    responsible: "Elby Abin",
    notes: "Panchayath staff professional tax payment"
  }
];

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
      localStorage.setItem("choice_checklist_templates", JSON.stringify(DEFAULT_CHECKLIST_TEMPLATES));
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
