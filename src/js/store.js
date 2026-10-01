// Data layer: workspaces, settings, history. Tauri-backed with localStorage fallback.
import { templates } from "./templates.js";

const isTauri = typeof window !== "undefined" && !!window.__TAURI__;
// Offline-first: use only the Tauri runtime-injected invoke (no CDN / no network).
async function tauri(cmd, args = {}) {
  const fn = window.__TAURI__?.core?.invoke;
  if (!fn) throw new Error("not-tauri");
  return fn(cmd, args);
}
export const env = { isTauri };

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
}
export function nowIso() { return new Date().toISOString(); }

export const DEFAULT_SETTINGS = {
  theme: "dark",
  language: "en",
  startMinimized: false,
  openLastWorkspace: false,
  rememberWindowSize: true,
  rememberWindowPosition: true,
  confirmBeforeDelete: true,
  confirmBeforeStop: true,
  launchMode: "sequential",
  defaultDelay: 0,
  showLaunchProgress: true,
  stopOnCriticalError: false,
  trayEnabled: true,
  closeToTray: false,
  trayQuickLaunch: true,
  globalHotkey: "Ctrl+Alt+W",
  notifications: true,
  startWithWindows: false,
  startMinimizedBoot: false,
  launchOnStartupId: null,
  recentEnabled: true,
  historyEnabled: true,
};
export const DEFAULT_SHORTCUTS = { search: "Ctrl+K", new: "Ctrl+N", launch: "Ctrl+Enter" };

export function blankWorkspace(name = "") {
  const t = nowIso();
  return {
    id: uid(), name, description: "", icon: "grid", customIcon: null,
    accent: "#4d7cfe", group: "", favorite: false,
    createdAt: t, updatedAt: t, lastLaunchedAt: null, launchCount: 0,
    startupLaunch: false, restoreLayout: false, workspaceFolder: "",
    apps: [], websites: [], files: [], commands: [],
    notes: "", env: {},
    profiles: [], snapshots: [],
  };
}
export function blankApp() {
  return { id: uid(), name: "", path: "", args: "", cwd: "", order: 0, delaySec: 0, minimized: false, window: { monitor: 0, maximized: false } };
}
export function blankWebsite() {
  return { id: uid(), name: "", url: "", browser: "default", order: 0 };
}
export function blankFile(kind = "folder") {
  return { id: uid(), name: "", path: "", kind, order: 0 };
}
export function blankCommand() {
  return { id: uid(), name: "", shell: "powershell", command: "", cwd: "", order: 0, behavior: "keepopen" };
}

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// In-memory state
export const state = {
  workspaces: [],
  settings: { ...DEFAULT_SETTINGS },
  shortcuts: { ...DEFAULT_SHORTCUTS },
  history: { recentIds: [], launches: [], lastWorkspaceId: null },
  snapshots: {},
  browsers: {},
  monitors: [{ id: "0", label: "Primary display", primary: "true" }],
  dataDir: "",
  version: "1.0.0",
  initialized: false,
};

async function loadAllTauri() {
  const files = await tauri("list_workspace_files");
  diskHad.workspaces = files.length > 0;
  state.workspaces = files.map((c) => {
    try { return JSON.parse(c); } catch { return null; }
  }).filter(Boolean);
  const s = await tauri("load_settings").catch(() => "{}");
  diskHad.settings = s.trim() !== "{}";
  try {
    const parsed = JSON.parse(s || "{}");
    state.settings = { ...DEFAULT_SETTINGS, ...parsed };
  } catch {}
  const sc = await tauri("load_aux", { name: "shortcuts" }).catch(() => "{}");
  diskHad.shortcuts = sc.trim() !== "{}";
  try {
    const p = JSON.parse(sc || "{}");
    if (p && typeof p === "object") state.shortcuts = { ...DEFAULT_SHORTCUTS, ...p };
  } catch {}
  const h = await tauri("load_aux", { name: "history" }).catch(() => "{}");
  diskHad.history = h.trim() !== "{}";
  try {
    const p = JSON.parse(h || "{}");
    if (p && typeof p === "object") state.history = { recentIds: [], launches: [], lastWorkspaceId: null, ...p };
  } catch {}
  const snap = await tauri("load_aux", { name: "snapshots" }).catch(() => "{}");
  try { state.snapshots = JSON.parse(snap || "{}") || {}; } catch { state.snapshots = {}; }
  state.browsers = await tauri("detect_browsers").catch(() => ({}));
  state.monitors = await tauri("list_monitors").catch(() => state.monitors);
  state.dataDir = await tauri("get_data_dir").catch(() => "");
  state.version = await tauri("get_app_version").catch(() => "1.0.0");
}

