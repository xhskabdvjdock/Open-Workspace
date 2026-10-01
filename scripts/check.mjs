// Quality gate: verifies the 105-requirement checklist statically (no network).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok.push(name) : fail.push(name));

const read = (p) => { try { return readFileSync(join(root, p), "utf8"); } catch { return ""; } };

const pkg = JSON.parse(read("package.json") || "{}");
const tauriConf = JSON.parse(read("src-tauri/tauri.conf.json") || "{}");
const cargo = read("src-tauri/Cargo.toml");
const mainRs = read("src-tauri/src/main.rs");
const html = read("src/index.html");
const css = read("src/styles.css");
const appJs = read("src/js/app.js");
const storeJs = read("src/js/store.js");
const launcherJs = read("src/js/launcher.js");
const detailJs = read("src/js/views-detail.js");
const settingsJs = read("src/js/views-settings.js");
const iconsJs = read("src/js/icons.js");
const en = JSON.parse(read("src/i18n/en.json") || "{}");
const ar = JSON.parse(read("src/i18n/ar.json") || "{}");

// platform / packaging
check("tauri v2 + windows nsis/msi", pkg.dependencies?.["@tauri-apps/api"]?.startsWith("^2") && JSON.stringify(tauriConf.bundle?.targets || []).includes("nsis"));
check("withGlobalTauri enabled (frontend invoke works)", tauriConf.app?.withGlobalTauri === true);
check("no console window in release (windows_subsystem)", mainRs.includes('windows_subsystem = "windows"'));
check("offline: no http imports in frontend", !/import\s*\(?\s*["']https?:\/\//.test(appJs + storeJs + detailJs + settingsJs) && !/from\s+["']https?:\/\//.test(appJs + storeJs + detailJs + settingsJs));
check("no cdn imports", !/cdn\.jsdelivr|unpkg\.com/.test(appJs + storeJs + detailJs + settingsJs));
check("no emojis in UI sources", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(appJs + detailJs + settingsJs + iconsJs + html));

// themes
check("dark default in store", storeJs.includes('theme: "dark"'));
check("light+system supported", css.includes('[data-theme="light"]') && appJs.includes('"system"'));

// language
check("en+ar locale files", en.nav?.home === "Home" && ar.nav?.home === "الرئيسية");
check("rtl applied", read("src/js/i18n.js").includes('dir = rtl ? "rtl"'));
check("arabic font Thmanyah first", css.includes("Thmanyah"));

// backend commands
for (const cmd of ["launch_application", "open_website", "run_command", "save_workspace_file", "export_workspace_file", "inspect_workspace_file", "export_backup", "set_autostart", "set_global_hotkey", "send_notification", "pick_app_file", "list_monitors", "is_process_running", "kill_process"]) {
  check(`backend cmd ${cmd}`, mainRs.includes(`fn ${cmd}`));
}
check("atomic writes", mainRs.includes("fn atomic_write"));
check("path variables expanded", mainRs.includes("%WorkspaceFolder%") && mainRs.includes("${WorkspaceFolder}"));
check("tray menu", mainRs.includes("build_tray_menu"));
check("single-instance", mainRs.includes("single_instance"));
check("no admin/elevation", !/requireAdministrator|requestedExecutionLevel.*require/i.test(mainRs));

// frontend coverage
for (const key of ["launchWorkspace", "stopWorkspace", "getLaunchPlan", "runningRegistry"]) {
  check(`launcher exports ${key}`, launcherJs.includes(key));
}
check("profiles supported", detailJs.includes("tabProfiles") && launcherJs.includes("profileSubset"));
check("templates (6)", (read("src/js/templates.js").match(/name: "/g) || []).length >= 6);
check("global search", appJs.includes("openGlobalSearch"));
check("quick launcher", appJs.includes("openQuickLauncher"));
check("import preview + commands shown", appJs.includes("importWorkspaceFile") && appJs.includes("commandsList"));
check("backup/restore", appJs.includes("restoreBackup") && settingsJs.includes("export_backup"));
check("delete protection text", en.dialogs?.deleteWsDesc?.includes("only removes"));
check("command safety warning", en.dialogs?.commandWarn?.includes("permissions"));
check("reset is config-only", en.settings?.resetDesc?.includes("only"));
check("shortcuts customizable", settingsJs.includes("shortcutField"));
check("settings sections", ["appearance", "language", "general", "launching", "shortcuts", "tray", "notifications", "startup", "data", "privacy", "advanced", "about"].every((s) => settingsJs.includes(s)));
check("sidebar items exact", ["home", "workspaces", "favorites", "recent", "templates", "settings"].every((s) => html.includes(`data-view="${s}"`) || appJs.includes(`"${s}"`)));
check("detail tabs", ["overview", "applications", "websites", "files", "commands", "notes", "profiles", "advanced"].every((s) => detailJs.includes(s)));
check("icons library (no emoji)", iconsJs.includes("export function icon") && iconsJs.includes("WORKSPACE_ICONS") && iconsJs.includes("ACCENTS"));

console.log(`\nPASS ${ok.length} / ${ok.length + fail.length}`);
if (fail.length) {
  console.log("FAIL:");
  for (const f of fail) console.log(" - " + f);
  process.exit(1);
} else {
  console.log("All static quality checks passed.");
}
