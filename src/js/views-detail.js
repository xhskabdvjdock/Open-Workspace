// Workspace detail / editor: tabs, item CRUD, drag reorder, profiles, notes, advanced.
import { icon, WORKSPACE_ICONS, ACCENTS } from "./icons.js";
import { t, fmtDateTime } from "./i18n.js";
import {
  state, saveWorkspace, blankApp, blankWebsite, blankFile, blankCommand, uid, tauri, env, nowIso,
} from "./store.js";
import { countItems, getLaunchPlan, runningRegistry, isPidAlive, refreshWorkspaceStatus, launchStatus } from "./launcher.js";
import { openModal, confirmDialog, toast, textInput, numberInput, selectInput, fieldRow, checkRow } from "./dialogs.js";

const TABS = ["overview", "applications", "websites", "files", "commands", "notes", "profiles", "advanced"];

export function detailView(container, ws, cbs) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "detail";
  // header
  const head = document.createElement("div");
  head.className = "detail-head";
  head.style.setProperty("--accent", ws.accent || "#4d7cfe");
  head.innerHTML = `
    <button class="icon-btn back" aria-label="Back">${icon("chevR", 18)}</button>
    <span class="ws-icon lg">${icon(ws.icon || "grid", 22)}</span>
    <div class="detail-titles"><h1></h1><p class="muted"></p></div>
    <div class="detail-head-actions">
      <button class="btn ghost sm fav-btn"></button>
      <button class="btn primary launch-btn"></button>
    </div>`;
  // RTL: back arrow should point correctly
  if (document.documentElement.dir !== "rtl") head.querySelector(".back").innerHTML = icon("chevR", 18);
  else head.querySelector(".back").innerHTML = icon("chevR", 18);
  head.querySelector("h1").textContent = ws.name || t("common.unnamed");
  head.querySelector("p").textContent = ws.description || `${countItems(ws)} ${t("home.items")}`;
  head.querySelector(".back").addEventListener("click", () => cbs.onBack?.());
  const favBtn = head.querySelector(".fav-btn");
  const paintFav = () => { favBtn.textContent = ws.favorite ? t("card.unfavorite") : t("card.favorite"); };
  paintFav();
  favBtn.addEventListener("click", async () => { ws.favorite = !ws.favorite; await saveWorkspace(ws); paintFav(); cbs.onChanged?.(false); });
  const launchBtn = head.querySelector(".launch-btn");
  launchBtn.textContent = t("editor.launch");
  launchBtn.addEventListener("click", () => cbs.onLaunch?.(ws));
  wrap.appendChild(head);

  // tabs
  const tabsEl = document.createElement("div");
  tabsEl.className = "tabs";
  tabsEl.setAttribute("role", "tablist");
  let active = cbs.initialTab || "overview";
  const body = document.createElement("div");
  body.className = "tab-body";
  function paintTabs() {
    tabsEl.innerHTML = "";
    for (const key of TABS) {
      const b = document.createElement("button");
      b.className = `tab ${key === active ? "on" : ""}`;
      b.setAttribute("role", "tab");
      b.textContent = t(`editor.${key === "files" ? "files" : key}`);
      b.addEventListener("click", () => { active = key; paintTabs(); paintBody(); });
      tabsEl.appendChild(b);
    }
  }
  async function persist(silent = true) {
    await saveWorkspace(ws);
    head.querySelector("h1").textContent = ws.name || t("common.unnamed");
    head.querySelector("p").textContent = ws.description || `${countItems(ws)} ${t("home.items")}`;
    head.style.setProperty("--accent", ws.accent || "#4d7cfe");
    head.querySelector(".ws-icon").innerHTML = icon(ws.icon || "grid", 22);
    if (!silent) toast(t("settings.saved"), "success");
    cbs.onChanged?.(false);
  }
  function paintBody() {
    body.innerHTML = "";
    if (active === "overview") tabOverview(body, ws, { persist, launch: () => cbs.onLaunch?.(ws), stop: () => cbs.onStop?.(ws), openTab: (k) => { active = k; paintTabs(); paintBody(); } });
    else if (active === "applications") tabApps(body, ws, persist);
    else if (active === "websites") tabWebsites(body, ws, persist);
    else if (active === "files") tabFiles(body, ws, persist);
    else if (active === "commands") tabCommands(body, ws, persist);
    else if (active === "notes") tabNotes(body, ws, persist);
    else if (active === "profiles") tabProfiles(body, ws, persist);
    else if (active === "advanced") tabAdvanced(body, ws, { persist, onExport: () => cbs.onExport?.(ws), onDeleted: () => cbs.onBack?.() });
  }
  paintTabs(); paintBody();
  wrap.append(tabsEl, body);
  container.appendChild(wrap);
}