// Tracks whether the disk backend already had data (for one-time localStorage migration).
const diskHad = { workspaces: false, settings: false, shortcuts: false, history: false };

function loadAllLocal() {
  state.workspaces = lsGet("ow.workspaces", []);
  state.settings = { ...DEFAULT_SETTINGS, ...lsGet("ow.settings", {}) };
  state.shortcuts = { ...DEFAULT_SHORTCUTS, ...lsGet("ow.shortcuts", {}) };
  state.history = { recentIds: [], launches: [], lastWorkspaceId: null, ...lsGet("ow.history", {}) };
  state.snapshots = lsGet("ow.snapshots", {});
  state.dataDir = "(browser preview)";
  state.version = "1.0.0";
}

// One-time migration: if the app previously ran without backend access, user data
// may live in WebView localStorage while the disk is empty. Move it to disk once,
// then clear the local copies so there is a single source of truth.
async function migrateLocalToDisk() {
  try {
    const localWs = lsGet("ow.workspaces", []);
    if (Array.isArray(localWs) && localWs.length > 0 && !diskHad.workspaces) {
      for (const ws of localWs) {
        if (!ws || !ws.id) continue;
        try { await tauri("save_workspace_file", { id: ws.id, jsonText: JSON.stringify(ws) }); } catch {}
      }
      state.workspaces = localWs;
    }
    const localSettings = lsGet("ow.settings", null);
    if (localSettings && typeof localSettings === "object" && !diskHad.settings) {
      state.settings = { ...DEFAULT_SETTINGS, ...localSettings };
      try { await tauri("save_settings", { jsonText: JSON.stringify(state.settings) }); } catch {}
    }
    const localShortcuts = lsGet("ow.shortcuts", null);
    if (localShortcuts && typeof localShortcuts === "object" && !diskHad.shortcuts) {
      state.shortcuts = { ...DEFAULT_SHORTCUTS, ...localShortcuts };
      try { await tauri("save_aux", { name: "shortcuts", jsonText: JSON.stringify(state.shortcuts) }); } catch {}
    }
    const localHistory = lsGet("ow.history", null);
    if (localHistory && typeof localHistory === "object" && !diskHad.history) {
      state.history = { recentIds: [], launches: [], lastWorkspaceId: null, ...localHistory };
      try { await tauri("save_aux", { name: "history", jsonText: JSON.stringify(state.history) }); } catch {}
    }
    try {
      localStorage.removeItem("ow.workspaces");
      localStorage.removeItem("ow.settings");
      localStorage.removeItem("ow.shortcuts");
      localStorage.removeItem("ow.history");
      localStorage.removeItem("ow.snapshots");
    } catch {}
  } catch {}
}

export async function initStore() {
  if (state.initialized) return state;
  if (isTauri) {
    try {
      await loadAllTauri();
      await migrateLocalToDisk();
    }
    catch { loadAllLocal(); }
  } else {
    loadAllLocal();
  }
  // normalize
  for (const w of state.workspaces) {
    w.apps ??= []; w.websites ??= []; w.files ??= []; w.commands ??= [];
    w.profiles ??= []; w.env ??= {}; w.snapshots ??= [];
  }
  sortWorkspaces();
  state.initialized = true;
  return state;
}

