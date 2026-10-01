// Settings page: all sections from spec.
import { icon } from "./icons.js";
import { t, getLang, loadLocale } from "./i18n.js";
import { state, persistSettings, persistShortcuts, persistHistory, tauri, env } from "./store.js";
import { openModal, confirmDialog, toast, textInput, selectInput, fieldRow, checkRow } from "./dialogs.js";

const SECTIONS = ["appearance", "language", "general", "launching", "shortcuts", "tray", "notifications", "startup", "data", "privacy", "advanced", "about"];

export function settingsView(container, cbs) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "settings";
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `<div><h1></h1></div>`;
  head.querySelector("h1").textContent = t("settings.title");
  wrap.appendChild(head);
  const cols = document.createElement("div");
  cols.className = "settings-cols";
  const nav = document.createElement("nav");
  nav.className = "settings-nav";
  const body = document.createElement("div");
  body.className = "settings-body panel";
  let active = "appearance";
  function paint() {
    nav.innerHTML = "";
    for (const s of SECTIONS) {
      const b = document.createElement("button");
      b.className = `set-nav-item ${s === active ? "on" : ""}`;
      b.textContent = t(`settings.${s === "data" ? "data" : s}`);
      b.addEventListener("click", () => { active = s; paint(); });
      nav.appendChild(b);
    }
    body.innerHTML = "";
    if (active === "appearance") secAppearance(body, cbs);
    else if (active === "language") secLanguage(body, cbs);
    else if (active === "general") secGeneral(body);
    else if (active === "launching") secLaunching(body);
    else if (active === "shortcuts") secShortcuts(body);
    else if (active === "tray") secTray(body);
    else if (active === "notifications") secNotifications(body);
    else if (active === "startup") secStartup(body);
    else if (active === "data") secData(body);
    else if (active === "privacy") secPrivacy(body);
    else if (active === "advanced") secAdvanced(body, cbs);
    else if (active === "about") secAbout(body);
  }
  paint();
  cols.append(nav, body);
  wrap.appendChild(cols);
  container.appendChild(wrap);
}

function themeSeg(current, onChange) {
  const seg = document.createElement("div");
  seg.className = "seg";
  for (const v of ["dark", "light", "system"]) {
    const b = document.createElement("button");
    b.className = `seg-btn ${current === v ? "on" : ""}`;
    b.textContent = t(`settings.${v}`);
    b.addEventListener("click", () => {
      seg.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      onChange(v);
    });
    seg.appendChild(b);
  }
  return seg;
}

function secAppearance(body, cbs) {
  body.append(fieldRow({ label: t("settings.theme"), input: themeSeg(state.settings.theme, async (v) => {
    state.settings.theme = v;
    await persistSettings();
    cbs.onTheme?.();
    toast(t("settings.saved"), "success");
  }) }));
}

function secLanguage(body, cbs) {
  const seg = document.createElement("div");
  seg.className = "seg";
  const cur = getLang();
  for (const [v, label] of [["en", t("settings.english")], ["ar", t("settings.arabic")]]) {
    const b = document.createElement("button");
    b.className = `seg-btn ${cur === v ? "on" : ""}`;
    b.textContent = label;
    b.addEventListener("click", async () => {
      state.settings.language = v;
      await persistSettings();
      await loadLocale(v);
      cbs.onLanguage?.();
    });
    seg.appendChild(b);
  }
  body.append(fieldRow({ label: t("settings.language"), input: seg }));
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "العربية — خط ثمانية، RTL كامل.";
  body.appendChild(note);
}

function secGeneral(body) {
  const items = [
    ["startMinimized", t("settings.startMinimized")],
    ["openLastWorkspace", t("settings.openLast")],
    ["rememberWindowSize", t("settings.rememberSize")],
    ["rememberWindowPosition", t("settings.rememberPos")],
    ["confirmBeforeDelete", t("settings.confirmDelete")],
    ["confirmBeforeStop", t("settings.confirmStop")],
  ];
  for (const [key, label] of items) {
    const { lab, c } = checkRow(label, !!state.settings[key]);
    c.addEventListener("change", async () => { state.settings[key] = c.checked; await persistSettings(); toast(t("settings.saved"), "success"); });
    body.appendChild(lab);
  }
}

