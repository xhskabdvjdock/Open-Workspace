// Minimal i18n with EN + AR, RTL support, persisted language.
let dict = {};
let lang = "en";

export async function loadLocale(next) {
  lang = next === "ar" ? "ar" : "en";
  try {
    const res = await fetch(`./i18n/${lang}.json`);
    dict = await res.json();
  } catch {
    dict = {};
  }
  applyDir();
  return dict;
}

function applyDir() {
  const rtl = lang === "ar";
  document.documentElement.lang = rtl ? "ar" : "en";
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.body.classList.toggle("rtl", rtl);
  // Arabic MUST use خط ثمانية: prefer local Thmanyah install, offline-safe fallbacks.
  document.body.classList.toggle("ar", rtl);
}

export function getLang() { return lang; }

/** t("home.title") with {var} interpolation */
export function t(path, vars = {}) {
  const parts = path.split(".");
  let cur = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return path;
  }
  if (typeof cur !== "string") return path;
  return cur.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function fmtDateTime(iso, langOverride) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const l = (langOverride || lang) === "ar" ? "ar" : "en-US";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const isY = d.toDateString() === y.toDateString();
    const time = d.toLocaleTimeString(l, { hour: "numeric", minute: "2-digit" });
    if (sameDay) return `${l === "ar" ? "اليوم" : "Today"}, ${time}`;
    if (isY) return `${l === "ar" ? "أمس" : "Yesterday"}, ${time}`;
    return d.toLocaleDateString(l, { month: "short", day: "numeric" }) + ", " + time;
  } catch { return ""; }
}
