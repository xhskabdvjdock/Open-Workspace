// Hide the console window in release builds on Windows (no CMD popup with the app).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::Manager;

// ---------- helpers: paths ----------

fn base_dir() -> Result<PathBuf, String> {
    dirs::config_dir()
        .map(|p| p.join("OpenWorkspace"))
        .ok_or_else(|| "Could not resolve configuration directory.".to_string())
}

fn workspaces_dir() -> Result<PathBuf, String> {
    let d = base_dir()?.join("workspaces");
    std::fs::create_dir_all(&d).map_err(|e| format!("Could not create workspaces folder: {e}"))?;
    Ok(d)
}

/// Expand %VAR% and ${WorkspaceFolder} / $VAR style variables.
fn expand_vars(input: &str, workspace_folder: Option<&str>) -> String {
    let mut out = input.to_string();
    if let Some(wf) = workspace_folder {
        out = out.replace("${WorkspaceFolder}", wf);
        out = out.replace("$WorkspaceFolder", wf);
        out = out.replace("%WorkspaceFolder%", wf);
    }
    // Expand %NAME% (Windows style)
    // simple manual scan to avoid regex overhead per call
    let mut result = String::with_capacity(out.len());
    let bytes = out.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if let Some(end) = out[i + 1..].find('%') {
                let name = &out[i + 1..i + 1 + end];
                if !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '(' || c == ')') {
                    let clean = name.trim_matches(|c| c == '(' || c == ')');
                    if let Ok(v) = std::env::var(clean) {
                        result.push_str(&v);
                        i += end + 2;
                        continue;
                    }
                }
            }
        }
        result.push(bytes[i] as char);
        i += 1;
    }
    // Expand $HOME / ${HOME} style via env for common ones
    let mut expanded = result;
    for (k, v) in std::env::vars() {
        let a = format!("${{{k}}}");
        if expanded.contains(&a) {
            expanded = expanded.replace(&a, &v);
        }
    }
    expanded
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Could not create folder: {e}"))?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, content).map_err(|e| format!("Could not write configuration: {e}"))?;
    // fsync best effort
    std::fs::rename(&tmp, path).map_err(|e| format!("Could not save configuration: {e}"))?;
    Ok(())
}

// ---------- basic info ----------

#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    Ok(base_dir()?.to_string_lossy().to_string())
}

#[tauri::command]
fn get_workspaces_dir() -> Result<String, String> {
    Ok(workspaces_dir()?.to_string_lossy().to_string())
}

