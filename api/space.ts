import { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const CODE_RE = /^[a-z0-9]{6,64}$/;

interface Envelope {
  rev: number;
  updatedAt: number;
  state: unknown;
}

interface StoredData {
  updatedAt: number;
  state: unknown;
}

// Atomic compare-and-set: bumps the revision key and writes the data only if
// the caller's baseRev is not behind the currently stored revision. `rev`
// itself lives only in the rev key, never inside the stored data blob, so the
// new revision can be computed inside the script and does not need to be
// known by the caller ahead of time.
// KEYS[1] = data key, KEYS[2] = rev key
// ARGV[1] = baseRev, ARGV[2] = data JSON (updatedAt + state)
// Returns { conflict: 0|1, rev, dataJSON (current or newly written) }
const CAS_SCRIPT = `
local storedRev = tonumber(redis.call("GET", KEYS[2])) or 0
local baseRev = tonumber(ARGV[1])
if storedRev > baseRev then
  local current = redis.call("GET", KEYS[1])
  return {1, storedRev, current}
end
local newRev = storedRev + 1
redis.call("SET", KEYS[2], newRev)
redis.call("SET", KEYS[1], ARGV[2])
return {0, newRev, ARGV[2]}
`;

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function sanitizeCode(raw: unknown): string | null {
  if (typeof raw !== "string" || !CODE_RE.test(raw)) return null;
  return raw;
}

function isPlausibleState(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { rooms?: unknown }).rooms)
  );
}

function parseStored(raw: string | StoredData): StoredData {
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const redis = getRedis();
  if (!redis) {
    res.status(500).json({ error: "Sync store is not configured." });
    return;
  }

  const code = sanitizeCode(req.query.s);
  if (!code) {
    res.status(400).json({ error: "Missing or invalid space code." });
    return;
  }

  const dataKey = `fitcheck:space:${code}`;
  const revKey = `fitcheck:space:${code}:rev`;

  if (req.method === "GET") {
    const [rawData, rawRev] = await Promise.all([
      redis.get<string | StoredData>(dataKey),
      redis.get<string | number>(revKey),
    ]);
    if (rawData === null || rawData === undefined) {
      res.status(404).json({ rev: 0 });
      return;
    }
    const data = parseStored(rawData);
    const rev = Number(rawRev) || 0;
    const envelope: Envelope = { rev, updatedAt: data.updatedAt, state: data.state };
    res.status(200).json(envelope);
    return;
  }

  if (req.method === "PUT") {
    const body = req.body as { baseRev?: unknown; state?: unknown } | undefined;
    const baseRev = typeof body?.baseRev === "number" ? body.baseRev : NaN;
    if (!Number.isFinite(baseRev) || !isPlausibleState(body?.state)) {
      res.status(400).json({ error: "Invalid request body." });
      return;
    }

    const updatedAt = Date.now();
    const data: StoredData = { updatedAt, state: body!.state };

    const result = (await redis.eval(
      CAS_SCRIPT,
      [dataKey, revKey],
      [String(baseRev), JSON.stringify(data)],
    )) as [number, number, string | StoredData | null];

    const [conflict, rev, storedRaw] = result;

    if (conflict === 1) {
      const current = storedRaw ? parseStored(storedRaw) : null;
      const envelope: Envelope = current
        ? { rev, updatedAt: current.updatedAt, state: current.state }
        : { rev, updatedAt: 0, state: null };
      res.status(409).json(envelope);
      return;
    }

    res.status(200).json({ rev, updatedAt });
    return;
  }

  res.status(405).json({ error: "Method not allowed." });
}
