import type { AppState, Item, Opening, Person, Pt, Room } from "./types";
import { uid } from "./types";
import { clampOpening, wallLength } from "./geometry";

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

function isOpening(v: unknown, wallCount: number): v is Opening {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Opening;
  return (
    typeof o.id === "string" &&
    Number.isInteger(o.wallIndex) &&
    o.wallIndex >= 0 &&
    o.wallIndex < wallCount &&
    Number.isFinite(o.offset) &&
    o.offset >= 0 &&
    Number.isFinite(o.length) &&
    o.length > 0 &&
    (o.kind === "window" || o.kind === "door")
  );
}

function isPerson(v: unknown): v is Person {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Person;
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    typeof p.visible === "boolean"
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
    Array.isArray(r.openings) &&
    r.openings.every((o) => isOpening(o, r.vertices.length)) &&
    Array.isArray(r.items) &&
    r.items.every(isItem) &&
    (r.person === undefined || isPerson(r.person))
  );
}

/** Migrates a legacy (v1) room with `wallTags` into the v2 `openings` shape. Idempotent for v2 rooms. */
function migrateRoom(raw: any): any {
  if (raw && typeof raw === "object" && Array.isArray(raw.openings)) {
    return raw;
  }
  const vertices = raw?.vertices;
  const wallTags = raw?.wallTags;
  const openings: Opening[] = [];
  if (wallTags && typeof wallTags === "object" && Array.isArray(vertices)) {
    for (const key of Object.keys(wallTags)) {
      const wallIndex = Number(key);
      if (!Number.isInteger(wallIndex) || wallIndex < 0 || wallIndex >= vertices.length) {
        continue;
      }
      const tag = wallTags[key];
      const len = wallLength(vertices, wallIndex);
      openings.push(
        clampOpening(
          {
            id: uid(),
            wallIndex,
            offset: 0,
            length: len,
            kind: tag?.isDoor ? "door" : "window",
          },
          len,
        ),
      );
    }
  }
  const { wallTags: _wallTags, ...rest } = raw ?? {};
  return { ...rest, openings };
}

export function validateState(v: unknown): AppState | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as AppState;
  if (!Array.isArray(s.rooms) || s.rooms.length === 0) return null;
  const rooms = s.rooms.map(migrateRoom);
  if (!rooms.every(isRoom)) return null;
  const currentRoomId = rooms.some((r) => r.id === s.currentRoomId)
    ? s.currentRoomId
    : rooms[0].id;
  return { version: 2, rooms, currentRoomId };
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
