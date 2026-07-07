import { useState } from "react";
import type { FitStatus, Item, Room } from "../types";
import { NumberField, inputCls } from "./ui";

interface Props {
  room: Room;
  selectedId: string | null;
  status: FitStatus[];
  onSelect: (id: string | null) => void;
  onAdd: (name: string, width: number, depth: number) => void;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
}

const STATUS_BADGE: Record<Exclude<FitStatus, "ok">, { text: string; cls: string }> = {
  collide: {
    text: "outside walls",
    cls: "bg-red-500/15 text-red-400 border-red-500/40",
  },
  overlap: {
    text: "overlaps",
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  },
};

export default function ItemsPanel({
  room,
  selectedId,
  status,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [w, setW] = useState("");
  const [d, setD] = useState("");

  const add = () => {
    const width = parseFloat(w);
    const depth = parseFloat(d);
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0)
      return;
    onAdd(name.trim() || "Item", width, depth);
    setName("");
    setW("");
    setD("");
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          Add item
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputCls} min-w-0 flex-1 basis-32`}
            placeholder="Name"
            aria-label="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            inputMode="decimal"
            min={1}
            className={`${inputCls} w-20 font-mono`}
            placeholder="W cm"
            aria-label="Width in cm"
            value={w}
            onChange={(e) => setW(e.target.value)}
          />
          <input
            type="number"
            inputMode="decimal"
            min={1}
            className={`${inputCls} w-20 font-mono`}
            placeholder="D cm"
            aria-label="Depth in cm"
            value={d}
            onChange={(e) => setD(e.target.value)}
          />
          <button
            type="submit"
            className="cursor-pointer rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          >
            Add
          </button>
        </div>
      </form>

      {room.items.length === 0 && (
        <p className="px-1 text-sm text-slate-500">
          No items yet - add one above, then drag it on the canvas.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {room.items.map((item, i) => {
          const selected = item.id === selectedId;
          const st = status[i];
          return (
            <li
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`cursor-pointer rounded-lg border p-3 transition-colors duration-150 ${
                selected
                  ? "border-sky-500 bg-sky-500/10"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${item.name} color`}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  value={item.color}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onUpdate(item.id, { color: e.target.value })}
                />
                <input
                  className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-medium text-slate-100 outline-none focus-visible:bg-slate-800"
                  aria-label="Item name"
                  value={item.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                />
                {st !== "ok" && (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_BADGE[st].cls}`}
                  >
                    {STATUS_BADGE[st].text}
                  </span>
                )}
                <button
                  aria-label={`Delete ${item.name}`}
                  className="shrink-0 cursor-pointer rounded p-1 text-slate-500 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <div
                className="grid grid-cols-3 gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  W (cm)
                  <NumberField
                    aria-label={`${item.name} width`}
                    value={item.width}
                    min={1}
                    onCommit={(width) => onUpdate(item.id, { width })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  D (cm)
                  <NumberField
                    aria-label={`${item.name} depth`}
                    value={item.depth}
                    min={1}
                    onCommit={(depth) => onUpdate(item.id, { depth })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Rotation (°)
                  <NumberField
                    aria-label={`${item.name} rotation`}
                    value={item.rotation}
                    onCommit={(rot) =>
                      onUpdate(item.id, { rotation: ((rot % 360) + 360) % 360 })
                    }
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