// ---------- overview ----------
function tabOverview(body, ws, { persist, launch, stop, openTab }) {
  const grid = document.createElement("div");
  grid.className = "ov-grid";
  const info = document.createElement("section");
  info.className = "panel";
  info.innerHTML = `<h3></h3>`;
  info.querySelector("h3").textContent = t("editor.overview");
  const rows = [
    [t("editor.description"), ws.description || "—"],
    [t("home.items"), String(countItems(ws))],
    [t("home.lastLaunched"), ws.lastLaunchedAt ? fmtDateTime(ws.lastLaunchedAt) : t("home.never")],
  ];
  for (const [k, v] of rows) {
    const r = document.createElement("div");
    r.className = "kv";
    r.innerHTML = `<span class="k"></span><span class="v"></span>`;
    r.querySelector(".k").textContent = k;
    r.querySelector(".v").textContent = v;
    info.appendChild(r);
  }
  // general editable fields
  const nameI = textInput(ws.name, t("editor.name"));
  const descI = textInput(ws.description || "", t("editor.description"));
  const groupI = textInput(ws.group || "", t("editor.groupPlaceholder"));
  const folderI = textInput(ws.workspaceFolder || "", "C:\\Projects\\MyProject");
  info.append(
    fieldRow({ label: t("editor.name"), input: nameI }),
    fieldRow({ label: t("editor.description"), input: descI }),
    fieldRow({ label: t("editor.group"), input: groupI }),
    fieldRow({ label: t("editor.workspaceFolder"), hint: t("editor.workspaceFolderHint"), input: folderI }),
  );
  const iconBtn = document.createElement("button");
  iconBtn.className = "btn sm";
  iconBtn.innerHTML = `${icon("image", 15)}<span>${t("editor.icon")}: ${ws.icon || "grid"}</span>`;
  iconBtn.addEventListener("click", () => iconPicker(ws, async () => { await persist(); paintIcon(); }));
  const paintIcon = () => { iconBtn.lastChild.textContent = `${t("editor.icon")}: ${ws.icon || "grid"}`; };
  const accentRow = document.createElement("div");
  accentRow.className = "accents";
  for (const a of ACCENTS) {
    const b = document.createElement("button");
    b.className = `accent-dot ${ws.accent === a.value ? "on" : ""}`;
    b.style.background = a.value;
    b.title = a.name;
    b.setAttribute("aria-label", a.name);
    b.addEventListener("click", async () => {
      ws.accent = a.value;
      accentRow.querySelectorAll(".accent-dot").forEach((d) => d.classList.remove("on"));
      b.classList.add("on");
      await persist();
    });
    accentRow.appendChild(b);
  }
  info.append(fieldRow({ label: t("editor.icon"), input: iconBtn }));
  info.append(fieldRow({ label: t("editor.accent"), input: accentRow }));
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn primary";
  saveBtn.textContent = t("editor.save");
  saveBtn.addEventListener("click", async () => {
    ws.name = nameI.value.trim() || ws.name;
    ws.description = descI.value.trim();
    ws.group = groupI.value.trim();
    ws.workspaceFolder = folderI.value.trim();
    await persist();
  });
  info.appendChild(saveBtn);
  grid.appendChild(info);

  // quick sections summary
  const secs = document.createElement("section");
  secs.className = "panel";
  secs.innerHTML = `<h3>${t("editor.general")}</h3>`;
  const defs = [
    ["applications", ws.apps.length, "terminal"],
    ["websites", ws.websites.length, "globe"],
    ["files", ws.files.length, "folder"],
    ["commands", ws.commands.length, "code"],
  ];
  for (const [key, n, ic] of defs) {
    const b = document.createElement("button");
    b.className = "sec-row";
    b.innerHTML = `${icon(ic, 17)}<span class="sec-name"></span><em></em><span class="go">${icon("chevR", 15)}</span>`;
    b.querySelector(".sec-name").textContent = t(`editor.${key}`);
    b.querySelector("em").textContent = String(n);
    b.addEventListener("click", () => openTab(key));
    secs.appendChild(b);
  }
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const lb = document.createElement("button");
  lb.className = "btn primary";
  lb.textContent = t("editor.launch");
  lb.addEventListener("click", launch);
  const sb = document.createElement("button");
  sb.className = "btn";
  sb.textContent = t("editor.stop");
  sb.addEventListener("click", stop);
  actions.append(lb, sb);
  secs.appendChild(actions);
  grid.appendChild(secs);

  // running
  const run = document.createElement("section");
  run.className = "panel";
  run.innerHTML = `<h3>${t("nav.running")}</h3><div class="run-list"></div>`;
  paintRunning(run.querySelector(".run-list"), ws);
  grid.appendChild(run);
  body.appendChild(grid);
}

async function paintRunning(el, ws) {
  el.innerHTML = "";
  const entries = runningRegistry.get(ws.id) || [];
  if (!entries.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = t("stop.none");
    el.appendChild(p);
    return;
  }
  for (const e of entries) {
    const alive = await isPidAlive(e.pid);
    const row = document.createElement("div");
    row.className = "run-row";
    row.innerHTML = `${icon(alive ? "check" : "x", 15)}<span></span><em>PID ${e.pid}</em>`;
    row.querySelector("span").textContent = e.label;
    row.classList.toggle("dead", !alive);
    el.appendChild(row);
  }
}

// ---------- reorder helper ----------
function makeSortable(listEl, items, onOrder) {
  let dragId = null;
  listEl.querySelectorAll("[data-id]").forEach((row) => {
    const handle = row.querySelector(".grip");
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      dragId = row.dataset.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const after = [...listEl.querySelectorAll("[data-id]")].find((r) => {
        if (r.dataset.id === dragId) return false;
        const rect = r.getBoundingClientRect();
        return e.clientY < rect.top + rect.height / 2;
      });
      const cur = listEl.querySelector(`[data-id="${dragId}"]`);
      if (cur) listEl.insertBefore(cur, after || null);
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const order = [...listEl.querySelectorAll("[data-id]")].map((r) => r.dataset.id);
      onOrder(order);
    });
  });
}