#[tauri::command]
fn open_data_folder() -> Result<(), String> {
    let d = base_dir()?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    open::that(&d).map_err(|e| format!("Could not open data folder: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn path_exists(raw: String, workspace_folder: Option<String>) -> bool {
    let expanded = expand_vars(&raw, workspace_folder.as_deref());
    Path::new(&expanded).exists()
}

// ---------- workspace store (list/get/save/delete/duplicate) ----------

#[tauri::command]
fn list_workspace_files() -> Result<Vec<String>, String> {
    let dir = workspaces_dir()?;
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(content) = std::fs::read_to_string(&p) {
                out.push(content);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
fn save_workspace_file(id: String, json_text: String) -> Result<(), String> {
    // validate id: alphanumeric + dash/underscore only
    if id.is_empty() || id.len() > 128 || !id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid workspace identifier.".to_string());
    }
    // validate JSON parses
    let v: serde_json::Value = serde_json::from_str(&json_text).map_err(|_| "Workspace data is corrupted and cannot be saved.".to_string())?;
    if v.get("name").and_then(|n| n.as_str()).map(|s| s.trim().is_empty()).unwrap_or(true) {
        return Err("Workspace name is required.".to_string());
    }
    let dir = workspaces_dir()?;
    let path = dir.join(format!("{id}.json"));
    let pretty = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    atomic_write(&path, &pretty)
}

#[tauri::command]
fn delete_workspace_file(id: String) -> Result<(), String> {
    let dir = workspaces_dir()?;
    let path = dir.join(format!("{id}.json"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Could not delete workspace: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|_| format!("File could not be found:\n{path}"))
}

// ---------- launching ----------

#[derive(serde::Deserialize)]
struct LaunchAppOptions {
    path: String,
    args: Option<String>,
    cwd: Option<String>,
    minimized: Option<bool>,
    env: Option<HashMap<String, String>>,
    workspace_folder: Option<String>,
}

#[tauri::command]
fn launch_application(opts: LaunchAppOptions) -> Result<u32, String> {
    let exe = expand_vars(opts.path.trim(), opts.workspace_folder.as_deref());
    if exe.is_empty() {
        return Err("Application path is empty.".to_string());
    }
    let exe_path = Path::new(&exe);
    if !exe_path.exists() {
        return Err(format!("Application could not be found.\n\n{exe}\n\nThe application may have been moved or uninstalled."));
    }
    let cwd_expanded = opts.cwd.as_deref().map(|c| expand_vars(c, opts.workspace_folder.as_deref()));
    if let Some(ref c) = cwd_expanded {
        if !c.trim().is_empty() && !Path::new(c).exists() {
            return Err(format!("Working folder could not be found.\n\n{c}"));
        }
    }
    // Build command. Support .lnk via cmd /c start, else direct spawn.
    let is_lnk = exe.to_lowercase().ends_with(".lnk");
    let child = if is_lnk {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", "start", "", &exe]);
            if let Some(ref c) = cwd_expanded {
                if !c.trim().is_empty() {
                    cmd.current_dir(c);
                }
            }
            // Always hide the intermediate console: `start` detaches the target itself,
            // so this window would only flash. The target's own minimized/normal state is untouched.
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
            cmd.spawn().map_err(|e| format!("Could not launch application:\n{exe}\n\n{e}"))?
        }
        #[cfg(not(windows))]
        {
            open::that(&exe).map_err(|e| format!("Could not launch application: {e}"))?;
            return Ok(0);
        }
    } else {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            const DETACHED_PROCESS: u32 = 0x00000008;
            let mut cmd = Command::new(&exe);
            if let Some(a) = opts.args.as_deref() {
                let a_exp = expand_vars(a, opts.workspace_folder.as_deref());
                if !a_exp.trim().is_empty() {
                    // Use windows-style arg splitting: respect quotes via cmd parsing is complex;
                    // use simple split that honours double quotes.
                    for token in split_args(&a_exp) {
                        cmd.arg(token);
                    }
                }
            }
            if let Some(ref c) = cwd_expanded {
                if !c.trim().is_empty() {
                    cmd.current_dir(c);
                }
            }
            if let Some(envs) = opts.env.as_ref() {
                for (k, v) in envs {
                    if !k.trim().is_empty() {
                        cmd.env(k, expand_vars(v, opts.workspace_folder.as_deref()));
                    }
                }
            }
            let mut flags = DETACHED_PROCESS;
            if opts.minimized.unwrap_or(false) {
                flags |= CREATE_NO_WINDOW;
            }
            cmd.creation_flags(flags);
            cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
            cmd.spawn().map_err(|e| format!("Could not launch application:\n{exe}\n\n{e}"))?
        }
        #[cfg(not(windows))]
        {
            let mut cmd = Command::new(&exe);
            if let Some(a) = opts.args.as_deref() {
                for token in split_args(a) {
                    cmd.arg(token);
                }
            }
            cmd.spawn().map_err(|e| format!("Could not launch application: {e}"))?
        }
    };
    Ok(child.id())
}

fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_q = false;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                in_q = !in_q;
            }
            ' ' | '\t' if !in_q => {
                if !cur.is_empty() {
                    out.push(cur.clone());
                    cur.clear();
                }
            }
            '\\' if in_q && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

#[derive(serde::Deserialize)]
struct OpenUrlOptions {
    url: String,
    browser: Option<String>, // "default" | "edge" | "chrome" | "firefox" | custom path
}

fn known_browser_path(kind: &str) -> Option<String> {
    let candidates: Vec<String> = match kind {
        "edge" => vec![
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe".into(),
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".into(),
        ],
        "chrome" => vec![
            r"C:\Program Files\Google\Chrome\Application\chrome.exe".into(),
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe".into(),
        ],
        "firefox" => vec![
            r"C:\Program Files\Mozilla Firefox\firefox.exe".into(),
            r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe".into(),
        ],
        _ => vec![],
    };
    for c in candidates {
        if Path::new(&c).exists() {
            return Some(c);
        }
    }
    // check PATH
    let exe = match kind {
        "edge" => "msedge.exe",
        "chrome" => "chrome.exe",
        "firefox" => "firefox.exe",
        _ => return None,
    };
    // best effort: try `where`
    if let Ok(out) = Command::new("where").arg(exe).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(line) = s.lines().next() {
            let t = line.trim().to_string();
            if !t.is_empty() && Path::new(&t).exists() {
                return Some(t);
            }
        }
    }
    None
}