function secLaunching(body) {
  const mode = selectInput(
    [{ value: "sequential", label: t("settings.sequential") }, { value: "simultaneous", label: t("settings.simultaneous") }],
    state.settings.launchMode);
  mode.addEventListener("change", async () => { state.settings.launchMode = mode.value; await persistSettings(); });
  body.append(fieldRow({ label: t("settings.launchMode"), input: mode }));
  const delay = document.createElement("input");
  delay.type = "number"; delay.className = "input"; delay.min = "0"; delay.max = "60";
  delay.value = String(state.settings.defaultDelay ?? 0);
  delay.addEventListener("change", async () => { state.settings.defaultDelay = Math.max(0, parseInt(delay.value || "0", 10) || 0); await persistSettings(); });
  body.append(fieldRow({ label: t("settings.defaultDelay"), input: delay }));
  for (const [key, label] of [["showLaunchProgress", t("settings.showProgress")], ["stopOnCriticalError", t("settings.stopOnError")]]) {
    const { lab, c } = checkRow(label, !!state.settings[key]);
    c.addEventListener("change", async () => { state.settings[key] = c.checked; await persistSettings(); });
    body.appendChild(lab);
  }
}

function shortcutField(label, key) {
  const inp = textInput(state.shortcuts[key] || "", "Ctrl+K");
  inp.readOnly = true;
  inp.className = "input shortcut";
  inp.addEventListener("click", () => {
    inp.value = "…";
    const handler = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { inp.value = state.shortcuts[key]; document.removeEventListener("keydown", handler, true); return; }
      const parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (!["Control", "Alt", "Shift"].includes(e.key)) parts.push(k);
      if (parts.length) {
        inp.value = parts.join("+");
        state.shortcuts[key] = inp.value;
        persistShortcuts();
      }
      document.removeEventListener("keydown", handler, true);
    };
    document.addEventListener("keydown", handler, true);
  });
  return fieldRow({ label, hint: t("settings.shortcutsHint"), input: inp });
}

function secShortcuts(body) {
  body.append(
    shortcutField("Search (Ctrl+K)", "search"),
    shortcutField("New Workspace (Ctrl+N)", "new"),
    shortcutField("Launch selected Workspace", "launch"),
  );
}

function secTray(body) {
  for (const [key, label] of [["trayEnabled", t("settings.trayEnabled")], ["closeToTray", t("settings.closeToTray")], ["trayQuickLaunch", t("settings.trayQuick")]]) {
    const { lab, c } = checkRow(label, !!state.settings[key]);
    c.addEventListener("change", async () => {
      state.settings[key] = c.checked;
      await persistSettings();
      if (env.isTauri) {
        try { await tauri("save_aux", { name: "ui", jsonText: JSON.stringify({ closeToTray: state.settings.closeToTray }) }); } catch {}
        if (key === "trayEnabled") {
          try { await tauri("set_tray_visible", { visible: c.checked }); } catch {}
        }
      }
      toast(t("settings.saved"), "success");
    });
    body.appendChild(lab);
  }
  const hot = textInput(state.settings.globalHotkey || "Ctrl+Alt+W", "Ctrl+Alt+W");
  hot.addEventListener("change", async () => {
    state.settings.globalHotkey = hot.value.trim() || "Ctrl+Alt+W";
    await persistSettings();
    document.dispatchEvent(new CustomEvent("ow:hotkey-change"));
  });
  body.append(fieldRow({ label: t("settings.globalHotkey"), input: hot }));
}

function secNotifications(body) {
  const { lab, c } = checkRow(t("settings.enableNotifications"), !!state.settings.notifications);
  c.addEventListener("change", async () => { state.settings.notifications = c.checked; await persistSettings(); });
  body.appendChild(lab);
}

function secStartup(body) {
  const { lab: aLab, c: aC } = checkRow(t("settings.startWithWindows"), !!state.settings.startWithWindows);
  aC.addEventListener("change", async () => {
    state.settings.startWithWindows = aC.checked;
    await persistSettings();
    if (env.isTauri) {
      try { await tauri("set_autostart", { enabled: aC.checked }); } catch {}
    }
    toast(t("settings.saved"), "success");
  });
  const { lab: mLab, c: mC } = checkRow(t("settings.startMinBoot"), !!state.settings.startMinimizedBoot);
  mC.addEventListener("change", async () => { state.settings.startMinimizedBoot = mC.checked; await persistSettings(); });
  const opts = [{ value: "", label: t("settings.none") }, ...state.workspaces.map((w) => ({ value: w.id, label: w.name }))];
  const sel = selectInput(opts, state.settings.launchOnStartupId || "");
  sel.addEventListener("change", async () => {
    const ws = state.workspaces.find((w) => w.id === sel.value);
    if (ws && (ws.apps?.length || 0) >= 5) {
      const ok = await confirmDialog({ title: ws.name, message: t("launch.confirmMany", { n: ws.apps.length }), confirmLabel: t("launch.enableAnyway") });
      if (!ok) { sel.value = state.settings.launchOnStartupId || ""; return; }
    }
    state.settings.launchOnStartupId = sel.value || null;
    await persistSettings();
  });
  body.append(aLab, mLab, fieldRow({ label: t("settings.launchOnStartup"), input: sel }));
}

