// Open Workspace — main shell: sidebar, router, search, launcher, launch flow, tray, hotkeys.
import { icon } from "./icons.js";
import { t, loadLocale, getLang, fmtDateTime } from "./i18n.js";
import {
  state, initStore, getWorkspace, saveWorkspace, deleteWorkspace, duplicateWorkspace,
  persistSettings, persistHistory, refreshTrayMenu, tauri, env, blankWorkspace,
} from "./store.js";
import { launchWorkspace, stopWorkspace, runningRegistry, launchStatus, countItems, getLaunchPlan } from "./launcher.js";
import { openModal, confirmDialog, toast } from "./dialogs.js";
import { renderGrid, newWorkspaceDialog, templatesView, askDelete } from "./views-home.js";
import { detailView } from "./views-detail.js";
import { settingsView } from "./views-settings.js";
import { createFromTemplate } from "./store.js";

let route = { view: "home", workspaceId: null, filter: "all", query: "" };
let launchFilter = "all";

function applyTheme() {
  const pref = state.settings.theme || "dark";
  const root = document.documentElement;
  const set = (mode) => {
    root.dataset.theme = mode;
    document.body.classList.toggle("light", mode === "light");
  };
  if (pref === "system") {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    set(dark ? "dark" : "light");
  } else set(pref);
  try {
    matchMedia("(prefers-color-scheme: dark)").onchange = () => { if ((state.settings.theme || "dark") === "system") applyTheme(); };
  } catch {}
}

async function notify(title, body) {
  toast(`${title}${body ? " — " + body : ""}`, /partial|جزئي|fail|فشل/i.test(title) ? "info" : "success");
  if (!state.settings.notifications) return;
  if (!env.isTauri) return;
  try { await tauri("send_notification", { title, body: body || "" }); } catch {}
}

// ---------- shell ----------
function shell() {
  document.body.innerHTML = `
    <div id="app">
      <aside id="sidebar" aria-label="Navigation">
        <div class="brand"><span class="brand-mark">${icon("grid", 20)}</span><span class="brand-name">Open Workspace</span></div>
        <nav class="side-nav" role="navigation">
          <button data-view="home">${icon("home", 17)}<span data-i="nav.home"></span></button>
          <button data-view="workspaces">${icon("grid", 17)}<span data-i="nav.workspaces"></span></button>
          <button data-view="favorites">${icon("star", 17)}<span data-i="nav.favorites"></span></button>
          <button data-view="recent">${icon("clock", 17)}<span data-i="nav.recent"></span></button>
          <button data-view="templates">${icon("layers", 17)}<span data-i="nav.templates"></span></button>
          <button data-view="settings">${icon("settings", 17)}<span data-i="nav.settings"></span></button>
        </nav>
        <div class="side-foot"><span class="muted small" data-i="nav.version"></span><span class="mono small" id="ver"></span></div>
      </aside>
      <div id="main">
        <header id="topbar">
          <button class="icon-btn menu-btn" aria-label="Menu">${icon("grid", 18)}</button>
          <div class="search-trigger" id="searchTrigger" role="search" tabindex="0">
            ${icon("search", 16)}<span data-i="search.placeholder"></span><kbd>Ctrl K</kbd>
          </div>
          <div class="top-actions">
            <button class="btn primary sm" id="newBtn">${icon("plus", 15)}<span data-i="home.new"></span></button>
            <button class="icon-btn" id="launcherBtn" aria-label="Quick launcher" title="Workspace launcher">${icon("zap", 18)}</button>
            <button class="icon-btn" id="settingsBtn" aria-label="Settings" title="Settings">${icon("settings", 18)}</button>
          </div>
        </header>
        <main id="content" tabindex="-1"></main>
      </div>
    </div>
    <div id="toasts" aria-live="polite"></div>
    <div id="overlay-root"></div>`;
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.view)));
  document.getElementById("newBtn").addEventListener("click", () => newWorkspaceDialog((ws) => { paint(); navigate("detail", ws.id); }));
  document.getElementById("settingsBtn").addEventListener("click", () => navigate("settings"));
  document.getElementById("launcherBtn").addEventListener("click", openQuickLauncher);
  const st = document.getElementById("searchTrigger");
  st.addEventListener("click", openGlobalSearch);
  st.addEventListener("keydown", (e) => { if (e.key === "Enter") openGlobalSearch(); });
  document.querySelector(".menu-btn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
}