// ---------- applications ----------
function tabApps(body, ws, persist) {
  const bar = document.createElement("div");
  bar.className = "tab-bar";
  bar.innerHTML = `<span class="muted"></span>`;
  bar.querySelector("span").textContent = t("editor.reorderHint");
  const add = document.createElement("button");
  add.className = "btn primary sm";
  add.innerHTML = `${icon("plus", 15)}<span>${t("editor.add")} · ${t("editor.addApp")}</span>`;
  add.addEventListener("click", () => appDialog(ws, null, persist, () => paint()));
  bar.appendChild(add);
  body.appendChild(bar);
  const list = document.createElement("div");
  list.className = "item-list";
  body.appendChild(list);
  async function paint() {
    list.innerHTML = "";
    const apps = [...ws.apps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!apps.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = t("editor.noApps");
      list.appendChild(p);
      return;
    }
    for (const a of apps) {
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.id = a.id;
      row.innerHTML = `
        <span class="grip" title="Drag">${icon("grip", 16)}</span>
        <span class="order"></span>
        <div class="item-main"><strong></strong><small></small></div>
        <span class="pill"></span>
        <button class="icon-btn edit" aria-label="Edit">${icon("edit", 16)}</button>
        <button class="icon-btn del" aria-label="Delete">${icon("trash", 16)}</button>`;
      row.querySelector(".order").textContent = String((a.order ?? 0) + 1);
      row.querySelector("strong").textContent = a.name || a.path || t("common.unnamed");
      row.querySelector("small").textContent = [a.path, a.args ? `args: ${a.args}` : "", a.cwd || ""].filter(Boolean).join("  ·  ");
      const pill = row.querySelector(".pill");
      pill.textContent = `${a.delaySec || 0}${t("editor.seconds")} · ${a.minimized ? t("editor.minimized") : t("editor.normal")}`;
      row.querySelector(".edit").addEventListener("click", () => appDialog(ws, a, persist, paint));
      row.querySelector(".del").addEventListener("click", async () => {
        // Removing from workspace must NOT uninstall — config only (dialog text handled at workspace delete; here simple confirm)
        const ok = state.settings.confirmBeforeDelete
          ? await confirmDialog({ title: a.name || "Application", message: t("dialogs.removeFromWs"), danger: false, confirmLabel: t("dialogs.remove") })
          : true;
        if (!ok) return;
        ws.apps = ws.apps.filter((x) => x.id !== a.id);
        await persist();
        paint();
      });
      list.appendChild(row);
    }
    makeSortable(list, apps, async (order) => {
      order.forEach((id, i) => { const it = ws.apps.find((x) => x.id === id); if (it) it.order = i; });
      await persist();
      paint();
    });
  }
  paint();
}

function appDialog(ws, existing, persist, repaint) {
  const a = existing ? { ...existing, window: { ...(existing.window || {}) } } : { ...blankApp(), order: ws.apps.length };
  const nameI = textInput(a.name, "Visual Studio Code");
  const pathI = textInput(a.path, "C:\\…\\app.exe");
  const argsI = textInput(a.args || "", '"C:\\Projects\\OpenWorkspace"');
  const cwdI = textInput(a.cwd || "", "C:\\Projects\\OpenWorkspace");
  const delayI = numberInput(a.delaySec || 0);
  const shellOpts = [{ value: false, label: t("editor.normal") }, { value: true, label: t("editor.minimized") }];
  // selectInput expects string values; handle boolean via custom select
  const minSel = document.createElement("select");
  minSel.className = "input";
  for (const label of [t("editor.normal"), t("editor.minimized")]) {
    const op = document.createElement("option");
    op.textContent = label;
    minSel.appendChild(op);
  }
  minSel.selectedIndex = a.minimized ? 1 : 0;
  const monOpts = state.monitors.map((m, i) => ({ value: String(i), label: m.label || `Display ${i + 1}` }));
  const monSel = selectInput(monOpts.length ? monOpts : [{ value: "0", label: t("editor.primaryDisplay") }], String(a.window?.monitor ?? 0));
  const { lab: maxLab, c: maxC } = checkRow("Maximized", !!a.window?.maximized);

  const body = document.createElement("div");
  body.append(
    fieldRow({ label: `${t("editor.addApp")} *`, input: nameI }),
    fieldRow({ label: "Application path (.exe / .lnk)", input: pathI }),
  );
  const browseRow = document.createElement("div");
  browseRow.className = "btn-row";
  const browseBtn = document.createElement("button");
  browseBtn.className = "btn sm";
  browseBtn.textContent = t("dialogs.browse");
  browseBtn.addEventListener("click", async () => {
    if (!env.isTauri) return;
    try {
      const f = await tauri("pick_app_file");
      if (typeof f === "string" && f) { pathI.value = f; if (!nameI.value) nameI.value = f.split(/[/\\]/).pop().replace(/\.(exe|lnk)$/i, ""); }
    } catch {}
  });
  const installedBtn = document.createElement("button");
  installedBtn.className = "btn sm";
  installedBtn.textContent = t("dialogs.pickInstalled");
  installedBtn.addEventListener("click", async () => installedPicker((p, n) => {
    pathI.value = p;
    if (!nameI.value.trim()) nameI.value = n;
  }));
  browseRow.append(browseBtn, installedBtn);
  body.appendChild(browseRow);
  body.append(
    fieldRow({ label: t("editor.args"), input: argsI }),
    fieldRow({ label: t("editor.cwd"), input: cwdI }),
    fieldRow({ label: `${t("editor.delay")} (${t("editor.seconds")})`, input: delayI }),
    fieldRow({ label: t("editor.behavior"), input: minSel }),
    fieldRow({ label: t("editor.monitor"), input: monSel }),
  );
  body.appendChild(maxLab);
  const warn = document.createElement("p");
  warn.className = "muted";
  warn.textContent = t("dialogs.commandWarn").replace("Commands", "Applications");
  openModal({
    title: existing ? t("dialogs.edit") : `${t("editor.add")} · ${t("editor.addApp")}`,
    body, wide: true,
    actions: [
      { id: "cancel", label: t("dialogs.cancel") },
      {
        id: "save", label: t("dialogs.save"), kind: "primary",
        onClick: async () => {
          if (!pathI.value.trim()) { pathI.classList.add("invalid"); pathI.focus(); return false; }
          Object.assign(a, {
            name: nameI.value.trim() || pathI.value.split(/[/\\]/).pop(),
            path: pathI.value.trim(), args: argsI.value, cwd: cwdI.value.trim(),
            delaySec: Math.max(0, parseInt(delayI.value || "0", 10) || 0),
            minimized: minSel.selectedIndex === 1,
            window: { monitor: parseInt(monSel.value || "0", 10) || 0, maximized: maxC.checked },
          });
          if (existing) {
            const i = ws.apps.findIndex((x) => x.id === existing.id);
            ws.apps[i] = a;
          } else ws.apps.push(a);
          ws.apps.forEach((x, i) => { if (x.order == null) x.order = i; });
          await persist();
          repaint?.();
        },
      },
    ],
  });
}