#[tauri::command]
fn open_website(opts: OpenUrlOptions) -> Result<String, String> {
    let mut url = opts.url.trim().to_string();
    if url.is_empty() {
        return Err("Website address is empty.".to_string());
    }
    if !url.contains("://") {
        url = format!("https://{url}");
    }
    // light URL validation
    if url.len() > 2048 || url.contains(' ') {
        return Err(format!("Website address looks invalid:\n{url}"));
    }
    let browser = opts.browser.as_deref().unwrap_or("default");
    if browser == "default" || browser.is_empty() {
        open::that(&url).map_err(|e| format!("Could not open website:\n{url}\n\n{e}"))?;
        return Ok("default".to_string());
    }
    let exe = if browser == "edge" || browser == "chrome" || browser == "firefox" {
        match known_browser_path(browser) {
            Some(p) => p,
            None => {
                // fallback to default with clear message
                open::that(&url).map_err(|e| e.to_string())?;
                return Ok(format!("fallback-default:{browser}-not-found"));
            }
        }
    } else {
        let exp = expand_vars(browser, None);
        if !Path::new(&exp).exists() {
            open::that(&url).map_err(|e| e.to_string())?;
            return Ok(format!("fallback-default:custom-not-found"));
        }
        exp
    };
    Command::new(&exe)
        .arg(&url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not open website with selected browser:\n{url}\n\n{e}"))?;
    Ok(exe)
}

#[tauri::command]
fn detect_browsers() -> HashMap<String, String> {
    let mut m = HashMap::new();
    for k in ["edge", "chrome", "firefox"] {
        if let Some(p) = known_browser_path(k) {
            m.insert(k.to_string(), p);
        }
    }
    // windows terminal
    if let Ok(out) = Command::new("where").arg("wt.exe").output() {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(line) = s.lines().next() {
            let t = line.trim();
            if !t.is_empty() {
                m.insert("windowsterminal".to_string(), t.to_string());
            }
        }
    }
    m
}

#[tauri::command]
fn open_file_path(raw: String, workspace_folder: Option<String>) -> Result<(), String> {
    let p = expand_vars(&raw, workspace_folder.as_deref());
    if !Path::new(&p).exists() {
        return Err(format!("File could not be found.\n\n{p}"));
    }
    open::that(&p).map_err(|e| format!("Could not open file:\n{p}\n\n{e}"))?;
    Ok(())
}

#[tauri::command]
fn open_folder_path(raw: String, workspace_folder: Option<String>) -> Result<(), String> {
    let p = expand_vars(&raw, workspace_folder.as_deref());
    if !Path::new(&p).exists() {
        return Err(format!("Folder could not be found.\n\n{p}"));
    }
    open::that(&p).map_err(|e| format!("Could not open folder:\n{p}\n\n{e}"))?;
    Ok(())
}

#[tauri::command]
fn reveal_in_explorer(raw: String, workspace_folder: Option<String>) -> Result<(), String> {
    let p = expand_vars(&raw, workspace_folder.as_deref());
    #[cfg(windows)]
    {
        Command::new("explorer")
            .args(["/select,", &p])
            .spawn()
            .map_err(|e| format!("Could not reveal in Explorer:\n{e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        open::that(Path::new(&p).parent().unwrap_or(Path::new(&p))).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RunCmdOptions {
    shell: Option<String>, // powershell | cmd | windowsterminal
    command: String,
    cwd: Option<String>,
    behavior: Option<String>, // keepopen | close | minimized | normal
    workspace_folder: Option<String>,
    env: Option<HashMap<String, String>>,
}

#[tauri::command]
fn run_command(opts: RunCmdOptions) -> Result<u32, String> {
    let cmd_text = opts.command.trim().to_string();
    if cmd_text.is_empty() {
        return Err("Command is empty.".to_string());
    }
    if cmd_text.len() > 8000 {
        return Err("Command is too long.".to_string());
    }
    let cwd = opts.cwd.as_deref().map(|c| expand_vars(c, opts.workspace_folder.as_deref()));
    if let Some(ref c) = cwd {
        if !c.trim().is_empty() && !Path::new(c).exists() {
            return Err(format!("Working folder could not be found.\n\n{c}"));
        }
    }
    let shell = opts.shell.as_deref().unwrap_or("powershell");
    let behavior = opts.behavior.as_deref().unwrap_or("keepopen");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const DETACHED_PROCESS: u32 = 0x00000008;
        let minimized = behavior == "minimized";
        let mut cmd = match shell {
            "cmd" => {
                let mut c = Command::new("cmd.exe");
                match behavior {
                    "close" => c.args(["/C", &cmd_text]),
                    _ => c.args(["/K", &cmd_text]),
                };
                c
            }
            "windowsterminal" => {
                // wt opens in new window; fall back to powershell if wt missing
                let has_wt = Command::new("where").arg("wt.exe").output().map(|o| o.status.success()).unwrap_or(false);
                if has_wt {
                    let mut c = Command::new("wt.exe");
                    // wt new-tab powershell -NoExit -Command <cmd>
                    c.args(["powershell.exe", "-NoExit", "-Command", &cmd_text]);
                    c
                } else {
                    let mut c = Command::new("powershell.exe");
                    c.args(["-NoExit", "-Command", &cmd_text]);
                    c
                }
            }
            _ => {
                let mut c = Command::new("powershell.exe");
                match behavior {
                    "close" => c.args(["-Command", &cmd_text]),
                    _ => c.args(["-NoExit", "-Command", &cmd_text]),
                };
                c
            }
        };
        if let Some(ref c) = cwd {
            if !c.trim().is_empty() {
                cmd.current_dir(c);
            }
        }
        if let Some(envs) = opts.env.as_ref() {
            for (k, v) in envs {
                if !k.trim().is_empty() {
                    cmd.env(k, expand_vars(v, opts.workspace_folder.as_deref()));
                }
            }
        }
        let mut flags = DETACHED_PROCESS;
        if minimized {
            flags |= CREATE_NO_WINDOW;
        }
        cmd.creation_flags(flags);
        cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        let child = cmd.spawn().map_err(|e| format!("Could not run command:\n{cmd_text}\n\n{e}"))?;
        Ok(child.id())
    }
    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", &cmd_text]);
        let child = cmd.spawn().map_err(|e| e.to_string())?;
        Ok(child.id())
    }
}

#[tauri::command]
fn is_process_running(pid: u32) -> bool {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    sys.process(Pid::from(pid as usize)).is_some()
}

#[tauri::command]
fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let status = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).output().map_err(|e| e.to_string())?;
        if status.status.success() {
            Ok(())
        } else {
            Err("Process has already exited or cannot be closed.".to_string())
        }
    }
    #[cfg(not(windows))]
    {
        use sysinfo::{Pid, System, Signal};
        let mut sys = System::new();
        sys.refresh_processes();
        if let Some(p) = sys.process(Pid::from(pid as usize)) {
            if p.kill_with(Signal::Term).unwrap_or(false) {
                Ok(())
            } else {
                Err("Process could not be closed.".to_string())
            }
        } else {
            Err("Process has already exited.".to_string())
        }
    }
}