function paintI18n() {
  document.querySelectorAll("[data-i]").forEach((el) => { el.textContent = t(el.dataset.i); });
  document.title = t("appName");
  document.querySelector(".brand-name").textContent = t("appName");
  document.getElementById("ver").textContent = `v${state.version}`;
  document.querySelectorAll(".side-nav button").forEach((b) => {
    b.classList.toggle("on", b.dataset.view === route.view || (route.view === "detail" && b.dataset.view === "workspaces"));
  });
}

// ---------- router ----------
function navigate(view, workspaceId = null) {
  route = { view, workspaceId, filter: route.filter, query: route.query };
  if (workspaceId) state.history.lastWorkspaceId = workspaceId;
  paint();
  document.getElementById("content").focus({ preventScroll: true });
}

function paint() {
  paintI18n();
  const c = document.getElementById("content");
  c.innerHTML = "";
  if (route.view === "settings") {
    settingsView(c, {
      onTheme: applyTheme,
      onLanguage: () => { paint(); },
      onReset: resetApp,
    });
  } else if (route.view === "detail" && route.workspaceId) {
    const ws = getWorkspace(route.workspaceId);
    if (!ws) { navigate("home"); return; }
    detailView(c, ws, {
      onBack: () => navigate("workspaces"),
      onLaunch: (w) => startLaunchFlow(w),
      onStop: (w) => stopFlow(w),
      onExport: (w) => exportWorkspace(w),
      onChanged: (full = true) => { if (full) paint(); refreshTrayMenu(); },
    });
  } else if (route.view === "templates") {
    templatesView(c, { onOpen: (ws) => navigate("detail", ws.id), onChanged: () => { paint(); } });
  } else {
    homeView(c, route.view);
  }
}

