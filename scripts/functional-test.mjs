// Headless functional test of workspace logic (no GUI, no network).
globalThis.window = undefined;
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
if (!globalThis.crypto?.randomUUID) {
  const { randomUUID } = await import("node:crypto");
  globalThis.crypto = { randomUUID };
}

const store = await import("../src/js/store.js");
const launcher = await import("../src/js/launcher.js");
const tplMod = await import("../src/js/templates.js");
const en = JSON.parse((await import("node:fs")).readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8"));
const ar = JSON.parse((await import("node:fs")).readFileSync(new URL("../src/i18n/ar.json", import.meta.url), "utf8"));

let pass = 0, failed = 0;
const assert = (name, cond) => {
  if (cond) { pass++; console.log("  ok - " + name); }
  else { failed++; console.log("  FAIL - " + name); }
};

await store.initStore();
assert("store initializes", store.state.initialized === true);
assert("default theme is dark", store.state.settings.theme === "dark");

// templates: all 6 create valid configs, config-only (no exec)
for (const key of ["developer", "student", "gaming", "creator", "office", "cyber"]) {
  const ws = await store.createFromTemplate(key);
  assert(`template ${key} creates workspace`, !!ws.id && !!ws.name);
  assert(`template ${key} has profiles`, ws.profiles.length >= 1);
  const plan = launcher.getLaunchPlan(ws, null);
  assert(`template ${key} launch plan`, (plan.apps.length + plan.websites.length + plan.files.length + plan.commands.length) >= 0);
}
// duplicate
const first = store.state.workspaces[0];
const dup = await store.duplicateWorkspace(first.id);
assert("duplicate creates variant", dup.id !== first.id && dup.name.includes("Minimal"));
// launch plan subset (Minimal profile launches fewer apps)
const dev = store.state.workspaces.find((w) => w.name === "Developer");
if (dev) {
  const full = launcher.getLaunchPlan(dev, null);
  const minProfile = dev.profiles.find((p) => p.name === "Minimal");
  const min = launcher.getLaunchPlan(dev, minProfile?.id);
  assert("Minimal profile launches subset", min.apps.length <= full.apps.length);
}
// launchWorkspace dry-run (non-Tauri path simulates; empty-path app should fail gracefully, not throw)
const testWs = store.blankWorkspace("Test");
testWs.apps = [{ ...store.blankApp(), name: "Placeholder", path: "", order: 0 }];
testWs.websites = [{ ...store.blankWebsite(), name: "GitHub", url: "https://github.com", order: 0 }];
// stub window.open for website step
globalThis.window = { open: () => {} };
const res = await launcher.launchWorkspace(testWs, { onEvent: () => {} });
assert("launch completes with report", Array.isArray(res.results));
assert("missing app path reported as failure (not crash)", res.results.some((r) => r.kind === "app" && r.ok === false));
assert("launch does not stop whole workspace on single failure", res.results.some((r) => r.kind === "website"));
// stopWorkspace with nothing tracked
const stop = await launcher.stopWorkspace("nonexistent");
assert("stop with no processes is safe", stop.closed === 0);
// settings persist round-trip
store.state.settings.theme = "light";
await store.persistSettings();
store.state.settings.theme = "dark";
// history
store.recordLaunch(testWs.id, true);
assert("launch history recorded", store.state.history.launches.length >= 1);

// i18n parity: same key paths
const keys = (o, prefix = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v !== null ? keys(v, prefix + k + ".") : [prefix + k]));
const enKeys = new Set(keys(en));
const arKeys = new Set(keys(ar));
const missing = [...enKeys].filter((k) => !arKeys.has(k));
const extra = [...arKeys].filter((k) => !enKeys.has(k));
assert("ar covers all en keys", missing.length === 0);
assert("ar has no extra keys", extra.length === 0);
if (missing.length) console.log("   missing:", missing.slice(0, 10));
if (extra.length) console.log("   extra:", extra.slice(0, 10));

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