// ---------- monitors / window placement (best effort) ----------

#[tauri::command]
fn list_monitors() -> Vec<HashMap<String, String>> {
    // Pure-Rust fallback: report primary + count via windows API when available.
    let mut out: Vec<HashMap<String, String>> = Vec::new();
    #[cfg(windows)]
    {
        // Use GetSystemMetrics for count; positions best-effort.
        // Keep dependency-light: dynamic load user32.
        use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, HDC, HMONITOR};
        use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
        struct Ctx(Vec<RECT>);
        unsafe extern "system" fn cb(hm: HMONITOR, _hdc: HDC, rect: *mut RECT, lp: LPARAM) -> BOOL {
            let ctx = &mut *(lp.0 as *mut Ctx);
            if !rect.is_null() {
                ctx.0.push(*rect);
                let _ = hm;
            }
            BOOL(1)
        }
        let mut ctx = Ctx(Vec::new());
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut ctx as *mut Ctx as isize));
        }
        for (i, r) in ctx.0.iter().enumerate() {
            let mut m = HashMap::new();
            m.insert("id".into(), format!("{i}"));
            m.insert("label".into(), if i == 0 { "Primary display".into() } else { format!("Display {}", i + 1) });
            m.insert("x".into(), r.left.to_string());
            m.insert("y".into(), r.top.to_string());
            m.insert("width".into(), (r.right - r.left).to_string());
            m.insert("height".into(), (r.bottom - r.top).to_string());
            m.insert("primary".into(), (i == 0).to_string());
            out.push(m);
        }
    }
    if out.is_empty() {
        let mut m = HashMap::new();
        m.insert("id".into(), "0".into());
        m.insert("label".into(), "Primary display".into());
        m.insert("primary".into(), "true".into());
        out.push(m);
    }
    out
}

