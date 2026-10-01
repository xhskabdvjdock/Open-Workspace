// Modal + toast primitives. RTL-aware, keyboard accessible, no emojis.
import { icon } from "./icons.js";
import { t } from "./i18n.js";

let modalStack = [];

export function toast(msg, kind = "info") {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="toast-ic">${icon(kind === "error" ? "alert" : kind === "success" ? "check" : "info", 16)}</span><span></span>`;
  el.lastChild.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3600);
}

export function openModal({ title, body, actions = [], wide = false, onClose = null }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="">
      <div class="modal-head">
        <h2 class="modal-title"></h2>
        <button class="icon-btn modal-x" aria-label="Close">${icon("x", 18)}</button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div>
    </div>`;
  overlay.querySelector(".modal-title").textContent = title;
  overlay.querySelector(".modal").setAttribute("aria-label", title);
  const bodyEl = overlay.querySelector(".modal-body");
  if (typeof body === "string") bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);
  const foot = overlay.querySelector(".modal-foot");
  const close = (result) => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 180);
    modalStack = modalStack.filter((m) => m !== overlay);
    onClose?.(result);
  };
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.className = `btn ${a.kind || ""}`;
    btn.textContent = a.label;
    btn.addEventListener("click", async () => {
      if (a.onClick) {
        const r = await a.onClick(bodyEl, close);
        if (r === false) return;
        if (!a.keepOpen) close(a.id);
      } else close(a.id);
    });
    foot.appendChild(btn);
  }
  if (!actions.length) foot.remove();
  overlay.querySelector(".modal-x").addEventListener("click", () => close(null));
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(null); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  modalStack.push(overlay);
  const first = overlay.querySelector("input, select, textarea, button.btn");
  setTimeout(() => first?.focus(), 60);
  return { overlay, bodyEl, close };
}

export function confirmDialog({ title, message, danger = false, confirmLabel = null, cancelLabel = null }) {
  return new Promise((resolve) => {
    const msg = document.createElement("div");
    msg.className = "confirm-msg";
    msg.textContent = message;
    openModal({
      title,
      body: msg,
      actions: [
        { id: "cancel", label: cancelLabel || t("dialogs.cancel"), onClick: () => resolve(false) },
        { id: "ok", label: confirmLabel || t("dialogs.confirm"), kind: danger ? "danger" : "primary", onClick: () => resolve(true) },
      ],
      onClose: (r) => { if (r !== "ok") resolve(false); },
    });
  });
}

export function fieldRow({ label, hint = "", input }) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("label");
  lab.textContent = label;
  wrap.appendChild(lab);
  wrap.appendChild(input);
  if (hint) {
    const h = document.createElement("div");
    h.className = "hint";
    h.textContent = hint;
    wrap.appendChild(h);
  }
  return wrap;
}

export function textInput(value = "", placeholder = "") {
  const i = document.createElement("input");
  i.type = "text"; i.className = "input"; i.value = value ?? ""; i.placeholder = placeholder;
  return i;
}
export function numberInput(value = 0) {
  const i = document.createElement("input");
  i.type = "number"; i.className = "input"; i.min = "0"; i.max = "120"; i.value = String(value ?? 0);
  return i;
}
export function selectInput(options, value) {
  const s = document.createElement("select");
  s.className = "input";
  for (const o of options) {
    const op = document.createElement("option");
    op.value = o.value; op.textContent = o.label;
    if (o.value === value) op.selected = true;
    s.appendChild(op);
  }
  return s;
}
export function checkRow(label, checked) {
  const lab = document.createElement("label");
  lab.className = "check";
  const c = document.createElement("input");
  c.type = "checkbox"; c.checked = !!checked;
  const sp = document.createElement("span");
  sp.textContent = label;
  lab.append(c, sp);
  return { lab, c };
}
