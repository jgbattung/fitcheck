export interface Pt {
  x: number;
  y: number;
}

export interface WallTag {
  label: string;
  color: string;
  isDoor?: boolean;
}

export interface Item {
  id: string;
  name: string;
  /** cm */
  width: number;
  /** cm */
  depth: number;
  /** center x, cm */
  x: number;
  /** center y, cm */
  y: number;
  /** degrees */
  rotation: number;
  color: string;
}

export interface Room {
  id: string;
  name: string;
  /** polygon, cm; segment i runs from vertices[i] to vertices[(i+1) % n] */
  vertices: Pt[];
  /** keyed by segment index */
  wallTags: Record<number, WallTag>;
  items: Item[];
}

export interface AppState {
  version: 1;
  rooms: Room[];
  currentRoomId: string;
}

export type FitStatus = "ok" | "overlap" | "collide";

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
}
