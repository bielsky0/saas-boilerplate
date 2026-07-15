"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Minimal dropdown primitive (spec 7.1). Token-driven, no external deps: a
 * trigger button toggles a floating panel that closes on outside-click or Escape.
 * Presentational only — callers put links/buttons inside.
 */
export function Dropdown({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        {trigger}
        <span aria-hidden className="text-xs opacity-60">
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute left-0 z-20 mt-1 min-w-56 rounded-md border border-black/10 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-neutral-900"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
