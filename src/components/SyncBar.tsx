import { useState } from "react";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline";

const STATUS_LABEL: Record<SyncStatus, string> = {
  idle: "Syncing",
  syncing: "Syncing",
  synced: "Synced",
  offline: "Offline",
};

const btnCls =
  "cursor-pointer rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition-colors duration-200 hover:border-slate-500 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none";

interface SyncControlProps {
  syncCode: string | null;
  syncStatus: SyncStatus;
  remoteAhead: boolean;
  onShare: () => void;
  onLeave: () => void;
}

/** Header control: mint/join a space, show status, copy link, or leave. */
export function SyncControl({
  syncCode,
  syncStatus,
  remoteAhead,
  onShare,
  onLeave,
}: SyncControlProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!syncCode) {
    return (
      <button className={btnCls} onClick={onShare}>
        Share / Sync
      </button>
    );
  }

  const statusLabel = remoteAhead ? "Updated elsewhere" : STATUS_LABEL[syncStatus];
  const statusCls =
    remoteAhead
      ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
      : syncStatus === "offline"
        ? "border-red-500/40 bg-red-500/15 text-red-400"
        : "border-sky-400 bg-sky-500/20 text-sky-300";

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusCls}`}
      >
        {statusLabel}
      </span>
      <button className={btnCls} onClick={copyLink}>
        {copied ? "Copied!" : "Copy link"}
      </button>
      <button className={btnCls} onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}

interface SyncNudgeProps {
  onReload: () => void;
  onDismiss: () => void;
}

/** Banner shown when the server has a newer revision than this client. */
export function SyncNudge({ onReload, onDismiss }: SyncNudgeProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      <span className="flex-1">Updated on another device.</span>
      <button
        className="cursor-pointer rounded-md border border-amber-400/60 px-2.5 py-1 font-medium text-amber-200 transition-colors duration-200 hover:border-amber-300 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
        onClick={onReload}
      >
        Reload
      </button>
      <button
        className="cursor-pointer rounded-md px-2.5 py-1 text-amber-300/80 transition-colors duration-200 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