function filteredWorkspaces(view) {
  let list = [...state.workspaces];
  const q = route.query.trim().toLowerCase();
  if (view === "favorites") list = list.filter((w) => w.favorite);
  else if (view === "recent") {
    const order = state.history.recentIds;
    list = list.filter((w) => order.includes(w.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  if (view === "home" || view === "workspaces") {
    if (launchFilter === "favorites") list = list.filter((w) => w.favorite);
    else if (launchFilter === "recent") {
      const order = state.history.recentIds;
      list = list.filter((w) => order.includes(w.id));
    }
  }
  if (q) {
    list = list.filter((w) => {
      const hay = [
        w.name, w.description, w.group, w.notes,
        ...(w.apps || []).flatMap((a) => [a.name, a.path, a.args, a.cwd]),
        ...(w.websites || []).flatMap((x) => [x.name, x.url]),
        ...(w.files || []).flatMap((f) => [f.name, f.path]),
        ...(w.commands || []).flatMap((x) => [x.name, x.command, x.cwd]),
      ].join("\n").toLowerCase();
      return hay.includes(q);
    });
  }
  return list;
}

function homeView(c, view) {
  const titles = { home: t("home.title"), workspaces: t("nav.workspaces"), favorites: t("nav.favorites"), recent: t("nav.recent") };
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `<div><h1></h1><p class="muted"></p></div><div class="head-actions"><button class="btn primary" id="headNew"></button></div>`;
  head.querySelector("h1").textContent = titles[view] || titles.home;
  const list0 = filteredWorkspaces(view);
  head.querySelector("p").textContent = t("home.subtitle", { count: list0.length });
  head.querySelector("#headNew").textContent = `+ ${t("home.new")}`;
  head.querySelector("#headNew").addEventListener("click", () => newWorkspaceDialog((ws) => { paint(); navigate("detail", ws.id); }));
  c.appendChild(head);

  if (!state.workspaces.length) {
    // First launch hero
    const hero = document.createElement("div");
    hero.className = "panel hero";
    hero.innerHTML = `<h2></h2><p class="muted"></p><div class="row-actions"></div>`;
    hero.querySelector("h2").textContent = t("home.welcome");
    hero.querySelector("p").textContent = t("home.welcomeDesc");
    const b1 = document.createElement("button");
    b1.className = "btn primary";
    b1.textContent = t("home.create");
    b1.addEventListener("click", () => newWorkspaceDialog((ws) => { paint(); navigate("detail", ws.id); }));
    const b2 = document.createElement("button");
    b2.className = "btn";
    b2.textContent = t("home.trySample");
    b2.addEventListener("click", async () => {
      const ws = await createFromTemplate("developer");
      toast(t("dialogs.sampleDone"), "success");
      paint();
      navigate("detail", ws.id);
    });
    hero.querySelector(".row-actions").append(b1, b2);
    c.appendChild(hero);
  }

  if (view === "home" || view === "workspaces") {
    const tabs = document.createElement("div");
    tabs.className = "filter-tabs";
    for (const f of ["all", "favorites", "recent"]) {
      const b = document.createElement("button");
      b.className = `filter-tab ${launchFilter === f ? "on" : ""}`;
      b.textContent = t(f === "all" ? "home.all" : f === "favorites" ? "home.favorites" : "home.recent");
      b.addEventListener("click", () => { launchFilter = f; paint(); });
      tabs.appendChild(b);
    }
    c.appendChild(tabs);
  }

  if (view === "recent") {
    const clear = document.createElement("button");
    clear.className = "btn sm";
    clear.textContent = t("settings.clearHistory");
    clear.addEventListener("click", async () => {
      state.history.recentIds = [];
      await persistHistory();
      paint();
    });
    c.appendChild(clear);
  }

  const grid = document.createElement("div");
  grid.className = "grid-wrap";
  c.appendChild(grid);
  const cbs = {
    onOpen: (ws) => navigate("detail", ws.id),
    onLaunch: (ws) => startLaunchFlow(ws),
    onStop: (ws) => stopFlow(ws),
    onExport: (ws) => exportWorkspace(ws),
    onNew: () => newWorkspaceDialog((ws) => { paint(); navigate("detail", ws.id); }),
    onChanged: () => paint(),
  };
  renderGrid(grid, filteredWorkspaces(view), cbs);
}

// ---------- launch flow ----------
async function startLaunchFlow(ws, profileId = null) {
  const plan = getLaunchPlan(ws, profileId);
  const total = plan.apps.length + plan.websites.length + plan.files.length + plan.commands.length;
  if (!total) {
    toast(t("editor.noApps"), "info");
    navigate("detail", ws.id);
    return;
  }
  // Startup-style warning for large workspaces when choosing startup launch is handled in settings;
  // here show progress dialog.
  const showProgress = state.settings.showLaunchProgress !== false;
  let dlg = null;
  let listEl = null;
  const signal = { cancelled: false };
  if (showProgress) {
    const body = document.createElement("div");
    body.innerHTML = `<p class="muted" id="lpSub"></p><div class="lp-list" id="lpList"></div>`;
    const m = openModal({
      title: t("launch.title", { name: ws.name }),
      body,
      actions: [{ id: "cancel", label: t("launch.cancel"), onClick: () => { signal.cancelled = true; } }],
    });
    dlg = m;
    listEl = body.querySelector("#lpList");
    const prof = plan.profile ? ` · ${t("launch.profile")}: ${plan.profile.name}` : "";
    body.querySelector("#lpSub").textContent = `${total} ${t("home.items")}${prof}`;
  }
  const rowFor = (label) => {
    if (!listEl) return null;
    const row = document.createElement("div");
    row.className = "lp-row pending";
    row.innerHTML = `<span class="lp-ic">${icon("clock", 15)}</span><span class="lp-label"></span><span class="lp-act"></span>`;
    row.querySelector(".lp-label").textContent = label;
    listEl.appendChild(row);
    return row;
  };
  const onEvent = (e) => {
    if (!listEl) return;
    if (e.type === "item-start") {
      const r = rowFor(e.label);
      e._row = r;
      if (r) { r.classList.add("active"); r.querySelector(".lp-ic").innerHTML = icon("refresh", 14); }
    } else if (e.type === "item-ok") {
      const rows = [...listEl.querySelectorAll(".lp-row")];
      const r = rows.reverse().find((x) => x.querySelector(".lp-label").textContent === e.label && x.classList.contains("active")) || rows[0];
      if (r) { r.classList.remove("active", "pending"); r.classList.add("ok"); r.querySelector(".lp-ic").innerHTML = icon("check", 15); }
    } else if (e.type === "item-fail") {
      const rows = [...listEl.querySelectorAll(".lp-row")];
      const r = rows.reverse().find((x) => x.querySelector(".lp-label").textContent === e.label && x.classList.contains("active")) || rows[0];
      if (r) {
        r.classList.remove("active", "pending"); r.classList.add("fail");
        r.querySelector(".lp-ic").innerHTML = icon("alert", 15);
        const act = r.querySelector(".lp-act");
        const skip = document.createElement("button");
        skip.className = "btn sm";
        skip.textContent = t("launch.skip");
        skip.addEventListener("click", () => r.remove());
        const fix = document.createElement("button");
        fix.className = "btn sm";
        fix.textContent = t("launch.fix");
        fix.addEventListener("click", () => { dlg?.close(); navigate("detail", ws.id); });
        act.append(fix, skip);
        const err = document.createElement("div");
        err.className = "lp-err";
        err.textContent = e.error;
        r.appendChild(err);
      }
    }
  };
  const res = await launchWorkspace(ws, { profileId, signal, onEvent });
  if (dlg) {
    const foot = dlg.overlay.querySelector(".modal-foot");
    foot.innerHTML = "";
    const done = document.createElement("div");
    done.className = `lp-done ${res.failed ? "warn" : "ok"}`;
    done.innerHTML = `${icon(res.failed ? "alert" : "check", 16)}<span></span>`;
    done.lastChild.textContent = res.cancelled ? t("launch.cancel") : res.failed ? t("launch.partial") : t("launch.done");
    dlg.bodyEl.appendChild(done);
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn primary";
    closeBtn.textContent = t("launch.close");
    closeBtn.addEventListener("click", () => dlg.close());
    foot.appendChild(closeBtn);
  }
  if (res.failed) notify(t("notify.partial"), ws.name);
  else if (!res.cancelled) notify(t("notify.launched"), ws.name);
  paint();
  refreshTrayMenu();
}

async function stopFlow(ws) {
  const entries = runningRegistry.get(ws.id) || [];
  if (!entries.length) { toast(t("stop.none"), "info"); return; }
  if (state.settings.confirmBeforeStop) {
    const body = document.createElement("div");
    body.innerHTML = `<p class="muted">${t("stop.desc")}</p>`;
    const ul = document.createElement("div");
    ul.className = "pick-list";
    for (const e of entries) {
      const r = document.createElement("div");
      r.className = "pick-row static";
      r.innerHTML = `${icon("check", 14)}<span></span>`;
      r.lastChild.textContent = e.label;
      ul.appendChild(r);
    }
    body.appendChild(ul);
    const m = openModal({
      title: t("stop.title"),
      body,
      actions: [
        { id: "cancel", label: t("dialogs.cancel") },
        { id: "stop", label: t("stop.title"), kind: "danger", onClick: async () => { await stopWorkspace(ws.id); paint(); } },
      ],
    });
    void m;
  } else {
    await stopWorkspace(ws.id);
    paint();
  }
}

// ---------- global search ----------
function openGlobalSearch() {
  const body = document.createElement("div");
  body.className = "gsearch";
  body.innerHTML = `<input class="input big" id="gsInput" placeholder=""/><div class="gs-results" id="gsRes"></div><p class="muted small" id="gsHint"></p>`;
  const m = openModal({ title: t("search.label"), body, wide: true });
  const inp = body.querySelector("#gsInput");
  inp.placeholder = t("search.placeholder");
  body.querySelector("#gsHint").textContent = t("search.hint");
  const res = body.querySelector("#gsRes");
  let activeIdx = 0;
  let flat = [];
  function search(q) {
    res.innerHTML = "";
    flat = [];
    q = q.trim().toLowerCase();
    if (!q) return;
    for (const ws of state.workspaces) {
      const hits = [];
      const push = (label, sub) => hits.push({ label, sub });
      if ((ws.name || "").toLowerCase().includes(q)) push(ws.name, t("home.title"));
      if ((ws.description || "").toLowerCase().includes(q)) push(ws.description, ws.name);
      for (const a of ws.apps || []) if ([a.name, a.path].join(" ").toLowerCase().includes(q)) push(a.name || a.path, `${ws.name} · app`);
      for (const x of ws.websites || []) if ([x.name, x.url].join(" ").toLowerCase().includes(q)) push(x.name || x.url, `${ws.name} · website`);
      for (const f of ws.files || []) if ([f.name, f.path].join(" ").toLowerCase().includes(q)) push(f.name || f.path, `${ws.name} · file`);
      for (const c of ws.commands || []) if ([c.name, c.command].join(" ").toLowerCase().includes(q)) push(c.name || c.command, `${ws.name} · command`);
      if ((ws.notes || "").toLowerCase().includes(q)) push(ws.notes.slice(0, 80), `${ws.name} · notes`);
      if (hits.length) {
        const h = document.createElement("h4");
        h.textContent = ws.name;
        res.appendChild(h);
        for (const hh of hits.slice(0, 5)) {
          const b = document.createElement("button");
          b.className = "gs-row";
          b.innerHTML = `${icon("search", 14)}<span></span><em></em>`;
          b.querySelector("span").textContent = hh.label;
          b.querySelector("em").textContent = hh.sub;
          const target = ws;
          b.addEventListener("click", () => { m.close(); navigate("detail", target.id); });
          res.appendChild(b);
          flat.push(b);
        }
      }
    }
    if (!res.children.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = t("search.noResults");
      res.appendChild(p);
    } else {
      activeIdx = 0;
      flat[0]?.classList.add("on");
    }
  }
  inp.addEventListener("input", () => search(inp.value));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      flat[activeIdx]?.classList.remove("on");
      activeIdx = e.key === "ArrowDown" ? Math.min(flat.length - 1, activeIdx + 1) : Math.max(0, activeIdx - 1);
      flat[activeIdx]?.classList.add("on");
      flat[activeIdx]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      flat[activeIdx]?.click();
    }
  });
  setTimeout(() => inp.focus(), 60);
}

