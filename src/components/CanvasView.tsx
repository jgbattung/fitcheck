import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FitStatus, Item, Opening, Pt, Room } from "../types";
import {
  alongWall,
  analyzeRoom,
  clampOpening,
  clearanceToWalls,
  distPointToSeg,
  midpoint,
  normalizeAngle,
  openingSegment,
  outwardNormal,
  polygonBBox,
  rectCorners,
  rectCrossesWalls,
  rectsOverlap,
  segLength,
} from "../geometry";

interface Props {
  room: Room;
  selectedId: string | null;
  editShape: boolean;
  snapAngle: boolean;
  onSelect: (id: string | null) => void;
  onCommitItem: (id: string, patch: Partial<Item>) => void;
  onCommitVertices: (verts: Pt[]) => void;
  onCommitOpening: (id: string, patch: Partial<Opening>) => void;
  onCommitPerson: (p: { x: number; y: number }) => void;
}

type Gesture =
  | {
      type: "move";
      item: Item;
      offX: number;
      offY: number;
      x: number;
      y: number;
      moved: boolean;
    }
  | { type: "rotate"; item: Item; angle0: number; rot0: number; rot: number }
  | { type: "vertex"; vi: number; verts: Pt[]; moved: boolean }
  | {
      type: "opening-move";
      id: string;
      wallIndex: number;
      grabAlong: number;
      offset: number;
      length: number;
      moved: boolean;
    }
  | {
      type: "opening-resize";
      id: string;
      wallIndex: number;
      edge: "start" | "end";
      offset: number;
      length: number;
      moved: boolean;
    };

const STATUS_STYLE = {
  ok: (color: string) => ({ fill: color, stroke: color }),
  overlap: () => ({ fill: "#f59e0b", stroke: "#fbbf24" }),
  collide: () => ({ fill: "#ef4444", stroke: "#f87171" }),
};

function styleFor(item: Item, status: FitStatus) {
  return STATUS_STYLE[status](item.color);
}

function itemTf(x: number, y: number, rot: number): string {
  return `translate(${x} ${y}) rotate(${rot})`;
}

function fmtLen(n: number): string {
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}

function fmtGap(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1);
}

/** Standing adult shoulder width; radius 25 cm. Visual-only, not part of fit-check. */
const PERSON_DIAMETER_CM = 50;

