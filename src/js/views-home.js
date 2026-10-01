// Home / Workspaces / Favorites / Recent / Templates views + workspace cards.
import { icon, ACCENTS } from "./icons.js";
import { t, fmtDateTime } from "./i18n.js";
import { state, getWorkspace, deleteWorkspace, duplicateWorkspace, createFromTemplate, saveWorkspace } from "./store.js";
import { countItems, launchStatus, refreshWorkspaceStatus } from "./launcher.js";
import { openModal, confirmDialog, toast, textInput, fieldRow } from "./dialogs.js";
import { templateList } from "./templates.js";

export function statusOf(ws) {
  return launchStatus.get(ws.id) || "idle";
}
export function statusMeta(ws) {
  const s = statusOf(ws);
  if (s === "running") return { key: "home.running", cls: "running" };
  if (s === "partial") return { key: "home.partial", cls: "partial" };
  if (s === "error") return { key: "home.error", cls: "error" };
  return { key: "home.notRunning", cls: "idle" };
}

export function workspaceCard(ws, { onOpen, onLaunch, onStop, onChanged }) {
  const card = document.createElement("article");
  card.className = "ws-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", ws.name);
  const accent = ws.accent || "#4d7cfe";
  card.style.setProperty("--accent", accent);
  const meta = statusMeta(ws);
  const n = countItems(ws);
  card.innerHTML = `
    <div class="ws-accent"></div>
    <div class="ws-top">
      <span class="ws-icon">${icon(ws.icon || "grid", 20)}</span>
      <button class="icon-btn fav ${ws.favorite ? "on" : ""}" aria-label="Favorite" title="${ws.favorite ? t("card.unfavorite") : t("card.favorite")}">${icon("star", 17)}</button>
    </div>
    <h3 class="ws-name"></h3>
    <div class="ws-sub"><span class="ws-count"></span><span class="dot"></span><span class="ws-status ${meta.cls}"></span></div>
    <div class="ws-last"></div>
    <div class="ws-actions">
      <button class="btn primary sm launch-btn"></button>
      <button class="icon-btn more-btn" aria-label="More" title="More">${icon("more", 17)}</button>
    </div>`;
  card.querySelector(".ws-name").textContent = ws.name || t("common.unnamed");
  card.querySelector(".ws-count").textContent = `${n} ${t("home.items")}`;
  card.querySelector(".ws-status").textContent = t(meta.key);
  card.querySelector(".ws-last").textContent =
    `${t("home.lastLaunched")}: ${ws.lastLaunchedAt ? fmtDateTime(ws.lastLaunchedAt) : t("home.never")}`;
  const launchBtn = card.querySelector(".launch-btn");
  launchBtn.textContent = statusOf(ws) === "running" ? t("card.stop") : t("card.launch");
  if (statusOf(ws) === "running") launchBtn.classList.add("is-stop");

  card.querySelector(".fav").addEventListener("click", async (e) => {
    e.stopPropagation();
    ws.favorite = !ws.favorite;
    await saveWorkspace(ws);
    onChanged?.();
  });
  launchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (statusOf(ws) === "running") onStop?.(ws);
    else onLaunch?.(ws);
  });
  card.querySelector(".more-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    contextMenu(e.currentTarget, ws, { onOpen, onLaunch, onStop, onChanged });
  });
  card.addEventListener("click", () => onOpen?.(ws));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onOpen?.(ws);
  });
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    contextMenu(e.target, ws, { onOpen, onLaunch, onStop, onChanged }, e.clientX, e.clientY);
  });
  return card;
}

