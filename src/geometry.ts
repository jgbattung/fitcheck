import type { FitStatus, Opening, Pt, Room } from "./types";

export function segLength(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function polygonBBox(verts: Pt[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Closest point on segment ab to p, with distance. */
export function distPointToSeg(p: Pt, a: Pt, b: Pt): { d: number; q: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), q };
}

/**
 * Ray-casting point-in-polygon. Points within `tol` cm of the boundary count
 * as inside so items sitting flush against a wall are not flagged.
 */
export function pointInPolygon(p: Pt, verts: Pt[], tol = 0.25): boolean {
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    if (distPointToSeg(p, verts[i], verts[(i + 1) % n]).d <= tol) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = verts[i];
    const b = verts[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Corners of a rotated rectangle centered at (cx, cy), clockwise from top-left. */
export function rectCorners(
  cx: number,
  cy: number,
  w: number,
  d: number,
  rotDeg: number,
): Pt[] {
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const hw = w / 2;
  const hd = d / 2;
  const local: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([x, y]) => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  }));
}

/** Corners plus edge midpoints - the sample points used for wall-collision tests. */
export function rectTestPoints(corners: Pt[]): Pt[] {
  const pts = [...corners];
  for (let i = 0; i < 4; i++) {
    pts.push(midpoint(corners[i], corners[(i + 1) % 4]));
  }
  return pts;
}

/**
 * True if any part of the rectangle crosses a wall. Tests corners + edge
 * midpoints against the polygon, plus polygon vertices strictly inside the
 * rectangle (catches an inner corner of an L-shape poking into the item).
 */
export function rectCrossesWalls(
  corners: Pt[],
  cx: number,
  cy: number,
  w: number,
  d: number,
  rotDeg: number,
  verts: Pt[],
): boolean {
  if (rectTestPoints(corners).some((p) => !pointInPolygon(p, verts))) {
    return true;
  }
  const r = (-rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const tol = 0.25;
  for (const v of verts) {
    const dx = v.x - cx;
    const dy = v.y - cy;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    if (Math.abs(lx) < w / 2 - tol && Math.abs(ly) < d / 2 - tol) return true;
  }
  return false;
}

/**
 * Separating-axis overlap test for two convex quads. A small tolerance keeps
 * exactly-flush neighbours from being flagged.
 */
export function rectsOverlap(c1: Pt[], c2: Pt[], tol = 0.5): boolean {
  for (const rect of [c1, c2]) {
    for (let i = 0; i < 2; i++) {
      const a = rect[i];
      const b = rect[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len === 0) continue;
      const ax = (b.x - a.x) / len;
      const ay = (b.y - a.y) / len;
      let min1 = Infinity,
        max1 = -Infinity,
        min2 = Infinity,
        max2 = -Infinity;
      for (const p of c1) {
        const t = p.x * ax + p.y * ay;
        min1 = Math.min(min1, t);
        max1 = Math.max(max1, t);
      }
      for (const p of c2) {
        const t = p.x * ax + p.y * ay;
        min2 = Math.min(min2, t);
        max2 = Math.max(max2, t);
      }
      if (max1 <= min2 + tol || max2 <= min1 + tol) return false;
    }
  }
  return true;
}

export interface Clearance {
  d: number;
  /** point on the item */
  from: Pt;
  /** point on the wall */
  to: Pt;
}

/**
 * Minimum distance from the rectangle's edges to the polygon's walls, with
 * the closest point pair for drawing a guide line.
 */
export function clearanceToWalls(corners: Pt[], verts: Pt[]): Clearance {
  let best: Clearance = { d: Infinity, from: corners[0], to: verts[0] };
  const n = verts.length;
  for (let i = 0; i < 4; i++) {
    const ra = corners[i];
    const rb = corners[(i + 1) % 4];
    for (let j = 0; j < n; j++) {
      const wa = verts[j];
      const wb = verts[(j + 1) % n];
      const r1 = distPointToSeg(ra, wa, wb);
      if (r1.d < best.d) best = { d: r1.d, from: ra, to: r1.q };
      const r2 = distPointToSeg(rb, wa, wb);
      if (r2.d < best.d) best = { d: r2.d, from: rb, to: r2.q };
      const w1 = distPointToSeg(wa, ra, rb);
      if (w1.d < best.d) best = { d: w1.d, from: w1.q, to: wa };
      const w2 = distPointToSeg(wb, ra, rb);
      if (w2.d < best.d) best = { d: w2.d, from: w2.q, to: wb };
    }
  }
  return best;
}

/**
 * Unit normal of segment ab pointing away from the polygon interior
 * (probes both sides with point-in-polygon; no winding assumption).
 */
export function outwardNormal(a: Pt, b: Pt, verts: Pt[]): Pt {
  const len = segLength(a, b);
  if (len === 0) return { x: 0, y: -1 };
  const nx = (b.y - a.y) / len;
  const ny = -(b.x - a.x) / len;
  const m = midpoint(a, b);
  const probe = { x: m.x + nx * 1, y: m.y + ny * 1 };
  return pointInPolygon(probe, verts, 0.01) ? { x: -nx, y: -ny } : { x: nx, y: ny };
}

export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export const MIN_OPENING_CM = 1;

/** Length of wall `wallIndex` (vertices[wallIndex] -> vertices[(wallIndex+1)%n]). */
export function wallLength(verts: Pt[], wallIndex: number): number {
  const n = verts.length;
  return segLength(verts[wallIndex], verts[(wallIndex + 1) % n]);
}

/** Clamp an opening to its wall: length in [min(MIN,wallLen), wallLen], offset in [0, wallLen-length]. */
export function clampOpening(o: Opening, wallLen: number): Opening {
  const length = Math.max(Math.min(MIN_OPENING_CM, wallLen), Math.min(o.length, wallLen));
  const offset = Math.max(0, Math.min(o.offset, wallLen - length));
  return { ...o, offset, length };
}

/** The two endpoints of the opening slice, for rendering & hit-testing. */
export function openingSegment(o: Opening, verts: Pt[]): { p1: Pt; p2: Pt } {
  const n = verts.length;
  const a = verts[o.wallIndex];
  const b = verts[(o.wallIndex + 1) % n];
  const len = segLength(a, b);
  if (len === 0) return { p1: a, p2: a };
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const p1 = { x: a.x + ux * o.offset, y: a.y + uy * o.offset };
  const p2 = { x: a.x + ux * (o.offset + o.length), y: a.y + uy * (o.offset + o.length) };
  return { p1, p2 };
}

/** Signed distance of point p projected along wall a->b, measured from a (NOT clamped). */
export function alongWall(p: Pt, a: Pt, b: Pt): number {
  const len = segLength(a, b);
  if (len === 0) return 0;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return (p.x - a.x) * ux + (p.y - a.y) * uy;
}

export interface RoomAnalysis {
  corners: Pt[][];
  collide: boolean[];
  status: FitStatus[];
}

/** Committed fit analysis for every item in a room. */
export function analyzeRoom(room: Room): RoomAnalysis {
  const corners = room.items.map((it) =>
    rectCorners(it.x, it.y, it.width, it.depth, it.rotation),
  );
  const collide = room.items.map((it, i) =>
    rectCrossesWalls(
      corners[i],
      it.x,
      it.y,
      it.width,
      it.depth,
      it.rotation,
      room.vertices,
    ),
  );
  const status: FitStatus[] = room.items.map((_, i) => {
    if (collide[i]) return "collide";
    const overlaps = corners.some((c, j) => j !== i && rectsOverlap(corners[i], c));
    return overlaps ? "overlap" : "ok";
  });
  return { corners, collide, status };
}