function secData(body) {
  const loc = document.createElement("div");
  loc.className = "kv";
  loc.innerHTML = `<span class="k">${t("settings.dataLocation")}</span><span class="v mono"></span>`;
  loc.querySelector(".v").textContent = state.dataDir || "—";
  body.appendChild(loc);
  const openBtn = document.createElement("button");
  openBtn.className = "btn sm";
  openBtn.textContent = t("settings.openFolder");
  openBtn.addEventListener("click", async () => {
    if (env.isTauri) { try { await tauri("open_data_folder"); } catch (e) { toast(String(e), "error"); } }
  });
  body.appendChild(openBtn);
  const bBtn = document.createElement("button");
  bBtn.className = "btn sm";
  bBtn.innerHTML = `${icon("download", 14)}<span>${t("settings.backup")}</span>`;
  bBtn.addEventListener("click", async () => {
    if (!env.isTauri) { toast("Backup requires the desktop app.", "error"); return; }
    try {
      const dest = await tauri("pick_save_file", { defaultName: "openworkspace-backup.openworkspace-backup", ext: "openworkspace-backup" });
      if (dest) { await tauri("export_backup", { dest }); toast(t("dialogs.exportDone"), "success"); }
    } catch (e) { toast(typeof e === "string" ? e : t("errors.generic"), "error"); }
  });
  const rBtn = document.createElement("button");
  rBtn.className = "btn sm";
  rBtn.innerHTML = `${icon("upload", 14)}<span>${t("settings.restore")}</span>`;
  rBtn.addEventListener("click", () => document.dispatchEvent(new CustomEvent("ow:restore")));
  const p1 = document.createElement("p");
  p1.className = "muted"; p1.textContent = t("settings.backupDesc");
  const p2 = document.createElement("p");
  p2.className = "muted"; p2.textContent = t("settings.restoreDesc");
  body.append(p1, bBtn, p2, rBtn);
}

function secPrivacy(body) {
  for (const [key, label] of [["recentEnabled", t("settings.recentOn")], ["historyEnabled", t("settings.historyOn")]]) {
    const k = key === "recentEnabled" ? "recentEnabled" : "historyEnabled";
    const { lab, c } = checkRow(label, !!state.settings[k]);
    c.addEventListener("change", async () => { state.settings[k] = c.checked; await persistSettings(); });
    body.appendChild(lab);
  }
  const clear = document.createElement("button");
  clear.className = "btn sm";
  clear.textContent = t("settings.clearHistory");
  clear.addEventListener("click", async () => {
    state.history = { recentIds: [], launches: [], lastWorkspaceId: null };
    await persistHistory();
    toast(t("settings.cleared"), "success");
  });
  body.appendChild(clear);
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "Local-first. No telemetry by default. No external servers.";
  body.appendChild(note);
}

function secAdvanced(body, cbs) {
  const reset = document.createElement("button");
  reset.className = "btn danger";
  reset.textContent = t("settings.reset");
  reset.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: t("settings.reset"), message: `${t("settings.resetConfirm")}\n\n${t("settings.resetDesc")}`, danger: true, confirmLabel: t("settings.reset") });
    if (!ok) return;
    const twice = await confirmDialog({ title: t("settings.reset"), message: t("settings.resetConfirm"), danger: true, confirmLabel: t("dialogs.confirm") });
    if (!twice) return;
    cbs.onReset?.();
  });
  const desc = document.createElement("p");
  desc.className = "muted";
  desc.textContent = t("settings.resetDesc");
  body.append(desc, reset);
}

function secAbout(body) {
  const about = document.createElement("div");
  about.innerHTML = `<p></p><p class="muted small"></p><p class="muted small"></p><p class="mono small"></p>`;
  about.children[0].textContent = t("settings.aboutText");
  about.children[1].textContent = t("settings.noAdmin");
  about.children[2].textContent = `Version ${state.version}`;
  about.children[3].textContent = `${t("settings.dataLocation")}: ${state.dataDir}`;
  body.appendChild(about);
}
