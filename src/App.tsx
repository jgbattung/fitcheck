import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Item, Opening, Pt, Room } from "./types";
import { uid } from "./types";
import { analyzeRoom, clampOpening, midpoint, polygonBBox, wallLength } from "./geometry";
import { ITEM_COLORS, makeRoom, seedState } from "./seed";
import { exportToFile, importFromFile, loadState, saveState } from "./storage";
import {
  mintSpaceCode,
  pullSpace,
  pushSpace,
  readSpaceCode,
  writeSpaceCodeToUrl,
  clearSpaceCodeFromUrl,
  SPACE_POLL_MS,
  SPACE_PUSH_DEBOUNCE_MS,
  type SpaceEnvelope,
} from "./sync";
import CanvasView from "./components/CanvasView";
import ItemsPanel from "./components/ItemsPanel";
import RoomPanel from "./components/RoomPanel";
import { SyncControl, SyncNudge, type SyncStatus } from "./components/SyncBar";

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? seedState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editShape, setEditShape] = useState(false);
  const [snapAngle, setSnapAngle] = useState(false);
  const [tab, setTab] = useState<"items" | "room">("items");
  const fileRef = useRef<HTMLInputElement>(null);

  // ----- shared sync (opt-in via ?s=<code>) -----
  const [syncCode, setSyncCode] = useState<string | null>(() => readSpaceCode());
  const [baseRev, setBaseRev] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [remoteAhead, setRemoteAhead] = useState<SpaceEnvelope | null>(null);
  const justAppliedRemoteRef = useRef(false);
  const spaceInitRef = useRef(false);

  const room =
    state.rooms.find((r) => r.id === state.currentRoomId) ?? state.rooms[0];

  const analysis = useMemo(() => analyzeRoom(room), [room]);

  // Autosave backup to localStorage (export/import JSON is the real save system).
  useEffect(() => {
    const t = setTimeout(() => saveState(state), 400);
    return () => clearTimeout(t);
  }, [state]);

  // On mount (or when a code is minted), pull its state (or seed it as rev 0).
  // spaceInitRef gates the push effect below so it cannot race this initial
  // pull-or-push with a duplicate push of the pre-sync local state.
  useEffect(() => {
    if (!syncCode) return;
    spaceInitRef.current = false;
    let cancelled = false;
    pullSpace(syncCode).then((envelope) => {
      if (cancelled) return;
      if (envelope) {
        justAppliedRemoteRef.current = true;
        setState(envelope.state);
        setBaseRev(envelope.rev);
        setSyncStatus("synced");
        spaceInitRef.current = true;
      } else {
        pushSpace(syncCode, 0, state).then((result) => {
          if (cancelled) return;
          if ("ok" in result) {
            setBaseRev(result.rev);
            setSyncStatus("synced");
          } else if ("conflict" in result) {
            setRemoteAhead(result.envelope);
          } else {
            setSyncStatus("offline");
          }
          spaceInitRef.current = true;
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // Intentionally run only when the space code changes, not on every state edit.
  }, [syncCode]);

  // Push local edits to the space, debounced. Skips the echo right after a
  // remote apply so pulling doesn't immediately trigger a push of the same data.
  useEffect(() => {
    if (!syncCode) return;
    if (!spaceInitRef.current) return;
    if (justAppliedRemoteRef.current) {
      justAppliedRemoteRef.current = false;
      return;
    }
    setSyncStatus("syncing");
    const t = setTimeout(() => {
      pushSpace(syncCode, baseRev, state).then((result) => {
        if ("ok" in result) {
          setBaseRev(result.rev);
          setSyncStatus("synced");
        } else if ("conflict" in result) {
          setRemoteAhead(result.envelope);
        } else {
          setSyncStatus("offline");
        }
      });
    }, SPACE_PUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state, syncCode]);

  // Poll the space for edits made on another device.
  useEffect(() => {
    if (!syncCode) return;
    const id = setInterval(() => {
      pullSpace(syncCode).then((envelope) => {
        if (envelope && envelope.rev > baseRev) {
          setRemoteAhead(envelope);
        }
      });
    }, SPACE_POLL_MS);
    return () => clearInterval(id);
  }, [syncCode, baseRev]);

  function shareSpace() {
    const code = mintSpaceCode();
    writeSpaceCodeToUrl(code);
    // The new code has never been pushed, so the init effect's pull will 404
    // and push the current local state as revision 0 for us.
    setSyncCode(code);
  }

  function leaveSpace() {
    clearSpaceCodeFromUrl();
    setSyncCode(null);
    setBaseRev(0);
    setSyncStatus("idle");
    setRemoteAhead(null);
  }

  function reloadFromRemote() {
    if (!remoteAhead) return;
    // remoteAhead.state is already validated (pullSpace/pushSpace run it
    // through validateState before it ever reaches this component).
    justAppliedRemoteRef.current = true;
    setState(remoteAhead.state);
    setBaseRev(remoteAhead.rev);
    setSyncStatus("synced");
    setRemoteAhead(null);
  }

  function patchRoom(fn: (r: Room) => Room) {
    setState((s) => ({
      ...s,
      rooms: s.rooms.map((r) => (r.id === room.id ? fn(r) : r)),
    }));
  }

  // ----- items -----

  function updateItem(id: string, patch: Partial<Item>) {
    patchRoom((r) => ({
      ...r,
      items: r.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }

  function addItem(name: string, width: number, depth: number) {
    const bb = polygonBBox(room.vertices);
    const c = midpoint({ x: bb.minX, y: bb.minY }, { x: bb.maxX, y: bb.maxY });
    const item: Item = {
      id: uid(),
      name,
      width,
      depth,
      x: Math.round(c.x),
      y: Math.round(c.y),
      rotation: 0,
      color: ITEM_COLORS[room.items.length % ITEM_COLORS.length],
    };
    patchRoom((r) => ({ ...r, items: [...r.items, item] }));
    setSelectedId(item.id);
  }

  function deleteItem(id: string) {
    patchRoom((r) => ({ ...r, items: r.items.filter((it) => it.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  // ----- room shape -----

  function setVertices(verts: Pt[]) {
    patchRoom((r) => ({ ...r, vertices: verts }));
  }

  function setVertex(vi: number, p: Pt) {
    patchRoom((r) => ({
      ...r,
      vertices: r.vertices.map((v, i) => (i === vi ? p : v)),
    }));
  }

  /** Split segment `i` at its midpoint; openings on later segments shift up. */
  function insertVertex(i: number) {
    patchRoom((r) => {
      const n = r.vertices.length;
      const m = midpoint(r.vertices[i], r.vertices[(i + 1) % n]);
      const vertices = [...r.vertices];
      vertices.splice(i + 1, 0, { x: Math.round(m.x), y: Math.round(m.y) });
      const openings = r.openings.map((o) =>
        o.wallIndex > i
          ? { ...o, wallIndex: o.wallIndex + 1 }
          : o.wallIndex === i
            ? clampOpening(o, wallLength(vertices, i))
            : o,
      );
      return { ...r, vertices, openings };
    });
  }

  /** Remove vertex `vi`; the two walls it joined merge, their openings drop. */
  function removeVertex(vi: number) {
    patchRoom((r) => {
      const n = r.vertices.length;
      if (n <= 3) return r;
      const prevSeg = (vi - 1 + n) % n;
      const openings = r.openings
        .filter((o) => o.wallIndex !== vi && o.wallIndex !== prevSeg)
        .map((o) => ({
          ...o,
          wallIndex: o.wallIndex > vi ? o.wallIndex - 1 : o.wallIndex,
        }));
      return {
        ...r,
        vertices: r.vertices.filter((_, i) => i !== vi),
        openings,
      };
    });
  }

  // ----- openings -----

  function addOpening(draft: Omit<Opening, "id">) {
    patchRoom((r) => ({
      ...r,
      openings: [
        ...r.openings,
        clampOpening({ ...draft, id: uid() }, wallLength(r.vertices, draft.wallIndex)),
      ],
    }));
  }

  function updateOpening(id: string, patch: Partial<Opening>) {
    patchRoom((r) => ({
      ...r,
      openings: r.openings.map((o) => {
        if (o.id !== id) return o;
        const merged = { ...o, ...patch };
        return clampOpening(merged, wallLength(r.vertices, merged.wallIndex));
      }),
    }));
  }

  function deleteOpening(id: string) {
    patchRoom((r) => ({ ...r, openings: r.openings.filter((o) => o.id !== id) }));
  }

  // ----- person scale reference -----

  function togglePerson() {
    patchRoom((r) => {
      if (r.person) {
        return { ...r, person: { ...r.person, visible: !r.person.visible } };
      }
      const bb = polygonBBox(r.vertices);
      const c = midpoint({ x: bb.minX, y: bb.minY }, { x: bb.maxX, y: bb.maxY });
      return {
        ...r,
        person: { x: Math.round(c.x), y: Math.round(c.y), visible: true },
      };
    });
  }

  function movePerson(x: number, y: number) {
    patchRoom((r) => (r.person ? { ...r, person: { ...r.person, x, y } } : r));
  }

  // ----- rooms -----

  function switchRoom(id: string) {
    setState((s) => ({ ...s, currentRoomId: id }));
    setSelectedId(null);
    setEditShape(false);
  }

  function newRoom() {
    const r = makeRoom(`Room ${state.rooms.length + 1}`);
    setState((s) => ({ ...s, rooms: [...s.rooms, r], currentRoomId: r.id }));
    setSelectedId(null);
    setEditShape(false);
  }

  function deleteRoom() {
    if (state.rooms.length <= 1) return;
    if (!window.confirm(`Delete room "${room.name}" and its items?`)) return;
    setState((s) => {
      const rooms = s.rooms.filter((r) => r.id !== room.id);
      return { ...s, rooms, currentRoomId: rooms[0].id };
    });
    setSelectedId(null);
    setEditShape(false);
  }

  // ----- import / export -----

  function onImportFile(file: File) {
    importFromFile(file)
      .then((imported) => {
        setState(imported);
        setSelectedId(null);
        setEditShape(false);
      })
      .catch((err: unknown) => {
        window.alert(
          err instanceof Error ? err.message : "Could not read that file.",
        );
      });
  }

  const toggleCls = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none ${
      active
        ? "border-sky-400 bg-sky-500/20 text-sky-300"
        : "border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500"
    }`;

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="mr-1 text-sm font-semibold tracking-tight text-sky-400">
          FitCheck
        </span>
        <select
          aria-label="Current room"
          className="min-w-0 flex-1 cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus-visible:border-sky-500 sm:max-w-56"
          value={room.id}
          onChange={(e) => switchRoom(e.target.value)}
        >
          {state.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          aria-label="New room"
          title="New room"
          className="cursor-pointer rounded-md border border-slate-700 p-1.5 text-slate-300 transition-colors duration-200 hover:border-slate-500 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          onClick={newRoom}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="mx-1 hidden h-5 w-px bg-slate-800 sm:block" />
        <button
          className="cursor-pointer rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition-colors duration-200 hover:border-slate-500 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          onClick={() => exportToFile(state)}
        >
          Export
        </button>
        <button
          className="cursor-pointer rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition-colors duration-200 hover:border-slate-500 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          onClick={() => fileRef.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = "";
          }}
        />
        <div className="mx-1 hidden h-5 w-px bg-slate-800 sm:block" />
        <SyncControl
          syncCode={syncCode}
          syncStatus={syncStatus}
          remoteAhead={remoteAhead !== null}
          onShare={shareSpace}
          onLeave={leaveSpace}
        />
      </header>

      {remoteAhead && (
        <SyncNudge onReload={reloadFromRemote} onDismiss={() => setRemoteAhead(null)} />
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="relative h-[50dvh] shrink-0 bg-[#060b16] lg:h-auto lg:min-h-0 lg:flex-1">
          <CanvasView
            room={room}
            selectedId={selectedId}
            editShape={editShape}
            snapAngle={snapAngle}
            onSelect={setSelectedId}
            onCommitItem={updateItem}
            onCommitVertices={setVertices}
            onCommitOpening={updateOpening}
            onCommitPerson={(p) => movePerson(p.x, p.y)}
          />
          <div className="absolute top-2 left-2 flex gap-2">
            <button
              className={toggleCls(editShape)}
              onClick={() => setEditShape((v) => !v)}
            >
              Edit shape
            </button>
            <button
              className={toggleCls(snapAngle)}
              onClick={() => setSnapAngle((v) => !v)}
              title="Snap rotation to 15° (or hold Shift while rotating)"
            >
              Snap 15°
            </button>
          </div>
        </main>

        <aside className="min-h-0 flex-1 overflow-y-auto border-t border-slate-800 lg:w-[380px] lg:flex-none lg:border-t-0 lg:border-l">
          <div className="sticky top-0 z-10 flex gap-1 border-b border-slate-800 bg-slate-950/95 px-3 pt-2 pb-0 backdrop-blur">
            {(["items", "room"] as const).map((t) => (
              <button
                key={t}
                className={`cursor-pointer rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none ${
                  tab === t
                    ? "border-b-2 border-sky-400 text-sky-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                onClick={() => setTab(t)}
              >
                {t === "items" ? `Items (${room.items.length})` : "Room"}
              </button>
            ))}
          </div>
          <div className="px-3 pt-4 pb-40 lg:pb-12">
            {tab === "items" ? (
              <ItemsPanel
                room={room}
                selectedId={selectedId}
                status={analysis.status}
                onSelect={setSelectedId}
                onAdd={addItem}
                onUpdate={updateItem}
                onDelete={deleteItem}
              />
            ) : (
              <RoomPanel
                room={room}
                editShape={editShape}
                canDelete={state.rooms.length > 1}
                onRename={(name) => patchRoom((r) => ({ ...r, name }))}
                onToggleEditShape={() => setEditShape((v) => !v)}
                onSetVertex={setVertex}
                onInsertVertex={insertVertex}
                onRemoveVertex={removeVertex}
                onAddOpening={addOpening}
                onUpdateOpening={updateOpening}
                onDeleteOpening={deleteOpening}
                onDeleteRoom={deleteRoom}
                onTogglePerson={togglePerson}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