// ---------- quick launcher ----------
function openQuickLauncher() {
  const body = document.createElement("div");
  body.className = "gsearch launcher";
  body.innerHTML = `<input class="input big" id="qlInput" placeholder=""/><div class="gs-results" id="qlRes"></div><p class="muted small"></p>`;
  const m = openModal({ title: t("launcher.title"), body });
  const inp = body.querySelector("#qlInput");
  inp.placeholder = t("launcher.title");
  body.querySelector("p").textContent = t("launcher.hint");
  const res = body.querySelector("#qlRes");
  let idx = 0;
  let btns = [];
  function paint(f = "") {
    res.innerHTML = "";
    const list = state.workspaces.filter((w) => w.name.toLowerCase().includes(f.toLowerCase()));
    btns = [];
    for (const ws of list) {
      const b = document.createElement("button");
      b.className = "gs-row";
      b.innerHTML = `<span class="ws-icon sm">${icon(ws.icon || "grid", 16)}</span><span></span><em></em>`;
      b.querySelector("span:nth-child(2)").textContent = ws.name;
      b.querySelector("em").textContent = `${countItems(ws)} ${t("home.items")}`;
      b.addEventListener("click", () => { m.close(); startLaunchFlow(ws); });
      res.appendChild(b);
      btns.push(b);
    }
    idx = 0;
    btns[0]?.classList.add("on");
  }
  inp.addEventListener("input", () => paint(inp.value));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      btns[idx]?.classList.remove("on");
      idx = e.key === "ArrowDown" ? Math.min(btns.length - 1, idx + 1) : Math.max(0, idx - 1);
      btns[idx]?.classList.add("on");
    } else if (e.key === "Enter") btns[idx]?.click();
  });
  paint();
  setTimeout(() => inp.focus(), 60);
}

