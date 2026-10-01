// Professional inline SVG icon library (Lucide-style, MIT-inspired, stroke-based).
// No emojis. Consistent 24x24 stroke icons.
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.35.94a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.39 2.53a7 7 0 0 0-2.42 1.4l-2.35-.94-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.35-.94a7 7 0 0 0 2.42 1.4l.39 2.53h3.4l.39-2.53a7 7 0 0 0 2.42-1.4l2.35.94 2-3.46-2-1.55c.1-.46.14-.93.14-1.4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m13.5 6.5 3 3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
  note: '<path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9.5V14M12 17.2v.3"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  external: '<path d="M14 4h6v6M20 4 10 14"/><path d="M20 14v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  upload: '<path d="M12 15V3m0 0 4 4m-4-4L8 7"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.3"/>',
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4"/>',
  briefcase: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  gamepad: '<path d="M7 8h10a5 5 0 0 1 5 5c0 2.5-2 4.5-4.2 4.5-.9 0-1.7-.4-2.3-1L14 15H10l-1.5 1.5c-.6.6-1.4 1-2.3 1C4 17.5 2 15.5 2 13a5 5 0 0 1 5-5z"/><path d="M7 11v3M5.5 12.5h3M16 11.5h.01M17.5 13.5h.01"/>',
  music: '<circle cx="7" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path d="M10 18V5l10-2v13"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-4.5-4.5L9 19"/>',
  wifi: '<path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0M12 19.5v.3"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  grad: '<path d="m12 4 10 5-10 5L2 9z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>',
  shield: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/><path d="m9.5 12 2 2 3.5-4"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  minimize: '<path d="M5 12h14"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  history: '<path d="M3 12a9 9 0 1 1 3 6.7M3 12V7m0 5h5"/><path d="M12 8v4l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  lang: '<path d="M4 5h9M8.5 3v2c0 4-2.5 7-5.5 8.5M6 9c1.5 2.5 4 4.5 6.5 5.5"/><path d="m13 21 4.5-10L22 21M14.7 17h5.6"/>',
  tray: '<rect x="3" y="13" width="18" height="8" rx="2"/><path d="M9 13V9h6v4M12 9V5"/>',
  window: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16"/>',
  snapshot: '<path d="M4 8h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/><path d="M18 5.5v.3"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11 12 9-9M17 4l3 3M14 7l3 3"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M17.5 14.5A6.5 6.5 0 0 1 21.5 20"/>',
};

export function icon(name, size = 18) {
  const inner = P[name] || P.grid;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Workspace icon choices grouped by category (icon key + label key hint)
export const WORKSPACE_ICONS = {
  Development: ["code", "terminal", "cpu", "zap"],
  Education: ["grad", "book", "lang"],
  Work: ["briefcase", "users", "lock"],
  Gaming: ["gamepad", "zap", "trophy"],
  Media: ["music", "image", "camera"],
  Files: ["folder", "file", "note"],
  Internet: ["globe", "wifi", "link"],
  System: ["settings", "monitor", "cpu", "shield", "window"],
  Custom: ["star", "heart", "home"],
};
// add missing keys used above
P.trophy = '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H4a1 1 0 0 0-1 1c0 2.5 2 4.5 5 4.5M16 5h4a1 1 0 0 1 1 1c0 2.5-2 4.5-5 4.5M12 13v4M8 20h8M10 17h4"/>';
P.heart = '<path d="M12 20s-7.5-4.7-9.3-9.3C1.5 7.6 3.6 4.5 6.8 4.5c2 0 3.7 1.1 5.2 3 1.5-1.9 3.2-3 5.2-3 3.2 0 5.3 3.1 4.1 6.2C19.5 15.3 12 20 12 20z"/>';

export const ACCENTS = [
  { name: "Blue", value: "#4d7cfe" },
  { name: "Green", value: "#34c98e" },
  { name: "Purple", value: "#9a6bff" },
  { name: "Amber", value: "#f5a524" },
  { name: "Rose", value: "#f4516c" },
  { name: "Cyan", value: "#22c3d6" },
  { name: "Slate", value: "#8b93a7" },
];
