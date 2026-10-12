import type { EventKind } from "./calendar-types";

/**
 * Category color dots (etap 5, faza 5.3). Ported from AdminCN's
 * `event-type-options`; the labels themselves come from `calendar.kinds.*` i18n.
 * Backend `kind` is free-form, so unknown values fall back to `etc` at render
 * time (see `normalizeEventType` in `calendar-utils`).
 */
export const EVENT_TYPE_DOT_CLASSES: Record<EventKind, string> = {
  family: "bg-amber-400",
  business: "bg-violet-400",
  personal: "bg-rose-400",
  holiday: "bg-emerald-400",
  etc: "bg-sky-400",
};