// ---------- settings store ----------

#[tauri::command]
fn load_settings() -> Result<String, String> {
    let p = base_dir()?.join("settings.json");
    if !p.exists() {
        return Ok(String::from("{}"));
    }
    std::fs::read_to_string(&p).map_err(|e| format!("Could not read settings: {e}"))
}

#[tauri::command]
fn save_settings(json_text: String) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(&json_text).map_err(|_| "Settings are corrupted.".to_string())?;
    let p = base_dir()?.join("settings.json");
    atomic_write(&p, &serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?)
}

#[tauri::command]
fn load_aux(name: String) -> Result<String, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid store name.".to_string());
    }
    let p = base_dir()?.join(format!("{name}.json"));
    if !p.exists() {
        return Ok(String::from("{}"));
    }
    std::fs::read_to_string(&p).map_err(|e| format!("Could not read data: {e}"))
}

#[tauri::command]
fn save_aux(name: String, json_text: String) -> Result<(), String> {
    if name.is_empty() || !name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid store name.".to_string());
    }
    let v: serde_json::Value = serde_json::from_str(&json_text).map_err(|_| "Data is corrupted.".to_string())?;
    let p = base_dir()?.join(format!("{name}.json"));
    atomic_write(&p, &serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?)
}

// ---------- start menu / recent apps (lightweight, no full scan) ----------

#[tauri::command]
fn list_start_menu_apps(limit: Option<usize>) -> Vec<HashMap<String, String>> {
    let lim = limit.unwrap_or(60).min(200);
    let mut out: Vec<HashMap<String, String>> = Vec::new();
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(appdata) = dirs::config_dir() {
        // %APPDATA%\Microsoft\Windows\Start Menu\Programs
        roots.push(appdata.join("Microsoft").join("Windows").join("Start Menu").join("Programs"));
    }
    roots.push(PathBuf::from(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs"));
    for root in roots {
        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            if out.len() >= lim {
                break;
            }
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for e in entries.flatten() {
                if out.len() >= lim {
                    break;
                }
                let p = e.path();
                if p.is_dir() {
                    stack.push(p);
                } else if p.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
                    let mut m = HashMap::new();
                    m.insert("name".into(), p.file_stem().and_then(|s| s.to_str()).unwrap_or("Application").to_string());
                    m.insert("path".into(), p.to_string_lossy().to_string());
                    out.push(m);
                }
            }
        }
    }
    out.sort_by(|a, b| a["name"].cmp(&b["name"]));
    out.truncate(lim);
    out
}

// ---------- export / import / backup ----------

#[tauri::command]
fn export_workspace_file(id: String, dest: String) -> Result<(), String> {
    let src = workspaces_dir()?.join(format!("{id}.json"));
    let content = std::fs::read_to_string(&src).map_err(|_| "Workspace could not be found.".to_string())?;
    // wrap with envelope
    let v: serde_json::Value = serde_json::from_str(&content).map_err(|_| "Workspace data is corrupted.".to_string())?;
    let envelope = serde_json::json!({
        "kind": "openworkspace",
        "formatVersion": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "workspace": v
    });
    atomic_write(Path::new(&dest), &serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())?)
}