function contextMenu(anchor, ws, cbs, x = null, y = null) {
  document.querySelectorAll(".ctx-menu").forEach((m) => m.remove());
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  const items = [
    { id: "launch", label: t("card.launch"), ic: "play" },
    { id: "open", label: t("card.open"), ic: "eye" },
    { id: "edit", label: t("card.edit"), ic: "edit" },
    { id: "dup", label: t("card.duplicate"), ic: "copy" },
    { id: "fav", label: ws.favorite ? t("card.unfavorite") : t("card.favorite"), ic: "star" },
    { id: "export", label: t("card.export"), ic: "download" },
    { id: "delete", label: t("card.delete"), ic: "trash", danger: true },
  ];
  for (const it of items) {
    const b = document.createElement("button");
    b.className = `ctx-item ${it.danger ? "danger" : ""}`;
    b.innerHTML = `${icon(it.ic, 16)}<span></span>`;
    b.lastChild.textContent = it.label;
    b.addEventListener("click", async () => {
      menu.remove();
      if (it.id === "launch") cbs.onLaunch?.(ws);
      else if (it.id === "open" || it.id === "edit") cbs.onOpen?.(ws);
      else if (it.id === "fav") { ws.favorite = !ws.favorite; await saveWorkspace(ws); cbs.onChanged?.(); }
      else if (it.id === "dup") {
        await duplicateWorkspace(ws.id);
        toast(t("dialogs.dupDone"), "success");
        cbs.onChanged?.();
      }
      else if (it.id === "export") cbs.onExport?.(ws);
      else if (it.id === "delete") askDelete(ws, cbs.onChanged);
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect?.() || { bottom: y, left: x, right: x };
  const rtl = document.documentElement.dir === "rtl";
  menu.style.top = `${(y ?? r.bottom + 6)}px`;
  if (rtl) menu.style.right = `${Math.max(8, window.innerWidth - (x ?? r.right))}px`;
  else menu.style.left = `${Math.min(window.innerWidth - 220, x ?? r.left)}px`;
  const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", close); } };
  setTimeout(() => document.addEventListener("mousedown", close), 10);
  menu.querySelector("button")?.focus();
}

export async function askDelete(ws, onChanged) {
  if (state.settings.confirmBeforeDelete) {
    const ok = await confirmDialog({
      title: t("dialogs.deleteWs", { name: ws.name }),
      message: t("dialogs.deleteWsDesc"),
      danger: true, confirmLabel: t("dialogs.delete"), cancelLabel: t("dialogs.cancel"),
    });
    if (!ok) return;
  }
  await deleteWorkspace(ws.id);
  onChanged?.();
}

export function groupsOf(list) {
  const map = new Map();
  for (const w of list) {
    const g = (w.group || "").trim();
    const key = g || "__ungrouped";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(w);
  }
  return [...map.entries()].sort((a, b) => {
    if (a[0] === "__ungrouped") return 1;
    if (b[0] === "__ungrouped") return -1;
    return a[0].localeCompare(b[0]);
  });
}

export function renderGrid(container, list, cbs) {
  container.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<div class="empty-ic">${icon("grid", 28)}</div><h3></h3><p></p>`;
    empty.querySelector("h3").textContent = t("home.empty");
    empty.querySelector("p").textContent = t("home.emptyDesc");
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = t("home.create");
    btn.addEventListener("click", () => cbs.onNew?.());
    empty.appendChild(btn);
    container.appendChild(empty);
    return;
  }
  const groups = groupsOf(list);
  const multi = groups.length > 1;
  for (const [g, items] of groups) {
    if (multi) {
      const h = document.createElement("button");
      h.className = "group-head";
      h.innerHTML = `${icon("chevD", 16)}<span></span><em></em>`;
      h.querySelector("span").textContent = g === "__ungrouped" ? t("home.ungrouped") : g;
      h.querySelector("em").textContent = String(items.length);
      const grid = document.createElement("div");
      grid.className = "cards";
      let collapsed = false;
      h.addEventListener("click", () => {
        collapsed = !collapsed;
        grid.style.display = collapsed ? "none" : "";
        h.classList.toggle("collapsed", collapsed);
      });
      container.appendChild(h);
      for (const w of items) grid.appendChild(workspaceCard(w, cbs));
      container.appendChild(grid);
    } else {
      const grid = document.createElement("div");
      grid.className = "cards";
      for (const w of items) grid.appendChild(workspaceCard(w, cbs));
      container.appendChild(grid);
    }
  }
}

export function newWorkspaceDialog(onCreated) {
  const nameI = textInput("", "Cyber Security");
  const descI = textInput("", "");
  const groupI = textInput("", t("editor.groupPlaceholder"));
  const body = document.createElement("div");
  body.append(fieldRow({ label: `${t("editor.name")} *`, input: nameI }));
  body.append(fieldRow({ label: t("editor.description"), input: descI }));
  body.append(fieldRow({ label: t("editor.group"), input: groupI }));
  openModal({
    title: t("home.new"),
    body,
    actions: [
      { id: "cancel", label: t("dialogs.cancel") },
      {
        id: "create", label: t("dialogs.create"), kind: "primary",
        onClick: async () => {
          const name = nameI.value.trim();
          if (!name) { nameI.focus(); nameI.classList.add("invalid"); return false; }
          const { blankWorkspace, saveWorkspace } = await import("./store.js");
          const ws = blankWorkspace(name);
          ws.description = descI.value.trim();
          ws.group = groupI.value.trim();
          await saveWorkspace(ws);
          onCreated?.(ws);
        },
      },
    ],
  });
}

export function templatesView(container, cbs) {
  container.innerHTML = "";
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `<div><h1></h1><p class="muted"></p></div>`;
  head.querySelector("h1").textContent = t("templates.title");
  head.querySelector("p").textContent = t("templates.desc");
  container.appendChild(head);
  const grid = document.createElement("div");
  grid.className = "cards";
  for (const tpl of templateList()) {
    const card = document.createElement("article");
    card.className = "ws-card tpl";
    card.innerHTML = `<div class="ws-top"><span class="ws-icon">${icon(tpl.icon, 20)}</span></div><h3></h3><p class="muted"></p><div class="ws-actions"><button class="btn sm"></button></div>`;
    card.querySelector("h3").textContent = t(`templates.${tpl.nameKey}`);
    card.querySelector("p").textContent = t(`templates.${tpl.nameKey}Desc`);
    card.querySelector("button").textContent = t("templates.use");
    card.querySelector("button").addEventListener("click", async () => {
      const ws = await createFromTemplate(tpl.key);
      toast(t("dialogs.importDone"), "success");
      cbs.onOpen?.(ws);
      cbs.onChanged?.();
    });
    grid.appendChild(card);
  }
  container.appendChild(grid);
}
