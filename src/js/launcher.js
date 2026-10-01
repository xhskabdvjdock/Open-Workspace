// Launch engine: validate → open apps in order → websites → files/folders → commands.
// Tracks PIDs for ownership, supports sequential/simultaneous + delays + profiles.
import { state, recordLaunch, tauri, env } from "./store.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pid registry: workspaceId -> [{ pid, label, kind }]
export const runningRegistry = new Map(); // workspaceId -> entries
export const launchStatus = new Map(); // workspaceId -> 'running'|'partial'|'error'|'idle'

function wsFolder(ws) {
  return ws.workspaceFolder || "";
}

function profileSubset(ws, profileId) {
  if (!profileId || !ws.profiles?.length) return null;
  const p = ws.profiles.find((x) => x.id === profileId);
  if (!p) return null;
  if (!p.appIds?.length && !p.websiteIds?.length && !p.fileIds?.length && !p.commandIds?.length) return null; // empty = full
  return p;
}

function ordered(arr) {
  return [...(arr || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getLaunchPlan(ws, profileId) {
  const sub = profileSubset(ws, profileId);
  const pick = (all, ids) => {
    if (!sub || !ids) return ordered(all);
    const set = new Set(ids);
    return ordered(all).filter((x) => set.has(x.id));
  };
  return {
    profile: sub,
    apps: pick(ws.apps, sub?.appIds),
    websites: pick(ws.websites, sub?.websiteIds),
    files: pick(ws.files, sub?.fileIds),
    commands: pick(ws.commands, sub?.commandIds),
  };
}

function trackPid(wsId, pid, label, kind) {
  if (!pid) return;
  if (!runningRegistry.has(wsId)) runningRegistry.set(wsId, []);
  runningRegistry.get(wsId).push({ pid, label, kind, startedAt: new Date().toISOString() });
}

export async function isPidAlive(pid) {
  if (!env.isTauri || !pid) return false;
  try { return await tauri("is_process_running", { pid }); }
  catch { return false; }
}

export async function refreshWorkspaceStatus(wsId) {
  const entries = runningRegistry.get(wsId) || [];
  if (!entries.length) {
    launchStatus.set(wsId, "idle");
    return "idle";
  }
  let alive = 0;
  for (const e of entries) {
    if (await isPidAlive(e.pid)) alive++;
  }
  const s = alive === 0 ? "idle" : alive === entries.length ? "running" : "partial";
  launchStatus.set(wsId, s);
  return s;
}

export async function stopWorkspace(wsId, { confirm } = {}) {
  const entries = runningRegistry.get(wsId) || [];
  const alive = [];
  for (const e of entries) {
    if (await isPidAlive(e.pid)) alive.push(e);
  }
  if (!alive.length) {
    runningRegistry.delete(wsId);
    launchStatus.set(wsId, "idle");
    return { closed: 0 };
  }
  // Only kill processes we started (ownership via PID registry). Never kill by name.
  let closed = 0;
  for (const e of alive) {
    try { await tauri("kill_process", { pid: e.pid }); closed++; }
    catch { /* already exited */ }
  }
  runningRegistry.delete(wsId);
  launchStatus.set(wsId, "idle");
  return { closed, total: alive.length };
}

/**
 * Launch a workspace.
 * onEvent({ type: 'item-start'|'item-ok'|'item-fail', item, kind, label, error })
 * Returns { ok, failed, results }
 */
export async function launchWorkspace(ws, { profileId = null, signal = null, onEvent = null } = {}) {
  const plan = getLaunchPlan(ws, profileId);
  const settings = state.settings;
  const results = [];
  let failed = 0;
  const emit = (e) => { try { onEvent?.(e); } catch {} };

  const cancelled = () => signal?.cancelled === true;

  // Merge workspace env into app/command env
  const wsEnv = ws.env || {};

  async function runApps() {
    const apps = plan.apps;
    const simultaneous = settings.launchMode === "simultaneous";
    const execOne = async (app) => {
      if (cancelled()) return;
      const label = app.name || app.path || "Application";
      emit({ type: "item-start", kind: "app", label, item: app });
      // Validate path exists (skip empty placeholder paths from templates)
      if (!app.path?.trim()) {
        const err = `${label} has no application path configured.`;
        failed++;
        results.push({ kind: "app", label, ok: false, error: err, item: app });
        emit({ type: "item-fail", kind: "app", label, error: err, item: app });
        return;
      }
      try {
        if (app.delaySec && app.delaySec > 0) await sleep(Math.min(app.delaySec, 120) * 1000);
        else if (settings.defaultDelay > 0) await sleep(Math.min(settings.defaultDelay, 60) * 1000);
        if (cancelled()) return;
        if (env.isTauri) {
          const pid = await tauri("launch_application", {
            opts: {
              path: app.path, args: app.args || "", cwd: app.cwd || "",
              minimized: !!app.minimized, env: wsEnv, workspaceFolder: wsFolder(ws),
            },
          });
          trackPid(ws.id, pid, label, "app");
        } else {
          await sleep(250); // browser preview: simulate
        }
        results.push({ kind: "app", label, ok: true, item: app });
        emit({ type: "item-ok", kind: "app", label, item: app });
      } catch (e) {
        const err = typeof e === "string" ? e : (e?.message || "Could not launch application.");
        failed++;
        results.push({ kind: "app", label, ok: false, error: err, item: app });
        emit({ type: "item-fail", kind: "app", label, error: err, item: app });
        if (settings.stopOnCriticalError) throw new Error(err);
      }
    };
    if (simultaneous) await Promise.all(apps.map(execOne));
    else for (const a of apps) { await execOne(a); if (cancelled()) break; }
  }

  async function runWebsites() {
    for (const w of plan.websites) {
      if (cancelled()) break;
      const label = w.name || w.url || "Website";
      emit({ type: "item-start", kind: "website", label, item: w });
      try {
        if (env.isTauri) {
          const r = await tauri("open_website", { opts: { url: w.url, browser: w.browser || "default" } });
          if (typeof r === "string" && r.startsWith("fallback-default")) {
            results.push({ kind: "website", label, ok: true, warning: "Selected browser unavailable — opened in default browser.", item: w });
          } else {
            results.push({ kind: "website", label, ok: true, item: w });
          }
        } else {
          window.open(w.url, "_blank", "noopener");
          results.push({ kind: "website", label, ok: true, item: w });
        }
        emit({ type: "item-ok", kind: "website", label, item: w });
      } catch (e) {
        const err = typeof e === "string" ? e : "Could not open website.";
        failed++;
        results.push({ kind: "website", label, ok: false, error: err, item: w });
        emit({ type: "item-fail", kind: "website", label, error: err, item: w });
      }
    }
  }

  async function runFiles() {
    for (const f of plan.files) {
      if (cancelled()) break;
      const label = f.name || f.path || (f.kind === "folder" ? "Folder" : "File");
      emit({ type: "item-start", kind: "file", label, item: f });
      try {
        if (env.isTauri) {
          if (f.kind === "folder") await tauri("open_folder_path", { raw: f.path, workspaceFolder: wsFolder(ws) });
          else await tauri("open_file_path", { raw: f.path, workspaceFolder: wsFolder(ws) });
        } else {
          results.push({ kind: "file", label, ok: true, item: f });
          emit({ type: "item-ok", kind: "file", label, item: f });
          continue;
        }
        results.push({ kind: "file", label, ok: true, item: f });
        emit({ type: "item-ok", kind: "file", label, item: f });
      } catch (e) {
        const err = typeof e === "string" ? e : "File could not be opened.";
        failed++;
        results.push({ kind: "file", label, ok: false, error: err, item: f });
        emit({ type: "item-fail", kind: "file", label, error: err, item: f });
      }
    }
  }

  async function runCommands() {
    for (const c of plan.commands) {
      if (cancelled()) break;
      const label = c.name || c.command || "Command";
      emit({ type: "item-start", kind: "command", label, item: c });
      try {
        if (env.isTauri) {
          const pid = await tauri("run_command", {
            opts: {
              shell: c.shell || "powershell", command: c.command,
              cwd: c.cwd || "", behavior: c.behavior || "keepopen",
              workspaceFolder: wsFolder(ws), env: wsEnv,
            },
          });
          trackPid(ws.id, pid, label, "command");
        } else {
          await sleep(200);
        }
        results.push({ kind: "command", label, ok: true, item: c });
        emit({ type: "item-ok", kind: "command", label, item: c });
      } catch (e) {
        const err = typeof e === "string" ? e : "Could not run command.";
        failed++;
        results.push({ kind: "command", label, ok: false, error: err, item: c });
        emit({ type: "item-fail", kind: "command", label, error: err, item: c });
      }
    }
  }

  try {
    await runApps();
    if (!cancelled()) await runWebsites();
    if (!cancelled()) await runFiles();
    if (!cancelled()) await runCommands();
  } catch (e) {
    // stopOnCriticalError path
    failed = Math.max(failed, 1);
  }

  const ok = failed === 0 && !cancelled();
  launchStatus.set(ws.id, failed === 0 ? "running" : "partial");
  recordLaunch(ws.id, ok);
  return { ok, failed, results, cancelled: cancelled() };
}

export function countItems(ws) {
  return (ws.apps?.length || 0) + (ws.websites?.length || 0) + (ws.files?.length || 0) + (ws.commands?.length || 0);
}