export function sortWorkspaces() {
  state.workspaces.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function persistSettings() {
  if (isTauri) {
    try { await tauri("save_settings", { jsonText: JSON.stringify(state.settings) }); return; }
    catch {}
  }
  lsSet("ow.settings", state.settings);
}
export async function persistShortcuts() {
  if (isTauri) {
    try { await tauri("save_aux", { name: "shortcuts", jsonText: JSON.stringify(state.shortcuts) }); return; }
    catch {}
  }
  lsSet("ow.shortcuts", state.shortcuts);
}
export async function persistHistory() {
  if (isTauri) {
    try { await tauri("save_aux", { name: "history", jsonText: JSON.stringify(state.history) }); return; }
    catch {}
  }
  lsSet("ow.history", state.history);
}
export async function persistSnapshots() {
  if (isTauri) {
    try { await tauri("save_aux", { name: "snapshots", jsonText: JSON.stringify(state.snapshots) }); return; }
    catch {}
  }
  lsSet("ow.snapshots", state.snapshots);
}

export async function saveWorkspace(ws) {
  ws.updatedAt = nowIso();
  const idx = state.workspaces.findIndex((w) => w.id === ws.id);
  if (idx >= 0) state.workspaces[idx] = ws; else state.workspaces.push(ws);
  sortWorkspaces();
  if (isTauri) {
    try { await tauri("save_workspace_file", { id: ws.id, jsonText: JSON.stringify(ws) }); }
    catch (e) { throw new Error(typeof e === "string" ? e : "Could not save workspace."); }
  } else {
    lsSet("ow.workspaces", state.workspaces);
  }
  refreshTrayMenu().catch(() => {});
  return ws;
}

export async function deleteWorkspace(id) {
  state.workspaces = state.workspaces.filter((w) => w.id !== id);
  state.history.recentIds = state.history.recentIds.filter((x) => x !== id);
  await persistHistory().catch(() => {});
  if (isTauri) {
    try { await tauri("delete_workspace_file", { id }); } catch {}
  } else {
    lsSet("ow.workspaces", state.workspaces);
  }
  refreshTrayMenu().catch(() => {});
}

export function getWorkspace(id) {
  return state.workspaces.find((w) => w.id === id) || null;
}

export async function duplicateWorkspace(id) {
  const src = getWorkspace(id);
  if (!src) throw new Error("Workspace not found.");
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + " - Minimal";
  copy.favorite = false;
  copy.createdAt = nowIso(); copy.updatedAt = nowIso();
  copy.lastLaunchedAt = null; copy.launchCount = 0;
  // regenerate item ids to avoid collisions
  for (const arr of ["apps", "websites", "files", "commands"]) {
    for (const it of copy[arr] || []) it.id = uid();
  }
  for (const p of copy.profiles || []) { p.id = uid(); }
  await saveWorkspace(copy);
  return copy;
}

export async function createFromTemplate(key) {
  const t = templates(key);
  if (!t) throw new Error("Unknown template.");
  const ws = blankWorkspace(t.name);
  Object.assign(ws, { description: t.description, icon: t.icon, accent: t.accent, group: t.group || "" });
  ws.apps = (t.apps || []).map((a) => ({ ...blankApp(), ...a, id: uid() }));
  ws.websites = (t.websites || []).map((a) => ({ ...blankWebsite(), ...a, id: uid() }));
  ws.files = (t.files || []).map((a) => ({ ...blankFile(a.kind || "folder"), ...a, id: uid() }));
  ws.commands = (t.commands || []).map((a) => ({ ...blankCommand(), ...a, id: uid() }));
  ws.notes = t.notes || "";
  ws.profiles = [
    { id: uid(), name: "Full", appIds: [], websiteIds: [], fileIds: [], commandIds: [] },
    { id: uid(), name: "Minimal", appIds: ws.apps.slice(0, 1).map((a) => a.id), websiteIds: [], fileIds: [], commandIds: [] },
  ];
  await saveWorkspace(ws);
  return ws;
}

export function recordLaunch(id, ok) {
  const ws = getWorkspace(id);
  if (ws) {
    ws.lastLaunchedAt = nowIso();
    ws.launchCount = (ws.launchCount || 0) + 1;
    saveWorkspace(ws).catch(() => {});
  }
  if (state.settings.historyEnabled) {
    state.history.launches.unshift({ id, at: nowIso(), ok: !!ok });
    state.history.launches = state.history.launches.slice(0, 100);
  }
  if (state.settings.recentEnabled) {
    state.history.recentIds = [id, ...state.history.recentIds.filter((x) => x !== id)].slice(0, 20);
  }
  state.history.lastWorkspaceId = id;
  persistHistory().catch(() => {});
}

export async function refreshTrayMenu() {
  if (!isTauri) return;
  try {
    const enabled = state.settings.trayEnabled !== false && state.settings.trayQuickLaunch !== false;
    const items = enabled ? state.workspaces.slice(0, 15).map((w) => [w.id, w.name || "Unnamed"]) : [];
    await tauri("refresh_tray", { itemsJson: JSON.stringify(items) });
  } catch {}
}

export { tauri };
