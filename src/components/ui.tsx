import { useEffect, useState } from "react";

export const inputCls =
  "rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 " +
  "outline-none focus-visible:border-sky-500 focus-visible:ring-1 focus-visible:ring-sky-500";

interface NumberFieldProps {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  className?: string;
  "aria-label": string;
}

/**
 * Numeric input that keeps local text while typing and commits a valid
 * number on blur / Enter, reverting to the last good value otherwise.
 */
export function NumberField({
  value,
  onCommit,
  min,
  className,
  "aria-label": ariaLabel,
}: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = parseFloat(text);
    if (Number.isFinite(n) && (min === undefined || n >= min)) {
      if (n !== value) onCommit(n);
      else setText(String(value));
    } else {
      setText(String(value));
    }
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={`${inputCls} font-mono ${className ?? ""}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