async function installedPicker(cb) {
  let apps = [];
  if (env.isTauri) {
    try { apps = await tauri("list_start_menu_apps", { limit: 80 }); } catch { apps = []; }
  }
  const body = document.createElement("div");
  const searchI = textInput("", t("search.label"));
  const list = document.createElement("div");
  list.className = "pick-list";
  body.append(searchI, list);
  function paint(f = "") {
    list.innerHTML = "";
    const items = apps.filter((a) => a.name.toLowerCase().includes(f.toLowerCase())).slice(0, 40);
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = t("search.noResults");
      list.appendChild(p);
      return;
    }
    for (const a of items) {
      const b = document.createElement("button");
      b.className = "pick-row";
      b.innerHTML = `${icon("terminal", 15)}<span></span>`;
      b.lastChild.textContent = a.name;
      b.title = a.path;
      b.addEventListener("click", () => { cb(a.path, a.name); document.querySelector(".modal-overlay:last-child .modal-x")?.click(); });
      list.appendChild(b);
    }
  }
  searchI.addEventListener("input", () => paint(searchI.value));
  paint();
  openModal({ title: t("dialogs.pickInstalled"), body, actions: [{ id: "x", label: t("dialogs.close") }] });
}

// ---------- websites ----------
function tabWebsites(body, ws, persist) {
  const bar = document.createElement("div");
  bar.className = "tab-bar";
  const add = document.createElement("button");
  add.className = "btn primary sm";
  add.innerHTML = `${icon("plus", 15)}<span>${t("editor.add")} · ${t("editor.addWebsite")}</span>`;
  add.addEventListener("click", () => websiteDialog(ws, null, persist, paint));
  bar.append(add);
  body.appendChild(bar);
  const list = document.createElement("div");
  list.className = "item-list";
  body.appendChild(list);
  function paint() {
    list.innerHTML = "";
    const items = [...ws.websites].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "muted"; p.textContent = t("editor.noWebsites");
      list.appendChild(p); return;
    }
    for (const w of items) {
      const row = document.createElement("div");
      row.className = "item-row"; row.dataset.id = w.id;
      row.innerHTML = `<span class="grip">${icon("grip", 16)}</span><span class="order"></span>
        <div class="item-main"><strong></strong><small></small></div><span class="pill"></span>
        <button class="icon-btn edit">${icon("edit", 16)}</button>
        <button class="icon-btn del">${icon("trash", 16)}</button>`;
      row.querySelector(".order").textContent = String((w.order ?? 0) + 1);
      row.querySelector("strong").textContent = w.name || w.url;
      row.querySelector("small").textContent = w.url;
      row.querySelector(".pill").textContent = browserLabel(w.browser);
      row.querySelector(".edit").addEventListener("click", () => websiteDialog(ws, w, persist, paint));
      row.querySelector(".del").addEventListener("click", async () => {
        ws.websites = ws.websites.filter((x) => x.id !== w.id);
        await persist(); paint();
      });
      list.appendChild(row);
    }
    makeSortable(list, items, async (order) => {
      order.forEach((id, i) => { const it = ws.websites.find((x) => x.id === id); if (it) it.order = i; });
      await persist(); paint();
    });
  }
  paint();
}

function browserLabel(b) {
  if (b === "edge") return "Microsoft Edge";
  if (b === "chrome") return "Google Chrome";
  if (b === "firefox") return "Firefox";
  if (b === "default" || !b) return "Default Browser";
  return "Custom";
}