// ---------- import / export / backup ----------
async function exportWorkspace(ws) {
  if (!env.isTauri) { toast("Export requires the desktop app.", "error"); return; }
  try {
    const dest = await tauri("pick_save_file", { defaultName: `${ws.name}.openworkspace`, ext: "openworkspace" });
    if (!dest) return;
    await tauri("export_workspace_file", { id: ws.id, dest });
    toast(t("dialogs.exportDone"), "success");
  } catch (e) { toast(typeof e === "string" ? e : t("errors.generic"), "error"); }
}

async function importWorkspaceFile(path) {
  let summary;
  try { summary = JSON.parse(await tauri("inspect_workspace_file", { path })); }
  catch (e) { toast(typeof e === "string" ? e : t("errors.generic"), "error"); return; }
  const body = document.createElement("div");
  const counts = document.createElement("p");
  counts.textContent = `${t("dialogs.importWarn")} ${summary.apps} ${t("dialogs.applications")}, ${summary.websites} ${t("dialogs.websites")}, ${summary.commands} ${t("dialogs.commandsCount")}, ${summary.files} ${t("dialogs.folders")}.`;
  body.appendChild(counts);
  if ((summary.commandsList || []).length) {
    const h = document.createElement("h4");
    h.textContent = t("dialogs.importCmds");
    body.appendChild(h);
    const ul = document.createElement("div");
    ul.className = "pick-list";
    for (const c of summary.commandsList) {
      const r = document.createElement("div");
      r.className = "pick-row static mono";
      r.textContent = c;
      ul.appendChild(r);
    }
    body.appendChild(ul);
    const q = document.createElement("p");
    q.className = "warn-box";
    q.textContent = t("dialogs.importAllowQ");
    body.appendChild(q);
  }
  openModal({
    title: `${t("dialogs.import")}: ${summary.name}`,
    body, wide: true,
    actions: [
      { id: "cancel", label: t("dialogs.cancel") },
      {
        id: "import", label: t("dialogs.import"), kind: "primary",
        onClick: async () => {
          const wsData = summary.workspace;
          const ws = blankWorkspace(wsData.name || "Imported");
          Object.assign(ws, wsData, { id: ws.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLaunchedAt: null, launchCount: 0 });
          await saveWorkspace(ws);
          toast(t("dialogs.importDone"), "success");
          paint();
          navigate("detail", ws.id);
        },
      },
    ],
  });
}

