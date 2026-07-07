export interface Pt {
  x: number;
  y: number;
}

export interface Opening {
  id: string;
  /** index of the wall this opening lives on; wall i runs vertices[i] -> vertices[(i+1)%n] */
  wallIndex: number;
  /** cm along the wall from its start vertex (vertices[wallIndex]) */
  offset: number;
  /** cm length of the opening along the wall */
  length: number;
  kind: "window" | "door";
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
  openings: Opening[];
  items: Item[];
}

export interface AppState {
  version: 2;
  rooms: Room[];
  currentRoomId: string;
}

export type FitStatus = "ok" | "overlap" | "collide";

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
}