function websiteDialog(ws, existing, persist, repaint) {
  const w = existing ? { ...existing } : { ...blankWebsite(), order: ws.websites.length };
  const nameI = textInput(w.name, "GitHub");
  const urlI = textInput(w.url, "https://github.com");
  const opts = [
    { value: "default", label: "Default Browser" },
    { value: "edge", label: "Microsoft Edge" },
    { value: "chrome", label: "Google Chrome" },
    { value: "firefox", label: "Firefox" },
    { value: "custom", label: "Custom…" },
  ];
  const bSel = selectInput(opts, ["default", "edge", "chrome", "firefox"].includes(w.browser) ? w.browser : (w.browser && w.browser !== "default" ? "custom" : "default"));
  const customI = textInput(["default", "edge", "chrome", "firefox", ""].includes(w.browser) ? "" : (w.browser || ""), "C:\\…\\browser.exe");
  const body = document.createElement("div");
  body.append(fieldRow({ label: t("editor.addWebsite"), input: nameI }), fieldRow({ label: `${t("editor.url")} *`, input: urlI }), fieldRow({ label: t("editor.browser"), input: bSel }), fieldRow({ label: "Custom browser path", input: customI }));
  openModal({
    title: existing ? t("dialogs.edit") : `${t("editor.add")} · ${t("editor.addWebsite")}`,
    body,
    actions: [
      { id: "cancel", label: t("dialogs.cancel") },
      {
        id: "save", label: t("dialogs.save"), kind: "primary",
        onClick: async () => {
          let url = urlI.value.trim();
          if (!url) { urlI.classList.add("invalid"); urlI.focus(); return false; }
          if (!url.includes("://")) url = "https://" + url;
          try { new URL(url); } catch { urlI.classList.add("invalid"); urlI.focus(); return false; }
          const browser = bSel.value === "custom" ? customI.value.trim() : bSel.value;
          Object.assign(w, { name: nameI.value.trim() || url, url, browser: browser || "default" });
          if (existing) ws.websites[ws.websites.findIndex((x) => x.id === existing.id)] = w;
          else ws.websites.push(w);
          await persist(); repaint?.();
        },
      },
    ],
  });
}

// ---------- files ----------
function tabFiles(body, ws, persist) {
  const bar = document.createElement("div");
  bar.className = "tab-bar";
  const addF = document.createElement("button");
  addF.className = "btn sm";
  addF.innerHTML = `${icon("plus", 14)}<span>${t("editor.addFile")}</span>`;
  addF.addEventListener("click", () => fileDialog(ws, "file", null, persist, paint));
  const addD = document.createElement("button");
  addD.className = "btn primary sm";
  addD.innerHTML = `${icon("plus", 14)}<span>${t("editor.addFolder")}</span>`;
  addD.addEventListener("click", () => fileDialog(ws, "folder", null, persist, paint));
  bar.append(addF, addD);
  body.appendChild(bar);
  const list = document.createElement("div");
  list.className = "item-list";
  body.appendChild(list);
  function paint() {
    list.innerHTML = "";
    const items = [...ws.files].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "muted"; p.textContent = t("editor.noFiles");
      list.appendChild(p); return;
    }
    for (const f of items) {
      const row = document.createElement("div");
      row.className = "item-row"; row.dataset.id = f.id;
      row.innerHTML = `<span class="grip">${icon("grip", 16)}</span><span class="order"></span>
        <div class="item-main"><strong></strong><small></small></div>
        <button class="icon-btn reveal" title="Reveal in Explorer">${icon("folder", 16)}</button>
        <button class="icon-btn edit">${icon("edit", 16)}</button>
        <button class="icon-btn del">${icon("trash", 16)}</button>`;
      row.querySelector(".order").textContent = String((f.order ?? 0) + 1);
      row.querySelector("strong").textContent = f.name || f.path;
      row.querySelector("small").textContent = f.path;
      row.querySelector(".edit").addEventListener("click", () => fileDialog(ws, f.kind, f, persist, paint));
      row.querySelector(".reveal").addEventListener("click", async () => {
        if (!env.isTauri) return;
        try { await tauri("reveal_in_explorer", { raw: f.path, workspaceFolder: ws.workspaceFolder || "" }); }
        catch (e) { toast(typeof e === "string" ? e : t("errors.generic"), "error"); }
      });
      row.querySelector(".del").addEventListener("click", async () => {
        ws.files = ws.files.filter((x) => x.id !== f.id);
        await persist(); paint();
      });
      list.appendChild(row);
    }
    makeSortable(list, items, async (order) => {
      order.forEach((id, i) => { const it = ws.files.find((x) => x.id === id); if (it) it.order = i; });
      await persist(); paint();
    });
  }
  paint();
}