export default function CanvasView({
  room,
  selectedId,
  editShape,
  snapAngle,
  onSelect,
  onCommitItem,
  onCommitVertices,
  onCommitOpening,
  onCommitPerson,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const itemEls = useRef(new Map<string, SVGGElement>());
  const labelEls = useRef(new Map<string, SVGGElement>());
  const rectEls = useRef(new Map<string, SVGRectElement>());
  const vertexEls = useRef(new Map<number, SVGCircleElement>());
  const wallEls = useRef(new Map<number, SVGLineElement>());
  const openingEls = useRef(new Map<string, SVGLineElement>());
  const openingHandleStartEl = useRef<SVGCircleElement>(null);
  const openingHandleEndEl = useRef<SVGCircleElement>(null);
  const floorEl = useRef<SVGPolygonElement>(null);
  const guideLineEl = useRef<SVGLineElement>(null);
  const guideDotEl = useRef<SVGCircleElement>(null);
  const guideTextEl = useRef<SVGTextElement>(null);
  const guideGroupEl = useRef<SVGGElement>(null);
  const personEl = useRef<SVGGElement>(null);
  const personGesture = useRef<{
    offX: number;
    offY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  const [openingSel, setOpeningSel] = useState<string | null>(null);

  const verts = room.vertices;
  const n = verts.length;

  const bbox = useMemo(() => polygonBBox(verts), [verts]);
  const vb = useMemo(() => {
    const extent = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
    const pad = Math.max(40, extent * 0.16);
    return {
      x: bbox.minX - pad,
      y: bbox.minY - pad,
      w: bbox.maxX - bbox.minX + 2 * pad,
      h: bbox.maxY - bbox.minY + 2 * pad,
    };
  }, [bbox]);

  // Rendered px per cm, so on-screen text/handles keep a constant pixel size.
  const [pxPerCm, setPxPerCm] = useState(2);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setPxPerCm(Math.min(r.width / vb.w, r.height / vb.h));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vb.w, vb.h]);

  /** px -> cm (SVG user units) at the current render scale */
  const S = (px: number) => px / pxPerCm;

  // Committed fit analysis for every item.
  const analysis = useMemo(() => analyzeRoom(room), [room]);

  const selectedIdx = room.items.findIndex((it) => it.id === selectedId);
  const selectedItem = selectedIdx >= 0 ? room.items[selectedIdx] : null;

  const committedClearance =
    selectedItem && analysis.status[selectedIdx] !== "collide"
      ? clearanceToWalls(analysis.corners[selectedIdx], verts)
      : null;

  function toSvg(e: { clientX: number; clientY: number }): Pt {
    const svg = svgRef.current!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    );
    return { x: p.x, y: p.y };
  }

  // ----- person drag gesture (standalone: no fit analysis, no bounds clamp) -----

  function personPointerDown(e: React.PointerEvent) {
    if (editShape || !room.person) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toSvg(e);
    personGesture.current = {
      offX: p.x - room.person.x,
      offY: p.y - room.person.y,
      x: room.person.x,
      y: room.person.y,
      moved: false,
    };
  }

  function personPointerMove(e: React.PointerEvent) {
    const g = personGesture.current;
    if (!g) return;
    const p = toSvg(e);
    const x = Math.round(p.x - g.offX);
    const y = Math.round(p.y - g.offY);
    if (x === g.x && y === g.y) return;
    g.x = x;
    g.y = y;
    g.moved = true;
    personEl.current?.setAttribute("transform", `translate(${x} ${y})`);
  }

  function personPointerUp() {
    const g = personGesture.current;
    if (!g) return;
    personGesture.current = null;
    if (g.moved) onCommitPerson({ x: g.x, y: g.y });
  }

  /**
   * Live-update the active item during a gesture: transform + fit colors +
   * clearance guide are written straight to the DOM. No React state changes
   * until pointer release, so the pointer grab is never broken.
   */
  function applyLive(active: Item, x: number, y: number, rot: number) {
    itemEls.current.get(active.id)?.setAttribute("transform", itemTf(x, y, rot));
    labelEls.current.get(active.id)?.setAttribute("transform", `rotate(${-rot})`);

    const liveCorners = rectCorners(x, y, active.width, active.depth, rot);
    const cornersOf = (i: number) =>
      room.items[i].id === active.id ? liveCorners : analysis.corners[i];

    room.items.forEach((it, i) => {
      const ci = cornersOf(i);
      const collide =
        it.id === active.id
          ? rectCrossesWalls(ci, x, y, active.width, active.depth, rot, verts)
          : analysis.collide[i];
      let status: FitStatus = collide ? "collide" : "ok";
      if (!collide) {
        const overlaps = room.items.some(
          (_, j) => j !== i && rectsOverlap(ci, cornersOf(j)),
        );
        if (overlaps) status = "overlap";
      }
      const rectEl = rectEls.current.get(it.id);
      if (rectEl) {
        const s = styleFor(it, status);
        rectEl.setAttribute("fill", s.fill);
        rectEl.setAttribute("stroke", s.stroke);
      }

      if (it.id === active.id && it.id === selectedId && guideGroupEl.current) {
        if (status === "collide") {
          guideGroupEl.current.setAttribute("visibility", "hidden");
        } else {
          const c = clearanceToWalls(liveCorners, verts);
          guideGroupEl.current.setAttribute("visibility", "visible");
          guideLineEl.current?.setAttribute("x1", String(c.from.x));
          guideLineEl.current?.setAttribute("y1", String(c.from.y));
          guideLineEl.current?.setAttribute("x2", String(c.to.x));
          guideLineEl.current?.setAttribute("y2", String(c.to.y));
          guideDotEl.current?.setAttribute("cx", String(c.to.x));
          guideDotEl.current?.setAttribute("cy", String(c.to.y));
          const m = midpoint(c.from, c.to);
          guideTextEl.current?.setAttribute("x", String(m.x + S(8)));
          guideTextEl.current?.setAttribute("y", String(m.y - S(6)));
          if (guideTextEl.current) {
            guideTextEl.current.textContent = `${fmtGap(c.d)} cm`;
          }
        }
      }
    });
  }

  // ----- item move gesture -----

  function itemPointerDown(e: React.PointerEvent, item: Item) {
    if (editShape) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    onSelect(item.id);
    const p = toSvg(e);
    gesture.current = {
      type: "move",
      item,
      offX: p.x - item.x,
      offY: p.y - item.y,
      x: item.x,
      y: item.y,
      moved: false,
    };
  }

  function itemPointerMove(e: React.PointerEvent, item: Item) {
    const g = gesture.current;
    if (!g || g.type !== "move" || g.item.id !== item.id) return;
    const p = toSvg(e);
    const x = Math.round(p.x - g.offX);
    const y = Math.round(p.y - g.offY);
    if (x === g.x && y === g.y) return;
    g.x = x;
    g.y = y;
    g.moved = true;
    applyLive(g.item, x, y, g.item.rotation);
  }

  function itemPointerUp(item: Item) {
    const g = gesture.current;
    if (!g || g.type !== "move" || g.item.id !== item.id) return;
    gesture.current = null;
    if (g.moved) onCommitItem(item.id, { x: g.x, y: g.y });
  }

  // ----- rotate gesture -----

  function rotatePointerDown(e: React.PointerEvent, item: Item) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toSvg(e);
    const angle0 = (Math.atan2(p.y - item.y, p.x - item.x) * 180) / Math.PI;
    gesture.current = {
      type: "rotate",
      item,
      angle0,
      rot0: item.rotation,
      rot: item.rotation,
    };
  }

  function rotatePointerMove(e: React.PointerEvent, item: Item) {
    const g = gesture.current;
    if (!g || g.type !== "rotate" || g.item.id !== item.id) return;
    const p = toSvg(e);
    const angle = (Math.atan2(p.y - item.y, p.x - item.x) * 180) / Math.PI;
    let rot = g.rot0 + (angle - g.angle0);
    rot = e.shiftKey || snapAngle ? Math.round(rot / 15) * 15 : Math.round(rot);
    rot = normalizeAngle(rot);
    if (rot === g.rot) return;
    g.rot = rot;
    applyLive(g.item, g.item.x, g.item.y, rot);
  }

  function rotatePointerUp(item: Item) {
    const g = gesture.current;
    if (!g || g.type !== "rotate" || g.item.id !== item.id) return;
    gesture.current = null;
    if (g.rot !== g.rot0) onCommitItem(item.id, { rotation: g.rot });
  }

  // ----- vertex drag gesture (room shape editing) -----

  function vertexPointerDown(e: React.PointerEvent, vi: number) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gesture.current = {
      type: "vertex",
      vi,
      verts: verts.map((v) => ({ ...v })),
      moved: false,
    };
  }

  function vertexPointerMove(e: React.PointerEvent, vi: number) {
    const g = gesture.current;
    if (!g || g.type !== "vertex" || g.vi !== vi) return;
    const p = toSvg(e);
    const np = { x: Math.round(p.x), y: Math.round(p.y) };
    const cur = g.verts[vi];
    if (np.x === cur.x && np.y === cur.y) return;
    g.verts[vi] = np;
    g.moved = true;
    // Live DOM updates: floor polygon, the two adjacent walls, the handle.
    floorEl.current?.setAttribute(
      "points",
      g.verts.map((v) => `${v.x},${v.y}`).join(" "),
    );
    for (const el of [vertexEls.current.get(vi), e.currentTarget as SVGCircleElement]) {
      el?.setAttribute("cx", String(np.x));
      el?.setAttribute("cy", String(np.y));
    }
    const prev = wallEls.current.get((vi - 1 + n) % n);
    prev?.setAttribute("x2", String(np.x));
    prev?.setAttribute("y2", String(np.y));
    const next = wallEls.current.get(vi);
    next?.setAttribute("x1", String(np.x));
    next?.setAttribute("y1", String(np.y));
  }

  function vertexPointerUp(vi: number) {
    const g = gesture.current;
    if (!g || g.type !== "vertex" || g.vi !== vi) return;
    gesture.current = null;
    if (g.moved) onCommitVertices(g.verts);
  }

  // ----- opening gestures (select, body-drag + re-parent, end-handle resize) -----

  /** Live-write an opening's slice + (if selected) its end handles straight to the DOM. */
  function applyOpeningLive(id: string, o: Opening) {
    const { p1, p2 } = openingSegment(o, verts);
    const el = openingEls.current.get(id);
    el?.setAttribute("x1", String(p1.x));
    el?.setAttribute("y1", String(p1.y));
    el?.setAttribute("x2", String(p2.x));
    el?.setAttribute("y2", String(p2.y));
    if (openingSel === id) {
      openingHandleStartEl.current?.setAttribute("cx", String(p1.x));
      openingHandleStartEl.current?.setAttribute("cy", String(p1.y));
      openingHandleEndEl.current?.setAttribute("cx", String(p2.x));
      openingHandleEndEl.current?.setAttribute("cy", String(p2.y));
    }
  }

  function openingPointerDown(e: React.PointerEvent, o: Opening) {
    if (editShape) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setOpeningSel(o.id);
    const a = verts[o.wallIndex];
    const b = verts[(o.wallIndex + 1) % n];
    gesture.current = {
      type: "opening-move",
      id: o.id,
      wallIndex: o.wallIndex,
      grabAlong: alongWall(toSvg(e), a, b) - o.offset,
      offset: o.offset,
      length: o.length,
      moved: false,
    };
  }

  function openingPointerMove(e: React.PointerEvent, o: Opening) {
    const g = gesture.current;
    if (!g || g.type !== "opening-move" || g.id !== o.id) return;
    const p = toSvg(e);
    const a = verts[g.wallIndex];
    const b = verts[(g.wallIndex + 1) % n];
    const wl = segLength(a, b);
    const along = alongWall(p, a, b);
    const slideOffset = Math.max(0, Math.min(along - g.grabAlong, wl - g.length));

    // Re-parent to the nearest wall if the pointer has drifted onto another one.
    let bestJ = g.wallIndex;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      const { d } = distPointToSeg(p, verts[j], verts[(j + 1) % n]);
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }

    if (bestJ !== g.wallIndex) {
      const na = verts[bestJ];
      const nb = verts[(bestJ + 1) % n];
      const clamped = clampOpening(
        { ...o, wallIndex: bestJ, offset: alongWall(p, na, nb) - g.length / 2, length: g.length },
        segLength(na, nb),
      );
      g.wallIndex = bestJ;
      g.offset = clamped.offset;
      g.length = clamped.length;
    } else {
      g.offset = slideOffset;
    }
    g.moved = true;
    applyOpeningLive(o.id, { ...o, wallIndex: g.wallIndex, offset: g.offset, length: g.length });
  }

  function openingPointerUp(o: Opening) {
    const g = gesture.current;
    if (!g || g.type !== "opening-move" || g.id !== o.id) return;
    gesture.current = null;
    if (g.moved) {
      onCommitOpening(o.id, {
        wallIndex: g.wallIndex,
        offset: g.offset,
        length: g.length,
      });
    }
  }

  function openingResizeDown(e: React.PointerEvent, o: Opening, edge: "start" | "end") {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gesture.current = {
      type: "opening-resize",
      id: o.id,
      wallIndex: o.wallIndex,
      edge,
      offset: o.offset,
      length: o.length,
      moved: false,
    };
  }

  function openingResizeMove(e: React.PointerEvent, o: Opening) {
    const g = gesture.current;
    if (!g || g.type !== "opening-resize" || g.id !== o.id) return;
    const a = verts[g.wallIndex];
    const b = verts[(g.wallIndex + 1) % n];
    const wl = segLength(a, b);
    const along = alongWall(toSvg(e), a, b);
    let offset = g.offset;
    let length = g.length;
    if (g.edge === "end") {
      length = along - g.offset;
    } else {
      const farEnd = g.offset + g.length;
      offset = along;
      length = farEnd - offset;
    }
    const clamped = clampOpening({ ...o, offset, length }, wl);
    g.offset = clamped.offset;
    g.length = clamped.length;
    g.moved = true;
    applyOpeningLive(o.id, { ...o, offset: g.offset, length: g.length });
  }

  function openingResizeUp(o: Opening) {
    const g = gesture.current;
    if (!g || g.type !== "opening-resize" || g.id !== o.id) return;
    gesture.current = null;
    if (g.moved) onCommitOpening(o.id, { offset: g.offset, length: g.length });
  }

  // ----- static render helpers -----

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] =
      [];
    for (let x = Math.ceil(vb.x / 10) * 10; x <= vb.x + vb.w; x += 10) {
      lines.push({ x1: x, y1: vb.y, x2: x, y2: vb.y + vb.h, major: x % 100 === 0 });
    }
    for (let y = Math.ceil(vb.y / 10) * 10; y <= vb.y + vb.h; y += 10) {
      lines.push({ x1: vb.x, y1: y, x2: vb.x + vb.w, y2: y, major: y % 100 === 0 });
    }
    return lines;
  }, [vb]);

  const pointsStr = verts.map((v) => `${v.x},${v.y}`).join(" ");

  return (
    <div
      ref={containerRef}
      className="h-full w-full select-none"
      style={{ touchAction: "none" }}
    >
      <svg
        ref={svgRef}
        className="h-full w-full"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ touchAction: "none" }}
        onPointerDown={() => {
          onSelect(null);
          setOpeningSel(null);
        }}
      >
        {/* floor */}
        <polygon ref={floorEl} points={pointsStr} fill="#0e1a30" />

        {/* grid (over the floor so it is visible inside the room) */}
        <g pointerEvents="none">
          {gridLines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.major ? "rgba(148,163,184,0.14)" : "rgba(148,163,184,0.06)"}
              strokeWidth={S(1)}
            />
          ))}
        </g>

        {/* walls */}
        {verts.map((a, i) => {
          const b = verts[(i + 1) % n];
          return (
            <line
              key={i}
              ref={(el) => {
                if (el) wallEls.current.set(i, el);
                else wallEls.current.delete(i);
              }}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#8ea3bd"
              strokeWidth={S(4)}
              strokeLinecap="square"
            />
          );
        })}

        {/* openings: fat colored slices glued to their wall */}
        {room.openings.map((o) => {
          const { p1, p2 } = openingSegment(o, verts);
          return (
            <line
              key={o.id}
              ref={(el) => {
                if (el) openingEls.current.set(o.id, el);
                else openingEls.current.delete(o.id);
              }}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={o.kind === "door" ? "#f59e0b" : "#38bdf8"}
              strokeWidth={S(9)}
              strokeLinecap="butt"
              strokeDasharray={o.kind === "door" ? `${S(12)} ${S(7)}` : undefined}
              style={{ cursor: editShape ? "default" : "grab" }}
              onPointerDown={(e) => openingPointerDown(e, o)}
              onPointerMove={(e) => openingPointerMove(e, o)}
              onPointerUp={() => openingPointerUp(o)}
              onPointerCancel={() => openingPointerUp(o)}
            />
          );
        })}

        {/* end-handle resize for the selected opening */}
        {!editShape &&
          openingSel &&
          (() => {
            const o = room.openings.find((op) => op.id === openingSel);
            if (!o) return null;
            const { p1, p2 } = openingSegment(o, verts);
            const color = o.kind === "door" ? "#f59e0b" : "#38bdf8";
            return (
              <g>
                <circle
                  ref={openingHandleStartEl}
                  cx={p1.x}
                  cy={p1.y}
                  r={S(6)}
                  fill="#e2e8f0"
                  stroke={color}
                  strokeWidth={S(2)}
                  pointerEvents="none"
                />
                <circle
                  cx={p1.x}
                  cy={p1.y}
                  r={S(18)}
                  fill="transparent"
                  pointerEvents="all"
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => openingResizeDown(e, o, "start")}
                  onPointerMove={(e) => openingResizeMove(e, o)}
                  onPointerUp={() => openingResizeUp(o)}
                  onPointerCancel={() => openingResizeUp(o)}
                />
                <circle
                  ref={openingHandleEndEl}
                  cx={p2.x}
                  cy={p2.y}
                  r={S(6)}
                  fill="#e2e8f0"
                  stroke={color}
                  strokeWidth={S(2)}
                  pointerEvents="none"
                />
                <circle
                  cx={p2.x}
                  cy={p2.y}
                  r={S(18)}
                  fill="transparent"
                  pointerEvents="all"
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => openingResizeDown(e, o, "end")}
                  onPointerMove={(e) => openingResizeMove(e, o)}
                  onPointerUp={() => openingResizeUp(o)}
                  onPointerCancel={() => openingResizeUp(o)}
                />
              </g>
            );
          })()}

        {/* dimension labels */}
        <g pointerEvents="none" className="font-mono">
          {verts.map((a, i) => {
            const b = verts[(i + 1) % n];
            const len = segLength(a, b);
            if (len < 1) return null;
            const nrm = outwardNormal(a, b, verts);
            const m = midpoint(a, b);
            let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
            if (angle > 90 || angle <= -90) angle += 180;
            const dimPos = {
              x: m.x + nrm.x * S(16),
              y: m.y + nrm.y * S(16),
            };
            return (
              <text
                key={i}
                x={dimPos.x}
                y={dimPos.y}
                transform={`rotate(${angle} ${dimPos.x} ${dimPos.y})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={S(11)}
                fill="#8094ad"
              >
                {fmtLen(len)}
              </text>
            );
          })}
        </g>

        {/* clearance guide for the selected item */}
        {selectedItem && !editShape && (
          <g
            ref={guideGroupEl}
            pointerEvents="none"
            className="font-mono"
            visibility={committedClearance ? "visible" : "hidden"}
          >
            <line
              ref={guideLineEl}
              x1={committedClearance?.from.x ?? 0}
              y1={committedClearance?.from.y ?? 0}
              x2={committedClearance?.to.x ?? 0}
              y2={committedClearance?.to.y ?? 0}
              stroke="#22d3ee"
              strokeWidth={S(1.2)}
              strokeDasharray={`${S(4)} ${S(4)}`}
            />
            <circle
              ref={guideDotEl}
              cx={committedClearance?.to.x ?? 0}
              cy={committedClearance?.to.y ?? 0}
              r={S(2.5)}
              fill="#22d3ee"
            />
            <text
              ref={guideTextEl}
              x={
                committedClearance
                  ? midpoint(committedClearance.from, committedClearance.to).x + S(8)
                  : 0
              }
              y={
                committedClearance
                  ? midpoint(committedClearance.from, committedClearance.to).y - S(6)
                  : 0
              }
              fontSize={S(10)}
              fill="#22d3ee"
            >
              {committedClearance ? `${fmtGap(committedClearance.d)} cm` : ""}
            </text>
          </g>
        )}

        {/* items */}
        {room.items.map((item, i) => {
          const hw = item.width / 2;
          const hd = item.depth / 2;
          const status = analysis.status[i];
          const s = styleFor(item, status);
          const selected = item.id === selectedId;
          const hx = hw + S(20);
          const hy = -hd - S(20);
          const showDims =
            Math.min(item.width, item.depth) >= S(30) &&
            Math.max(item.width, item.depth) >= S(56);
          return (
            <g
              key={item.id}
              ref={(el) => {
                if (el) itemEls.current.set(item.id, el);
                else itemEls.current.delete(item.id);
              }}
              transform={itemTf(item.x, item.y, item.rotation)}
              style={{ cursor: editShape ? "default" : "move" }}
              onPointerDown={(e) => itemPointerDown(e, item)}
              onPointerMove={(e) => itemPointerMove(e, item)}
              onPointerUp={() => itemPointerUp(item)}
              onPointerCancel={() => itemPointerUp(item)}
            >
              <rect
                ref={(el) => {
                  if (el) rectEls.current.set(item.id, el);
                  else rectEls.current.delete(item.id);
                }}
                x={-hw}
                y={-hd}
                width={item.width}
                height={item.depth}
                rx={S(2)}
                fill={s.fill}
                fillOpacity={0.4}
                stroke={s.stroke}
                strokeWidth={selected ? S(2.5) : S(1.5)}
              />
              <g
                ref={(el) => {
                  if (el) labelEls.current.set(item.id, el);
                  else labelEls.current.delete(item.id);
                }}
                transform={`rotate(${-item.rotation})`}
                pointerEvents="none"
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  dy={showDims ? -S(6) : 0}
                  fontSize={S(11)}
                  fontWeight={600}
                  fill="rgba(241,245,249,0.92)"
                >
                  {item.name}
                </text>
                {showDims && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    dy={S(8)}
                    fontSize={S(9)}
                    fill="rgba(203,213,225,0.6)"
                    className="font-mono"
                  >
                    {fmtLen(item.width)}×{fmtLen(item.depth)}
                  </text>
                )}
              </g>
              {selected && !editShape && (
                <g>
                  <line
                    x1={hw}
                    y1={-hd}
                    x2={hx}
                    y2={hy}
                    stroke="#38bdf8"
                    strokeWidth={S(1)}
                    opacity={0.6}
                  />
                  <circle
                    cx={hx}
                    cy={hy}
                    r={S(8)}
                    fill="#0ea5e9"
                    stroke="#e0f2fe"
                    strokeWidth={S(1.5)}
                    pointerEvents="none"
                  />
                  <circle
                    cx={hx}
                    cy={hy}
                    r={S(22)}
                    fill="transparent"
                    pointerEvents="all"
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) => rotatePointerDown(e, item)}
                    onPointerMove={(e) => rotatePointerMove(e, item)}
                    onPointerUp={() => rotatePointerUp(item)}
                    onPointerCancel={() => rotatePointerUp(item)}
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* person scale reference - painted above furniture, visual-only */}
        {room.person?.visible && (
          <g
            ref={personEl}
            transform={`translate(${room.person.x} ${room.person.y})`}
            style={{ cursor: editShape ? "default" : "move" }}
            onPointerDown={personPointerDown}
            onPointerMove={personPointerMove}
            onPointerUp={personPointerUp}
            onPointerCancel={personPointerUp}
          >
            <circle
              cx={0}
              cy={0}
              r={PERSON_DIAMETER_CM / 2}
              fill="#f8fafc"
              fillOpacity={0.22}
              stroke="#e2e8f0"
              strokeWidth={S(1.5)}
            />
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              dy={-S(4)}
              fontSize={S(11)}
              fontWeight={600}
              fill="rgba(241,245,249,0.92)"
              pointerEvents="none"
            >
              Person
            </text>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              dy={S(9)}
              fontSize={S(9)}
              fill="rgba(203,213,225,0.6)"
              className="font-mono"
              pointerEvents="none"
            >
              50 cm
            </text>
          </g>
        )}

        {/* vertex handles in shape-edit mode */}
        {editShape &&
          verts.map((v, vi) => (
            <g key={vi}>
              <circle
                ref={(el) => {
                  if (el) vertexEls.current.set(vi, el);
                  else vertexEls.current.delete(vi);
                }}
                cx={v.x}
                cy={v.y}
                r={S(6)}
                fill="#e2e8f0"
                stroke="#0ea5e9"
                strokeWidth={S(2)}
                pointerEvents="none"
              />
              <circle
                cx={v.x}
                cy={v.y}
                r={S(22)}
                fill="transparent"
                pointerEvents="all"
                style={{ cursor: "grab" }}
                onPointerDown={(e) => vertexPointerDown(e, vi)}
                onPointerMove={(e) => vertexPointerMove(e, vi)}
                onPointerUp={() => vertexPointerUp(vi)}
                onPointerCancel={() => vertexPointerUp(vi)}
              />
            </g>
          ))}

        {/* 1 m scale bar */}
        <g pointerEvents="none" className="font-mono">
          <line
            x1={vb.x + S(16)}
            y1={vb.y + vb.h - S(16)}
            x2={vb.x + S(16) + 100}
            y2={vb.y + vb.h - S(16)}
            stroke="#64748b"
            strokeWidth={S(2)}
          />
          <line
            x1={vb.x + S(16)}
            y1={vb.y + vb.h - S(20)}
            x2={vb.x + S(16)}
            y2={vb.y + vb.h - S(12)}
            stroke="#64748b"
            strokeWidth={S(1.5)}
          />
          <line
            x1={vb.x + S(16) + 100}
            y1={vb.y + vb.h - S(20)}
            x2={vb.x + S(16) + 100}
            y2={vb.y + vb.h - S(12)}
            stroke="#64748b"
            strokeWidth={S(1.5)}
          />
          <text
            x={vb.x + S(16) + 50}
            y={vb.y + vb.h - S(22)}
            textAnchor="middle"
            fontSize={S(10)}
            fill="#64748b"
          >
            1 m
          </text>
        </g>
      </svg>
    </div>
  );
}
