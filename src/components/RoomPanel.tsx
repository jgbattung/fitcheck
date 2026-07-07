import { useState } from "react";
import type { Opening, Pt, Room } from "../types";
import { segLength, wallLength } from "../geometry";
import { NumberField, inputCls } from "./ui";

interface Props {
  room: Room;
  editShape: boolean;
  canDelete: boolean;
  onRename: (name: string) => void;
  onToggleEditShape: () => void;
  onSetVertex: (vi: number, p: Pt) => void;
  onInsertVertex: (afterSegment: number) => void;
  onRemoveVertex: (vi: number) => void;
  onAddOpening: (draft: Omit<Opening, "id">) => void;
  onUpdateOpening: (id: string, patch: Partial<Opening>) => void;
  onDeleteOpening: (id: string) => void;
  onDeleteRoom: () => void;
  onTogglePerson: () => void;
}

const OPENING_COLOR: Record<Opening["kind"], string> = {
  window: "#38bdf8",
  door: "#f59e0b",
};

export default function RoomPanel({
  room,
  editShape,
  canDelete,
  onRename,
  onToggleEditShape,
  onSetVertex,
  onInsertVertex,
  onRemoveVertex,
  onAddOpening,
  onUpdateOpening,
  onDeleteOpening,
  onDeleteRoom,
  onTogglePerson,
}: Props) {
  const n = room.vertices.length;

  const [newWall, setNewWall] = useState(0);
  const wallIndex = Math.min(newWall, n - 1);
  const curWallLen = wallLength(room.vertices, wallIndex);
  const [newKind, setNewKind] = useState<Opening["kind"]>("window");
  const [newWidth, setNewWidth] = useState(() =>
    Math.min(90, wallLength(room.vertices, wallIndex)),
  );
  const [newOffset, setNewOffset] = useState(0);

  function selectWall(i: number) {
    setNewWall(i);
    setNewWidth(Math.min(90, wallLength(room.vertices, i)));
    setNewOffset(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        Room name
        <input
          className={`${inputCls} text-sm`}
          aria-label="Room name"
          value={room.name}
          onChange={(e) => onRename(e.target.value)}
        />
      </label>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Shape (cm)
          </p>
          <button
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none ${
              editShape
                ? "border-sky-400 bg-sky-500/20 text-sky-300"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500"
            }`}
            onClick={onToggleEditShape}
          >
            {editShape ? "Done editing" : "Edit on canvas"}
          </button>
        </div>
        <table className="w-full border-separate border-spacing-y-1">
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="w-6 font-normal">#</th>
              <th className="font-normal">X</th>
              <th className="font-normal">Y</th>
              <th className="w-14" />
            </tr>
          </thead>
          <tbody>
            {room.vertices.map((v, vi) => (
              <tr key={vi}>
                <td className="pr-1 font-mono text-xs text-slate-500">{vi + 1}</td>
                <td className="pr-2">
                  <NumberField
                    aria-label={`Vertex ${vi + 1} X`}
                    value={v.x}
                    className="w-full"
                    onCommit={(x) => onSetVertex(vi, { x, y: v.y })}
                  />
                </td>
                <td className="pr-2">
                  <NumberField
                    aria-label={`Vertex ${vi + 1} Y`}
                    value={v.y}
                    className="w-full"
                    onCommit={(y) => onSetVertex(vi, { x: v.x, y })}
                  />
                </td>
                <td>
                  <div className="flex gap-1">
                    <button
                      aria-label={`Insert vertex after ${vi + 1}`}
                      title="Insert vertex on the next wall"
                      className="cursor-pointer rounded p-1 text-slate-400 transition-colors duration-150 hover:bg-sky-500/15 hover:text-sky-300 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                      onClick={() => onInsertVertex(vi)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 5v14M5 12h14"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    <button
                      aria-label={`Remove vertex ${vi + 1}`}
                      disabled={n <= 3}
                      className="cursor-pointer rounded p-1 text-slate-400 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
                      onClick={() => onRemoveVertex(vi)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Walls run from each vertex to the next. Use "Edit on canvas" to drag
          vertices directly.
        </p>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          Openings
        </p>

        <div className="mb-3 flex flex-col gap-2 rounded-md border border-slate-800 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="New opening wall"
              className={`${inputCls} min-w-0 flex-1 basis-32 py-1 text-xs`}
              value={wallIndex}
              onChange={(e) => selectWall(Number(e.target.value))}
            >
              {room.vertices.map((a, i) => {
                const b = room.vertices[(i + 1) % n];
                const len = Math.round(segLength(a, b) * 10) / 10;
                return (
                  <option key={i} value={i}>
                    Wall {i + 1} · {len} cm
                  </option>
                );
              })}
            </select>
            <select
              aria-label="New opening kind"
              className={`${inputCls} py-1 text-xs`}
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as Opening["kind"])}
            >
              <option value="window">Window</option>
              <option value="door">Door</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex flex-1 basis-20 items-center gap-1.5 text-[11px] text-slate-400">
              Width
              <NumberField
                aria-label="New opening width"
                value={newWidth}
                min={0}
                className="w-full"
                onCommit={setNewWidth}
              />
            </label>
            <label className="flex flex-1 basis-20 items-center gap-1.5 text-[11px] text-slate-400">
              Offset
              <NumberField
                aria-label="New opening offset"
                value={newOffset}
                min={0}
                className="w-full"
                onCommit={setNewOffset}
              />
            </label>
            <button
              className="cursor-pointer rounded-md border border-sky-500/40 px-2.5 py-1.5 text-xs text-sky-300 transition-colors duration-200 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              onClick={() =>
                onAddOpening({
                  wallIndex,
                  offset: newOffset,
                  length: newWidth,
                  kind: newKind,
                })
              }
            >
              Add opening
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Wall {wallIndex + 1} is {Math.round(curWallLen * 10) / 10} cm long.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {room.openings.length === 0 && (
            <li className="text-[11px] text-slate-500">No openings yet.</li>
          )}
          {room.openings.map((o) => (
            <li
              key={o.id}
              className="rounded-md border border-slate-800 p-2"
              style={{ borderColor: `${OPENING_COLOR[o.kind]}66` }}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-xs text-slate-400">
                  Wall {o.wallIndex + 1}
                </span>
                <button
                  className="cursor-pointer text-[11px] text-slate-500 transition-colors duration-150 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none"
                  onClick={() => onDeleteOpening(o.id)}
                >
                  Delete
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {(["window", "door"] as const).map((k) => (
                    <button
                      key={k}
                      aria-label={`Set opening ${k}`}
                      className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] capitalize transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none ${
                        o.kind === k
                          ? "border-white text-white"
                          : "border-transparent text-slate-400 opacity-70 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: `${OPENING_COLOR[k]}33` }}
                      onClick={() => onUpdateOpening(o.id, { kind: k })}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <label className="flex flex-1 basis-20 items-center gap-1.5 text-[11px] text-slate-400">
                  Width
                  <NumberField
                    aria-label={`Opening on wall ${o.wallIndex + 1} width`}
                    value={o.length}
                    min={0}
                    className="w-full"
                    onCommit={(length) => onUpdateOpening(o.id, { length })}
                  />
                </label>
                <label className="flex flex-1 basis-20 items-center gap-1.5 text-[11px] text-slate-400">
                  Offset
                  <NumberField
                    aria-label={`Opening on wall ${o.wallIndex + 1} offset`}
                    value={o.offset}
                    min={0}
                    className="w-full"
                    onCommit={(offset) => onUpdateOpening(o.id, { offset })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          Scale reference
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-sky-500"
            checked={room.person?.visible ?? false}
            onChange={onTogglePerson}
          />
          Show person (50 cm)
        </label>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          A 50 cm circle for a standing adult - drag it on the canvas to gauge
          scale. Not counted in fit checks.
        </p>
      </section>

      <button
        disabled={!canDelete}
        className="cursor-pointer self-start rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-400 transition-colors duration-200 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onDeleteRoom}
        title={canDelete ? undefined : "Can't delete the only room"}
      >
        Delete room
      </button>
    </div>
  );
}