function fileDialog(ws, kind, existing, persist, repaint) {
  const f = existing ? { ...existing } : { ...blankFile(kind), order: ws.files.length };
  const nameI = textInput(f.name, kind === "folder" ? "Projects" : "Report.docx");
  const pathI = textInput(f.path, kind === "folder" ? "C:\\Projects\\OpenWorkspace" : "C:\\Documents\\Report.docx");
  const body = document.createElement("div");
  body.append(fieldRow({ label: t("editor.addFolder") === "" ? "" : (kind === "folder" ? t("editor.addFolder") : t("editor.addFile")), input: nameI }), fieldRow({ label: "Path *", input: pathI }));
  const browseBtn = document.createElement("button");
  browseBtn.className = "btn sm";
  browseBtn.textContent = t("dialogs.browse");
  browseBtn.addEventListener("click", async () => {
    if (!env.isTauri) return;
    try {
      const sel = await tauri("pick_generic_file", { directory: kind === "folder" });
      if (typeof sel === "string" && sel) { pathI.value = sel; if (!nameI.value) nameI.value = sel.split(/[/\\]/).pop(); }
    } catch {}
  });
  body.appendChild(browseBtn);
  openModal({
    title: existing ? t("dialogs.edit") : `${t("editor.add")} · ${kind === "folder" ? t("editor.addFolder") : t("editor.addFile")}`,
    body,
    actions: [
      { id: "cancel", label: t("dialogs.cancel") },
      {
        id: "save", label: t("dialogs.save"), kind: "primary",
        onClick: async () => {
          if (!pathI.value.trim()) { pathI.classList.add("invalid"); pathI.focus(); return false; }
          Object.assign(f, { name: nameI.value.trim() || pathI.value.split(/[/\\]/).pop(), path: pathI.value.trim(), kind });
          if (existing) ws.files[ws.files.findIndex((x) => x.id === existing.id)] = f;
          else ws.files.push(f);
          await persist(); repaint?.();
        },
      },
    ],
  });
}

// ---------- commands ----------
function tabCommands(body, ws, persist) {
  const warn = document.createElement("div");
  warn.className = "warn-box";
  warn.innerHTML = `${icon("alert", 16)}<span></span>`;
  warn.lastChild.textContent = t("dialogs.commandWarn");
  body.appendChild(warn);
  const bar = document.createElement("div");
  bar.className = "tab-bar";
  const add = document.createElement("button");
  add.className = "btn primary sm";
  add.innerHTML = `${icon("plus", 15)}<span>${t("editor.add")} · ${t("editor.addCommand")}</span>`;
  add.addEventListener("click", () => commandDialog(ws, null, persist, paint));
  bar.append(add);
  body.appendChild(bar);
  const list = document.createElement("div");
  list.className = "item-list";
  body.appendChild(list);
  function paint() {
    list.innerHTML = "";
    const items = [...ws.commands].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "muted"; p.textContent = t("editor.noCommands");
      list.appendChild(p); return;
    }
    for (const c of items) {
      const row = document.createElement("div");
      row.className = "item-row"; row.dataset.id = c.id;
      row.innerHTML = `<span class="grip">${icon("grip", 16)}</span><span class="order"></span>
        <div class="item-main"><strong></strong><small></small></div><span class="pill"></span>
        <button class="icon-btn edit">${icon("edit", 16)}</button>
        <button class="icon-btn del">${icon("trash", 16)}</button>`;
      row.querySelector(".order").textContent = String((c.order ?? 0) + 1);
      row.querySelector("strong").textContent = c.name || c.command;
      row.querySelector("small").textContent = `${c.shell || "powershell"}  ·  ${c.command}`;
      row.querySelector(".pill").textContent = c.behavior === "close" ? t("editor.close") : c.behavior === "minimized" ? t("editor.minimized") : t("editor.keepopen");
      row.querySelector(".edit").addEventListener("click", () => commandDialog(ws, c, persist, paint));
      row.querySelector(".del").addEventListener("click", async () => {
        ws.commands = ws.commands.filter((x) => x.id !== c.id);
        await persist(); paint();
      });
      list.appendChild(row);
    }
    makeSortable(list, items, async (order) => {
      order.forEach((id, i) => { const it = ws.commands.find((x) => x.id === id); if (it) it.order = i; });
      await persist(); paint();
    });
  }
  paint();
}

function commandDialog(ws, existing, persist, repaint) {
  const c = existing ? { ...existing } : { ...blankCommand(), order: ws.commands.length };
  const nameI = textInput(c.name, "Dev server");
  const cmdI = textInput(c.command, "npm run dev");
  const cwdI = textInput(c.cwd || "", "C:\\Projects\\OpenWorkspace");
  const shellSel = selectInput(
    [
      { value: "powershell", label: "PowerShell" },
      { value: "cmd", label: "Command Prompt" },
      { value: "windowsterminal", label: "Windows Terminal" },
    ], c.shell || "powershell");
  const behSel = selectInput(
    [
      { value: "keepopen", label: t("editor.keepopen") },
      { value: "close", label: t("editor.close") },
      { value: "minimized", label: t("editor.minimized") },
      { value: "normal", label: t("editor.normal") },
    ], c.behavior || "keepopen");
  const body = document.createElement("div");
  const warn = document.createElement("div");
  warn.className = "warn-box";
  warn.innerHTML = `${icon("alert", 15)}<span></span>`;
  warn.lastChild.textContent = t("dialogs.commandWarn");
  body.append(warn);
  body.append(fieldRow({ label: t("editor.addCommand"), input: nameI }), fieldRow({ label: `${t("editor.command")} *`, input: cmdI }), fieldRow({ label: t("editor.shell"), input: shellSel }), fieldRow({ label: t("editor.cwd"), input: cwdI }), fieldRow({ label: t("editor.behavior"), input: behSel }));
  openModal({
    title: existing ? t("dialogs.edit") : `${t("editor.add")} · ${t("editor.addCommand")}`,
    body, wide: true,
    actions: [
      { id: "cancel", label: t("dialogs.cancel") },
      {
        id: "save", label: t("dialogs.save"), kind: "primary",
        onClick: async () => {
          if (!cmdI.value.trim()) { cmdI.classList.add("invalid"); cmdI.focus(); return false; }
          Object.assign(c, { name: nameI.value.trim() || cmdI.value.trim().slice(0, 40), command: cmdI.value.trim(), shell: shellSel.value, cwd: cwdI.value.trim(), behavior: behSel.value });
          if (existing) ws.commands[ws.commands.findIndex((x) => x.id === existing.id)] = c;
          else ws.commands.push(c);
          await persist(); repaint?.();
        },
      },
    ],
  });
}

