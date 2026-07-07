import type { AppState, Room } from "./types";
import { uid } from "./types";

export const ITEM_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f472b6",
  "#4ade80",
];

export function makeRoom(name: string): Room {
  return {
    id: uid(),
    name,
    vertices: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ],
    wallTags: {},
    items: [],
  };
}

export function seedState(): AppState {
  const room: Room = {
    id: uid(),
    name: "Home Office",
    vertices: [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 99 },
      { x: 260, y: 99 },
      { x: 260, y: 270 },
      { x: 0, y: 270 },
    ],
    wallTags: {
      // segment 4: (260,270) -> (0,270), the 260 cm bottom wall
      4: { label: "Window", color: "#38bdf8" },
      // segment 1: (150,0) -> (150,99), the notch gap top-right
      1: { label: "Door", color: "#f59e0b", isDoor: true },
    },
    items: [
      {
        id: uid(),
        name: "Desk",
        width: 122,
        depth: 61,
        x: 75,
        y: 238,
        rotation: 0,
        color: "#38bdf8",
      },
      {
        id: uid(),
        name: "Rack",
        width: 92,
        depth: 10,
        x: 6,
        y: 90,
        rotation: 90,
        color: "#a78bfa",
      },
    ],
  };
  return { version: 1, rooms: [room], currentRoomId: room.id };
}
