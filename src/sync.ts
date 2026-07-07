import type { AppState } from "./types";
import { validateState } from "./storage";

/** Poll interval while in a shared space. */
export const SPACE_POLL_MS = 4000;
/** Debounce before pushing a local edit while in a shared space. */
export const SPACE_PUSH_DEBOUNCE_MS = 1000;

const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CODE_LENGTH = 12;

export interface SpaceEnvelope {
  rev: number;
  updatedAt: number;
  state: AppState;
}

export type PushResult =
  | { ok: true; rev: number }
  | { conflict: true; envelope: SpaceEnvelope | null }
  | { error: true };

export function readSpaceCode(): string | null {
  return new URLSearchParams(location.search).get("s");
}

export function mintSpaceCode(): string {
  const bytes = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export function writeSpaceCodeToUrl(code: string): void {
  const url = new URL(location.href);
  url.searchParams.set("s", code);
  history.replaceState(null, "", url);
}

export function clearSpaceCodeFromUrl(): void {
  const url = new URL(location.href);
  url.searchParams.delete("s");
  history.replaceState(null, "", url);
}

export async function pullSpace(code: string): Promise<SpaceEnvelope | null> {
  const res = await fetch(`/api/space?s=${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as { rev: number; updatedAt: number; state: unknown };
  const state = validateState(body.state);
  if (!state) return null;
  return { rev: body.rev, updatedAt: body.updatedAt, state };
}

export async function pushSpace(
  code: string,
  baseRev: number,
  state: AppState,
): Promise<PushResult> {
  try {
    const res = await fetch(`/api/space?s=${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRev, state }),
    });
    if (res.status === 409) {
      const body = (await res.json()) as { rev: number; updatedAt: number; state: unknown };
      const validated = validateState(body.state);
      const envelope = validated
        ? { rev: body.rev, updatedAt: body.updatedAt, state: validated }
        : null;
      return { conflict: true, envelope };
    }
    if (!res.ok) return { error: true };
    const body = (await res.json()) as { rev: number };
    return { ok: true, rev: body.rev };
  } catch {
    return { error: true };
  }
}
