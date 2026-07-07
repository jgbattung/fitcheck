import type { AppState, Room } from "./types";
import { uid } from "./types";
import { wallLength } from "./geometry";

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
    openings: [],
    items: [],
  };
}

export function seedState(): AppState {
  const vertices = [
    { x: 0, y: 0 },
    { x: 150, y: 0 },
    { x: 150, y: 99 },
    { x: 260, y: 99 },
    { x: 260, y: 270 },
    { x: 0, y: 270 },
  ];
  const room: Room = {
    id: uid(),
    name: "Home Office",
    vertices,
    openings: [
      // segment 4: (260,270) -> (0,270), the 260 cm bottom wall
      { id: uid(), wallIndex: 4, offset: 0, length: wallLength(vertices, 4), kind: "window" },
      // segment 1: (150,0) -> (150,99), the notch gap top-right
      { id: uid(), wallIndex: 1, offset: 0, length: wallLength(vertices, 1), kind: "door" },
    ],
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
  return { version: 2, rooms: [room], currentRoomId: room.id };
}
