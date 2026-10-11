import * as React from "react";

const MOBILE_BREAKPOINT = 1280;

/**
 * Mobile flag (etap 4, faza 2 — ported from AdminCN's `use-mobile.ts` with an
 * SSR fix).
 *
 * The template initialises state from `window.innerWidth`, which differs
 * between server (`undefined` → desktop) and a narrow client (mobile) — a
 * hydration mismatch by construction, crashing dev with a recoverable error
 * and silently re-rendering in prod. Here both sides start `undefined`
 * (desktop) and the effect corrects after hydration: one extra render on
 * mobile, zero mismatches everywhere.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Sync on mount (viewport may differ from the SSR default), then subscribe.
    onChange();
    mql.addEventListener("change", onChange);

    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