async function restoreBackup(path) {
  let content;
  try {
    content = await tauri("read_text_file", { path });
  } catch (e) { toast(typeof e === "string" ? e : t("errors.generic"), "error"); return; }
  let data;
  try { data = JSON.parse(content); } catch { toast(t("errors.generic"), "error"); return; }
  const wsList = data.workspaces || [];
  const body = document.createElement("div");
  body.innerHTML = `<p></p>`;
  body.querySelector("p").textContent = `${wsList.length} workspaces · settings · shortcuts`;
  openModal({
    title: t("settings.restore"),
    body,
    actions: [
      { id: "cancel", label: t("dialogs.cancel") },
      {
        id: "go", label: t("dialogs.import"), kind: "primary",
        onClick: async () => {
          for (const w of wsList) {
            const ws = blankWorkspace(w.name || "Imported");
            Object.assign(ws, w, { id: ws.id });
            await saveWorkspace(ws);
          }
          if (data.settings) { Object.assign(state.settings, data.settings); await persistSettings(); applyTheme(); }
          toast(t("dialogs.importDone"), "success");
          paint();
        },
      },
    ],
  });
}

async function resetApp() {
  for (const w of [...state.workspaces]) {
    try { await tauri("delete_workspace_file", { id: w.id }); } catch {}
  }
  state.workspaces = [];
  state.history = { recentIds: [], launches: [], lastWorkspaceId: null };
  await persistHistory().catch(() => {});
  paint();
}

