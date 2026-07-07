import type { AppState, Item, Pt, Room } from "./types";

const KEY = "fitcheck:v1";

function isPt(v: unknown): v is Pt {
  return (
    typeof v === "object" &&
    v !== null &&
    Number.isFinite((v as Pt).x) &&
    Number.isFinite((v as Pt).y)
  );
}

function isItem(v: unknown): v is Item {
  if (typeof v !== "object" || v === null) return false;
  const it = v as Item;
  return (
    typeof it.id === "string" &&
    typeof it.name === "string" &&
    Number.isFinite(it.width) &&
    Number.isFinite(it.depth) &&
    Number.isFinite(it.x) &&
    Number.isFinite(it.y) &&
    Number.isFinite(it.rotation) &&
    typeof it.color === "string"
  );
}

function isRoom(v: unknown): v is Room {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Room;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    Array.isArray(r.vertices) &&
    r.vertices.length >= 3 &&
    r.vertices.every(isPt) &&
    typeof r.wallTags === "object" &&
    r.wallTags !== null &&
    Array.isArray(r.items) &&
    r.items.every(isItem)
  );
}

export function validateState(v: unknown): AppState | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as AppState;
  if (!Array.isArray(s.rooms) || s.rooms.length === 0) return null;
  if (!s.rooms.every(isRoom)) return null;
  const currentRoomId = s.rooms.some((r) => r.id === s.currentRoomId)
    ? s.currentRoomId
    : s.rooms[0].id;
  return { version: 1, rooms: s.rooms, currentRoomId };
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return validateState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable - autosave is best-effort
  }
}

export function exportToFile(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fitcheck-layout.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromFile(file: File): Promise<AppState> {
  return file.text().then((text) => {
    const state = validateState(JSON.parse(text));
    if (!state) throw new Error("Not a valid FitCheck layout file.");
    return state;
  });
}