// ---------- notes ----------
function tabNotes(body, ws, persist) {
  const ta = document.createElement("textarea");
  ta.className = "input notes";
  ta.placeholder = t("editor.notesPlaceholder");
  ta.value = ws.notes || "";
  body.appendChild(ta);
  const save = document.createElement("button");
  save.className = "btn primary";
  save.textContent = t("editor.save");
  save.addEventListener("click", async () => { ws.notes = ta.value; await persist(); });
  body.appendChild(save);
}

// ---------- profiles ----------
function tabProfiles(body, ws, persist) {
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = t("editor.profileHint");
  body.appendChild(hint);
  const list = document.createElement("div");
  list.className = "item-list";
  body.appendChild(list);
  const add = document.createElement("button");
  add.className = "btn sm";
  add.textContent = `+ ${t("editor.newProfile")}`;
  add.addEventListener("click", async () => {
    const name = `Profile ${(ws.profiles?.length || 0) + 1}`;
    ws.profiles.push({ id: uid(), name, appIds: [], websiteIds: [], fileIds: [], commandIds: [] });
    await persist(); paint();
  });
  body.appendChild(add);
  function paint() {
    list.innerHTML = "";
    const full = document.createElement("div");
    full.className = "item-row static";
    full.innerHTML = `${icon("zap", 16)}<div class="item-main"><strong>${t("editor.fullSet")}</strong></div>`;
    list.appendChild(full);
    for (const p of ws.profiles || []) {
      const row = document.createElement("div");
      row.className = "profile-card";
      row.innerHTML = `<div class="profile-head"><strong></strong><div><button class="btn sm launch-p"></button> <button class="icon-btn del">${icon("trash", 15)}</button></div></div><div class="profile-grid"></div>`;
      row.querySelector("strong").textContent = p.name;
      const lp = row.querySelector(".launch-p");
      lp.textContent = t("card.launch");
      const grid = row.querySelector(".profile-grid");
      const groups = [
        ["apps", ws.apps, p.appIds],
        ["websites", ws.websites, p.websiteIds],
        ["files", ws.files, p.fileIds],
        ["commands", ws.commands, p.commandIds],
      ];
      for (const [key, all, sel] of groups) {
        const col = document.createElement("div");
        col.className = "profile-col";
        col.innerHTML = `<h4></h4>`;
        col.querySelector("h4").textContent = t(`editor.${key === "files" ? "files" : key}`);
        const set = new Set(sel || []);
        const hasSel = (sel || []).length > 0;
        for (const it of all || []) {
          const { lab, c } = checkRow(it.name || it.path || it.url || it.command || "?", hasSel ? set.has(it.id) : true);
          c.dataset.pid = p.id; c.dataset.kind = key; c.dataset.iid = it.id;
          c.addEventListener("change", async () => {
            const arr = key === "apps" ? p.appIds : key === "websites" ? p.websiteIds : key === "files" ? p.fileIds : p.commandIds;
            const idx = arr.indexOf(it.id);
            if (c.checked && idx < 0) arr.push(it.id);
            if (!c.checked && idx >= 0) arr.splice(idx, 1);
            await persist();
          });
          col.appendChild(lab);
        }
        if (!(all || []).length) {
          const e = document.createElement("p");
          e.className = "muted"; e.textContent = "—";
          col.appendChild(e);
        }
        grid.appendChild(col);
      }
      const nameRow = document.createElement("div");
      nameRow.className = "row-actions";
      const nameI = textInput(p.name, t("editor.profileName"));
      nameI.addEventListener("change", async () => { p.name = nameI.value.trim() || p.name; await persist(); paint(); });
      nameRow.appendChild(nameI);
      row.appendChild(nameRow);
      row.querySelector(".del").addEventListener("click", async () => {
        ws.profiles = ws.profiles.filter((x) => x.id !== p.id);
        await persist(); paint();
      });
      list.appendChild(row);
    }
  }
  paint();
}

