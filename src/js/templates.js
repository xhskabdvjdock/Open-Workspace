// Built-in workspace templates. Config only — never installs software.
export function templateList() {
  return [
    { key: "developer", nameKey: "developer", icon: "code", accent: "#4d7cfe" },
    { key: "student", nameKey: "student", icon: "grad", accent: "#34c98e" },
    { key: "gaming", nameKey: "gaming", icon: "gamepad", accent: "#9a6bff" },
    { key: "creator", nameKey: "creator", icon: "image", accent: "#f5a524" },
    { key: "office", nameKey: "office", icon: "briefcase", accent: "#22c3d6" },
    { key: "cyber", nameKey: "cyber", icon: "shield", accent: "#f4516c" },
  ];
}

export function templates(key) {
  const T = {
    developer: {
      name: "Developer",
      description: "My development environment",
      icon: "code", accent: "#4d7cfe", group: "Development",
      apps: [
        { name: "Visual Studio Code", path: "%USERPROFILE%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", args: "", cwd: "%USERPROFILE%\\Documents\\Projects", order: 1, delaySec: 0, minimized: false },
        { name: "Windows Terminal", path: "wt.exe", args: "", cwd: "%USERPROFILE%\\Documents\\Projects", order: 2, delaySec: 1, minimized: false },
      ],
      websites: [
        { name: "GitHub", url: "https://github.com", browser: "default", order: 1 },
        { name: "Documentation", url: "https://developer.mozilla.org", browser: "default", order: 2 },
        { name: "Localhost", url: "http://localhost:3000", browser: "default", order: 3 },
      ],
      files: [
        { name: "Projects", path: "%USERPROFILE%\\Documents\\Projects", kind: "folder", order: 1 },
      ],
      commands: [
        { name: "Dev server", shell: "powershell", command: "npm run dev", cwd: "%USERPROFILE%\\Documents\\Projects", order: 1, behavior: "keepopen" },
      ],
      notes: "Run:\nnpm install\n\nStart:\nnpm run dev\n",
    },
    student: {
      name: "Student",
      description: "Study environment",
      icon: "grad", accent: "#34c98e", group: "School",
      apps: [{ name: "Browser", path: "", args: "", cwd: "", order: 1, delaySec: 0, minimized: false }],
      websites: [
        { name: "University Portal", url: "https://example.edu", browser: "default", order: 1 },
        { name: "Google Drive", url: "https://drive.google.com", browser: "default", order: 2 },
      ],
      files: [{ name: "Documents", path: "%USERPROFILE%\\Documents", kind: "folder", order: 1 }],
      commands: [],
      notes: "Study checklist:\n- Lectures\n- Assignments\n- Review notes\n",
    },
    gaming: {
      name: "Gaming",
      description: "Minimal gaming setup",
      icon: "gamepad", accent: "#9a6bff", group: "",
      apps: [{ name: "Discord", path: "%USERPROFILE%\\AppData\\Local\\Discord\\Update.exe", args: "--processStart Discord.exe", cwd: "", order: 1, delaySec: 0, minimized: true }],
      websites: [], files: [], commands: [],
      notes: "Close background apps before playing.\n",
    },
    creator: {
      name: "Content Creator",
      description: "Editing environment",
      icon: "image", accent: "#f5a524", group: "",
      apps: [], websites: [{ name: "Stock assets", url: "https://unsplash.com", browser: "default", order: 1 }],
      files: [{ name: "Assets", path: "%USERPROFILE%\\Videos\\Assets", kind: "folder", order: 1 }],
      commands: [], notes: "Projects:\n- Episode drafts\n- Thumbnails\n",
    },
    office: {
      name: "Office",
      description: "Daily office environment",
      icon: "briefcase", accent: "#22c3d6", group: "Work",
      apps: [],
      websites: [
        { name: "Mail", url: "https://outlook.office.com", browser: "default", order: 1 },
        { name: "Calendar", url: "https://calendar.google.com", browser: "default", order: 2 },
      ],
      files: [{ name: "Documents", path: "%USERPROFILE%\\Documents", kind: "folder", order: 1 }],
      commands: [], notes: "",
    },
    cyber: {
      name: "Cybersecurity",
      description: "My cybersecurity study environment",
      icon: "shield", accent: "#f4516c", group: "School",
      apps: [{ name: "Windows Terminal", path: "wt.exe", args: "", cwd: "%USERPROFILE%\\Documents\\Labs", order: 1, delaySec: 0, minimized: false }],
      websites: [
        { name: "TryHackMe", url: "https://tryhackme.com", browser: "default", order: 1 },
        { name: "Documentation", url: "https://docs.metasploit.com", browser: "default", order: 2 },
      ],
      files: [{ name: "Labs", path: "%USERPROFILE%\\Documents\\Labs", kind: "folder", order: 1 }],
      commands: [{ name: "Lab shell", shell: "powershell", command: "git status", cwd: "%USERPROFILE%\\Documents\\Labs", order: 1, behavior: "keepopen" }],
      notes: "Lab notes:\n- Targets\n- Commands used\n- Findings\n",
    },
  };
  return T[key] || null;
}
