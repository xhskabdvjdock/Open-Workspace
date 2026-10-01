// Mock-Tauri test: proves the frontend really invokes the backend
// (regression test for "clicking Launch does nothing") and that
// localStorage data migrates to disk.
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};

// Seed localStorage as if the user had added workspaces while the backend was unreachable.
const seeded = {
  id: "ws-user-1",
  name: "Coding",
  description: "My dev env",
  icon: "code",
  accent: "#4d7cfe",
  group: "",
  favorite: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastLaunchedAt: null,
  launchCount: 0,
  workspaceFolder: "",
  apps: [{ id: "a1", name: "VS Code", path: "C:\\Apps\\Code.exe", args: "", cwd: "", order: 0, delaySec: 0, minimized: false, window: { monitor: 0, maximized: false } }],
  websites: [{ id: "w1", name: "GitHub", url: "https://github.com", browser: "default", order: 0 }],
  files: [{ id: "f1", name: "Projects", path: "C:\\Projects", kind: "folder", order: 0 }],
  commands: [],
  notes: "",
  env: {},
  profiles: [],
  snapshots: [],
};
mem["ow.workspaces"] = JSON.stringify([seeded]);

const disk = { workspaces: {}, settings: "{}", shortcuts: "{}", history: "{}", ui: "{}", snapshots: "{}" };
const calls = [];
globalThis.window = {
  open: () => {},
  __TAURI__: {
    core: {
      invoke: async (cmd, args = {}) => {
        calls.push({ cmd, args });
        switch (cmd) {
          case "list_workspace_files": return Object.values(disk.workspaces);
          case "save_workspace_file": disk.workspaces[args.id] = args.jsonText; return null;
          case "delete_workspace_file": delete disk.workspaces[args.id]; return null;
          case "load_settings": return disk.settings;
          case "save_settings": disk.settings = args.jsonText; return null;
          case "load_aux": return disk[args.name] ?? "{}";
          case "save_aux": disk[args.name] = args.jsonText; return null;
          case "detect_browsers": return {};
          case "list_monitors": return [{ id: "0", label: "Primary display" }];
          case "get_data_dir": return "C:\\Users\\t\\AppData\\Roaming\\OpenWorkspace";
          case "get_app_version": return "1.0.0";
          case "launch_application": return 4321;
          case "open_website": return "default";
          case "open_folder_path": case "open_file_path": return null;
          case "run_command": return 8765;
          case "is_process_running": return true;
          case "refresh_tray": return null;
          default: throw new Error("unexpected command in test: " + cmd);
        }
      },
    },
    event: { listen: async () => {} },
  },
};

const store = await import("../src/js/store.js");
const launcher = await import("../src/js/launcher.js");

let pass = 0, failed = 0;
const assert = (name, cond) => {
  if (cond) { pass++; console.log("  ok - " + name); }
  else { failed++; console.log("  FAIL - " + name); }
};

await store.initStore();
assert("tauri mode detected", store.env.isTauri === true);
assert("local workspaces migrated to disk", !!disk.workspaces["ws-user-1"]);
assert("localStorage cleared after migration", !("ow.workspaces" in mem));
assert("migrated workspace loaded in state", !!store.getWorkspace("ws-user-1"));

const ws = store.getWorkspace("ws-user-1");
const before = calls.length;
const res = await launcher.launchWorkspace(ws, { onEvent: () => {} });
const newCalls = calls.slice(before).map((c) => c.cmd);
assert("launch invokes backend app launcher", newCalls.includes("launch_application"));
assert("launch passes the real exe path", calls.some((c) => c.cmd === "launch_application" && c.args.opts.path === "C:\\Apps\\Code.exe"));
assert("launch opens websites via backend", newCalls.includes("open_website"));
assert("launch opens folders via backend", newCalls.includes("open_folder_path"));
assert("launch reports success", res.ok === true);
assert("tracked PID registered for ownership", (launcher.runningRegistry.get("ws-user-1") || []).some((e) => e.pid === 4321));

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