#[tauri::command]
fn inspect_workspace_file(path: String) -> Result<String, String> {
    let content = std::fs::read_to_string(&path).map_err(|_| format!("File could not be read:\n{path}"))?;
    let v: serde_json::Value = serde_json::from_str(&content).map_err(|_| "This file is not a valid workspace file.".to_string())?;
    // accept either raw workspace or envelope
    let ws = if v.get("kind").and_then(|k| k.as_str()) == Some("openworkspace") {
        v.get("workspace").cloned().unwrap_or(serde_json::Value::Null)
    } else {
        v
    };
    if ws.get("name").is_none() {
        return Err("This file is not a valid workspace file.".to_string());
    }
    // return summary
    let summary = serde_json::json!({
        "name": ws.get("name").cloned().unwrap_or_default(),
        "description": ws.get("description").cloned().unwrap_or_default(),
        "apps": ws.get("apps").and_then(|a| a.as_array()).map(|a| a.len()).unwrap_or(0),
        "websites": ws.get("websites").and_then(|a| a.as_array()).map(|a| a.len()).unwrap_or(0),
        "files": ws.get("files").and_then(|a| a.as_array()).map(|a| a.len()).unwrap_or(0),
        "commands": ws.get("commands").and_then(|a| a.as_array()).map(|a| a.len()).unwrap_or(0),
        "commandsList": ws.get("commands").and_then(|a| a.as_array()).map(|arr| arr.iter().filter_map(|c| c.get("command").and_then(|s| s.as_str()).map(|s| s.to_string())).collect::<Vec<_>>()).unwrap_or_default(),
        "workspace": ws
    });
    serde_json::to_string(&summary).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_backup(dest: String) -> Result<(), String> {
    let mut workspaces: Vec<serde_json::Value> = Vec::new();
    for content in list_workspace_files()? {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            workspaces.push(v);
        }
    }
    let settings_path = base_dir()?.join("settings.json");
    let settings: serde_json::Value = std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));
    let shortcuts_path = base_dir()?.join("shortcuts.json");
    let shortcuts: serde_json::Value = std::fs::read_to_string(&shortcuts_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));
    let history_path = base_dir()?.join("history.json");
    let history: serde_json::Value = std::fs::read_to_string(&history_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));
    let envelope = serde_json::json!({
        "kind": "openworkspace-backup",
        "formatVersion": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "appVersion": "1.0.0",
        "workspaces": workspaces,
        "settings": settings,
        "shortcuts": shortcuts,
        "history": history
    });
    atomic_write(Path::new(&dest), &serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())?)
}

// ---------- offline-safe OS integrations (no CDN, invoke-only) ----------