// ---------- advanced ----------
function tabAdvanced(body, ws, { persist, onExport, onDeleted }) {
  const envTa = document.createElement("textarea");
  envTa.className = "input mono";
  envTa.rows = 4;
  envTa.value = Object.entries(ws.env || {}).map(([k, v]) => `${k}=${v}`).join("\n");
  envTa.placeholder = "NODE_ENV=development";
  body.append(fieldRow({ label: t("editor.envVars"), hint: t("editor.envHint"), input: envTa }));
  const { lab: restoreLab, c: restoreC } = checkRow(t("editor.restoreLayout"), !!ws.restoreLayout);
  restoreLab.title = t("editor.restoreLayoutHint");
  const { lab: startLab, c: startC } = checkRow(t("editor.startupLaunch"), !!ws.startupLaunch);
  body.append(restoreLab, startLab);
  const save = document.createElement("button");
  save.className = "btn primary";
  save.textContent = t("editor.save");
  save.addEventListener("click", async () => {
    const envObj = {};
    for (const line of envTa.value.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) {
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1);
        if (k) envObj[k] = v;
      }
    }
    ws.env = envObj;
    ws.restoreLayout = restoreC.checked;
    ws.startupLaunch = startC.checked;
    await persist();
  });
  body.appendChild(save);

  // snapshots
  const snapH = document.createElement("h3");
  snapH.textContent = t("editor.snapshots");
  body.appendChild(snapH);
  const snapList = document.createElement("div");
  snapList.className = "item-list";
  body.appendChild(snapList);
  const take = document.createElement("button");
  take.className = "btn sm";
  take.innerHTML = `${icon("camera", 15)}<span>${t("editor.takeSnapshot")}</span>`;
  take.addEventListener("click", async () => {
    const entries = runningRegistry.get(ws.id) || [];
    ws.snapshots.unshift({ id: uid(), at: nowIso(), label: `${ws.name} - ${new Date().toLocaleString()}`, apps: entries.map((e) => ({ label: e.label, kind: e.kind })), counts: { apps: ws.apps.length, websites: ws.websites.length, files: ws.files.length, commands: ws.commands.length } });
    ws.snapshots = ws.snapshots.slice(0, 20);
    await persist(); paintSnaps();
  });
  body.appendChild(take);
  function paintSnaps() {
    snapList.innerHTML = "";
    if (!ws.snapshots?.length) {
      const p = document.createElement("p");
      p.className = "muted"; p.textContent = t("editor.noSnapshots");
      snapList.appendChild(p); return;
    }
    for (const s of ws.snapshots) {
      const row = document.createElement("div");
      row.className = "item-row static";
      row.innerHTML = `${icon("camera", 15)}<div class="item-main"><strong></strong><small></small></div><button class="icon-btn del">${icon("trash", 14)}</button>`;
      row.querySelector("strong").textContent = s.label;
      row.querySelector("small").textContent = `${s.counts?.apps || 0} apps · ${s.counts?.websites || 0} websites · ${fmtDateTime(s.at)}`;
      row.querySelector(".del").addEventListener("click", async () => {
        ws.snapshots = ws.snapshots.filter((x) => x.id !== s.id);
        await persist(); paintSnaps();
      });
      snapList.appendChild(row);
    }
  }
  paintSnaps();

  // danger zone
  const dz = document.createElement("div");
  dz.className = "danger-zone";
  const exp = document.createElement("button");
  exp.className = "btn sm";
  exp.innerHTML = `${icon("download", 14)}<span>${t("card.export")}</span>`;
  exp.addEventListener("click", onExport);
  const dup = document.createElement("button");
  dup.className = "btn sm";
  dup.textContent = t("card.duplicate");
  dup.addEventListener("click", async () => {
    const { duplicateWorkspace } = await import("./store.js");
    await duplicateWorkspace(ws.id);
    toast(t("dialogs.dupDone"), "success");
  });
  const del = document.createElement("button");
  del.className = "btn danger sm";
  del.textContent = t("card.delete");
  del.addEventListener("click", async () => {
    const { deleteWorkspace } = await import("./store.js");
    const ok = state.settings.confirmBeforeDelete
      ? await confirmDialog({ title: t("dialogs.deleteWs", { name: ws.name }), message: t("dialogs.deleteWsDesc"), danger: true, confirmLabel: t("dialogs.delete") })
      : true;
    if (!ok) return;
    await deleteWorkspace(ws.id);
    onDeleted?.();
  });
  dz.append(exp, dup, del);
  body.appendChild(dz);
}

// ---------- icon picker ----------
export function iconPicker(ws, onPick) {
  const body = document.createElement("div");
  body.className = "icon-picker";
  for (const [cat, keys] of Object.entries(WORKSPACE_ICONS)) {
    const h = document.createElement("h4");
    h.textContent = cat;
    body.appendChild(h);
    const row = document.createElement("div");
    row.className = "icon-grid";
    for (const k of keys) {
      const b = document.createElement("button");
      b.className = `icon-opt ${ws.icon === k ? "on" : ""}`;
      b.innerHTML = icon(k, 20);
      b.title = k;
      b.setAttribute("aria-label", k);
      b.addEventListener("click", () => {
        ws.icon = k; ws.customIcon = null;
        body.querySelectorAll(".icon-opt").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        onPick?.();
      });
      row.appendChild(b);
    }
    body.appendChild(row);
  }
  const customBtn = document.createElement("button");
  customBtn.className = "btn sm";
  customBtn.textContent = t("dialogs.customImage");
  customBtn.addEventListener("click", async () => {
    if (!env.isTauri) return;
    try {
      const f = await tauri("pick_generic_file", { directory: false, extensions: ["png", "jpg", "jpeg", "ico", "svg"] });
      if (typeof f === "string" && f) {
        if (!/\.(png|jpe?g|ico|svg)$/i.test(f)) { toast(t("dialogs.customImage") + ": invalid file", "error"); return; }
        ws.customIcon = f;
        onPick?.();
      }
    } catch {}
  });
  body.appendChild(customBtn);
  openModal({ title: t("dialogs.selectIcon"), body, wide: true, actions: [{ id: "ok", label: t("dialogs.close"), kind: "primary" }] });
}