// ---------- keyboard shortcuts ----------
function matchShortcut(e, combo) {
  if (!combo) return false;
  const parts = combo.split("+").map((s) => s.trim().toLowerCase());
  const needCtrl = parts.includes("ctrl");
  const needAlt = parts.includes("alt");
  const needShift = parts.includes("shift");
  const key = parts[parts.length - 1];
  const pressed = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return e.ctrlKey === needCtrl && e.altKey === needAlt && e.shiftKey === needShift && pressed === key;
}

function bindShortcuts() {
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (matchShortcut(e, state.shortcuts.search || "Ctrl+K")) {
      e.preventDefault();
      openGlobalSearch();
    } else if (!typing && matchShortcut(e, state.shortcuts.new || "Ctrl+N")) {
      e.preventDefault();
      newWorkspaceDialog((ws) => { paint(); navigate("detail", ws.id); });
    } else if (!typing && e.key === "Delete" && route.view === "detail" && route.workspaceId) {
      // Delete key: no destructive default; ignore (per-item delete buttons handle it)
    } else if (e.key === "Escape" && route.view === "detail") {
      // keep in detail; modals handle their own Esc
    }
  });
}

// ---------- tray + global hotkey + startup (invoke-only, fully offline) ----------
async function setupTrayAndHotkey() {
  await refreshTrayMenu().catch(() => {});
  if (!env.isTauri) return;
  try { await tauri("set_tray_visible", { visible: state.settings.trayEnabled !== false }); } catch {}
  const ev = window.__TAURI__?.event;
  if (ev?.listen) {
    try {
      await ev.listen("tray-launch-workspace", (e) => {
        const id = e.payload;
        const ws = getWorkspace(id);
        if (ws) startLaunchFlow(ws);
      });
      await ev.listen("open-launcher", () => openQuickLauncher());
    } catch {}
  }
  // global hotkey via backend (no CDN)
  try { await tauri("set_global_hotkey", { hotkey: state.settings.globalHotkey || "Ctrl+Alt+W" }); } catch {}
  document.addEventListener("ow:hotkey-change", async () => {
    try { await tauri("set_global_hotkey", { hotkey: state.settings.globalHotkey || "Ctrl+Alt+W" }); } catch {}
  });
  // restore backup listener
  document.addEventListener("ow:restore", async () => {
    try {
      const f = await tauri("pick_generic_file", { directory: false, extensions: ["openworkspace-backup", "json"] });
      if (typeof f === "string" && f) restoreBackup(f);
    } catch {}
  });
  // autostart state sync (best effort, invoke-only)
  try { await tauri("set_autostart", { enabled: !!state.settings.startWithWindows }); } catch {}
}

// ---------- boot ----------
export async function boot() {
  shell();
  await initStore();
  const lang = state.settings.language === "ar" ? "ar" : "en";
  await loadLocale(lang);
  applyTheme();
  bindShortcuts();
  paint();
  await setupTrayAndHotkey();
  // startup behavior
  if (state.settings.startMinimized || state.settings.startMinimizedBoot) {
    try { await tauri("minimize_main_window"); } catch {}
  }
  if (state.settings.openLastWorkspace && state.history.lastWorkspaceId && getWorkspace(state.history.lastWorkspaceId)) {
    navigate("detail", state.history.lastWorkspaceId);
  }
  const startId = state.settings.launchOnStartupId;
  if (startId && getWorkspace(startId)) {
    setTimeout(() => startLaunchFlow(getWorkspace(startId)), 2500);
  }
  // topbar import/export quick hooks via drag&drop of .openworkspace files
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    const p = f?.path;
    if (p && env.isTauri) {
      if (p.endsWith(".openworkspace")) importWorkspaceFile(p);
      else if (p.endsWith(".openworkspace-backup")) restoreBackup(p);
    }
  });
  // File menu equivalent: double-click empty handled; expose import via keyboard? Add hidden global:
  window.__ow = {
    import: async () => {
      try {
        const f = await tauri("pick_generic_file", { directory: false, extensions: ["openworkspace"] });
        if (typeof f === "string" && f) importWorkspaceFile(f);
      } catch {}
    },
    exportCurrent: () => { if (route.workspaceId) exportWorkspace(getWorkspace(route.workspaceId)); },
    navigate, paint, state,
  };
}
