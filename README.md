# Open Workspace

A lightweight, privacy-focused desktop workspace manager for Windows. Create, save, organize, and launch complete work environments with one click — applications, websites, files, folders, terminal commands, notes, and launch profiles.

- **Native Windows app** (Tauri v2: Rust backend + static HTML/CSS/JS frontend, no bundler, no CDN)
- **Lightweight**: fast startup, low RAM/CPU, no background services, lazy loading, no full-disk scans
- **Offline-first**: no account, no cloud, no telemetry. All data stays in `%APPDATA%\OpenWorkspace`
- **Dark by default** (+ Light / System), **English + العربية** with full RTL and خط ثمانية-first Arabic font stack
- **Professional SVG icons only** — no emojis in the UI

## Quick start

```powershell
npm install
npm run dev        # Tauri dev window
npm run build      # Windows installer (nsis + msi) in src-tauri/target/release/bundle
```

Requirements: Node 18+, Rust stable (1.77+), WebView2 (preinstalled on Windows 10/11).

## Data layout

```text
%APPDATA%\OpenWorkspace\
  settings.json
  shortcuts.json
  history.json
  snapshots.json
  ui.json
  workspaces\<id>.json
```

All writes are atomic (write temp + rename). Workspace removal only deletes configuration — never your apps or files.

Workspace files can use portable variables: `%USERPROFILE%`, `%APPDATA%`, `%TEMP%`, `${WorkspaceFolder}`.

## Features

- Workspaces with icon, accent, group, description, workspace folder
- Applications (path/args/cwd/order/delay/minimized/monitor), Websites (browser choice + localhost), Files & Folders, Commands (PowerShell/cmd/Windows Terminal, safety warning), Notes (offline Markdown), Environment variables, Launch profiles (Full/Minimal/custom subsets)
- Launch engine: validation → ordered launch → progress → completion summary; failures show Fix/Skip without stopping the whole workspace (unless configured)
- Process ownership via PID registry; Stop Workspace only closes what it started (with confirmation)
- Favorites, Recent, Groups (collapsible), Global search (Ctrl+K), Quick launcher (Ctrl+Alt+W global hotkey), Templates (config only), Duplicate, `.openworkspace` Import/Export with untrusted-file preview + command confirmation, full Backup/Restore, Snapshots, Running view + status (Running/Partial/Idle), multi-monitor prefs (best effort, graceful fallback), window layout restore attempt, Windows notifications (optional), system tray with quick launch (optional), Windows startup + launch-on-startup (opt-in with large-workspace warning), customizable shortcuts, privacy controls (clear history, no telemetry), data folder opener, reset (config only)
- Keyboard-first: Ctrl+K search, Ctrl+N new, Enter open/launch, arrows in launcher, Esc closes dialogs
- Accessibility: focus states, aria labels, tooltips, keyboard navigation, reduced-motion respect

## Security

- Runs as a normal Windows user. No admin required. No privilege elevation.
- Commands execute only from explicit user configuration; imports containing commands require Allow/Cancel.
- Imported `.openworkspace` files are treated as untrusted and previewed before import.

## Architecture (cloud-ready, local-only today)

```text
src/                 static frontend (HTML/CSS/JS ES modules, no build step)
  js/store.js        persistence via Tauri invoke (localStorage fallback for preview)
  js/launcher.js     launch engine + PID registry
  js/app.js          shell/router/search/quick-launcher/tray/hotkeys
src-tauri/src/main.rs  commands: store, launch, dialogs, notifications, autostart, hotkey, tray, monitors
```

Sync was deliberately left out; the JSON-document store (`workspaces/<id>.json` + envelope format with `formatVersion`) is shaped so a future sync layer could be added without changing the UI.

## License

MIT