#[tauri::command]
fn pick_app_file(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
    let _ = &app;
    // blocking_pick_file must run on main thread; use sync API
    FileDialogBuilder::new(app.dialog().clone())
        .add_filter("Applications", &["exe", "lnk"])
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_generic_file(app: tauri::AppHandle, directory: Option<bool>, extensions: Option<Vec<String>>) -> Option<String> {
    use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
    let mut b = FileDialogBuilder::new(app.dialog().clone());
    if directory.unwrap_or(false) {
        return b.blocking_pick_folder().and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string());
    }
    if let Some(exts) = extensions.as_ref() {
        let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        b = b.add_filter("Files", &refs);
    }
    b.blocking_pick_file().and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_save_file(app: tauri::AppHandle, default_name: Option<String>, ext: Option<String>) -> Option<String> {
    use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
    let mut b = FileDialogBuilder::new(app.dialog().clone());
    if let Some(name) = default_name.as_ref() {
        b = b.set_file_name(name);
    }
    if let Some(e) = ext.as_ref() {
        b = b.add_filter("File", &[e.as_str()]);
    }
    b.blocking_save_file().and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn send_notification(app: tauri::AppHandle, title: String, body: Option<String>) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body.unwrap_or_default())
        .show()
        .map_err(|e| format!("Notification failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(|e| format!("Could not enable startup: {e}"))
    } else {
        m.disable().map_err(|e| format!("Could not disable startup: {e}"))
    }
}

#[tauri::command]
fn set_global_hotkey(app: tauri::AppHandle, hotkey: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    let _ = app.global_shortcut().unregister_all();
    let hotkey = hotkey.trim();
    if hotkey.is_empty() {
        return Ok(());
    }
    let hotkey_parsed: tauri_plugin_global_shortcut::Shortcut =
        hotkey.parse().map_err(|_| format!("Hotkey looks invalid: {hotkey}. Example: Ctrl+Alt+W"))?;
    app.global_shortcut()
        .on_shortcut(hotkey_parsed, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(w) = app.get_webview_window("main") {
                    use tauri::Emitter;
                    let _ = w.emit("open-launcher", ());
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .map_err(|e| format!("Could not register hotkey: {e}"))?;
    Ok(())
}

#[tauri::command]
fn minimize_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_tray_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(t) = app.tray_by_id("main") {
        t.set_visible(visible).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- tray ----------

fn build_tray_menu(app: &tauri::AppHandle, workspaces: &[(String, String)]) -> tauri::menu::Menu<tauri::Wry> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
    let mut builder = MenuBuilder::new(app);
    let open_item = MenuItemBuilder::with_id("open", "Open Open Workspace").build(app).unwrap();
    builder = builder.item(&open_item);
    // workspaces submenu (max 15)
    if !workspaces.is_empty() {
        let mut sub = SubmenuBuilder::new(app, "Launch Workspace");
        for (id, name) in workspaces.iter().take(15) {
            if let Ok(it) = MenuItemBuilder::with_id(format!("launch:{id}"), name.clone()).build(app) {
                sub = sub.item(&it);
            }
        }
        if let Ok(sm) = sub.build() {
            builder = builder.item(&sm);
        }
    }
    let quit = PredefinedMenuItem::quit(app, None).unwrap();
    builder = builder.separator().item(&quit);
    builder.build().unwrap()
}

#[tauri::command]
fn refresh_tray(app: tauri::AppHandle, items_json: String) -> Result<(), String> {
    let parsed: Vec<(String, String)> = serde_json::from_str(&items_json).unwrap_or_default();
    if let Some(tray) = app.tray_by_id("main") {
        let menu = build_tray_menu(&app, &parsed);
        let _ = tray.set_menu(Some(menu));
    }
    Ok(())
}

// ---------- main ----------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_data_dir,
            get_workspaces_dir,
            open_data_folder,
            get_app_version,
            path_exists,
            list_workspace_files,
            save_workspace_file,
            delete_workspace_file,
            read_text_file,
            launch_application,
            open_website,
            detect_browsers,
            open_file_path,
            open_folder_path,
            reveal_in_explorer,
            run_command,
            is_process_running,
            kill_process,
            list_monitors,
            load_settings,
            save_settings,
            load_aux,
            save_aux,
            list_start_menu_apps,
            export_workspace_file,
            inspect_workspace_file,
            export_backup,
            refresh_tray,
            pick_app_file,
            pick_generic_file,
            pick_save_file,
            send_notification,
            set_autostart,
            set_global_hotkey,
            minimize_main_window,
            set_tray_visible
        ])
        .setup(|app| {
            // Tray (created once; visibility controlled from frontend via window hide + autostart settings)
            use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
            use tauri::tray::TrayIconBuilder;
            let open_item = MenuItemBuilder::with_id("open", "Open Open Workspace").build(app)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = PredefinedMenuItem::quit(app, None)?;
            let menu = MenuBuilder::new(app).item(&open_item).item(&sep).item(&quit).build()?;
            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("Open Workspace")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    if id == "open" {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    } else if let Some(rest) = id.strip_prefix("launch:") {
                        if let Some(w) = app.get_webview_window("main") {
                            use tauri::Emitter;
                            let _ = w.emit("tray-launch-workspace", rest.to_string());
                            let _ = w.show();
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::TrayIconEvent;
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;
            // Hide tray icon by default? Tauri always shows once built; frontend will remove/hide
            // based on settings by destroying? Keep visible but lightweight — frontend can leave it;
            // visibility toggle handled via `tray.set_visible`.
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close to tray if enabled? We check settings file quickly (best effort, cached in frontend).
            // Default: close minimizes to tray only when setting enabled; simplest: hide on close
            // if tray enabled flag file exists. Frontend writes `ui.json` with closeToTray.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let flag = base_dir()
                    .ok()
                    .and_then(|d| std::fs::read_to_string(d.join("ui.json")).ok())
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                    .and_then(|v| v.get("closeToTray").and_then(|b| b.as_bool()).unwrap_or(false).into());
                if flag == Some(true) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Open Workspace");
}
