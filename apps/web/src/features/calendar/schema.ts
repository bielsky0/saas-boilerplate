import { z } from "zod";

import { EVENT_KINDS } from "./calendar-types";

/**
 * Event form schema (etap 5, faza 5.3). The client mirror of the server's
 * `eventBodySchema`; messages are injected so the same schema validates EN and
 * PL. The date/time pair is validated as a pair (end strictly after start)
 * because a native `<input type="time">` cannot express "same-day, later".
 */
export interface EventFormMessages {
  titleRequired: string;
  titleMax: string;
  dateRequired: string;
  endAfterStart: string;
  locationMax: string;
  descriptionMax: string;
}

export function eventFormSchema(m: EventFormMessages) {
  return z
    .object({
      title: z.string().trim().min(1, m.titleRequired).max(200, m.titleMax),
      description: z.string().trim().max(2000, m.descriptionMax),
      date: z.string().min(1, m.dateRequired),
      startTime: z.string().min(1, m.dateRequired),
      endTime: z.string().min(1, m.dateRequired),
      allDay: z.boolean(),
      kind: z.enum(EVENT_KINDS),
      location: z.string().trim().max(200, m.locationMax),
    })
    .superRefine((value, ctx) => {
      if (!value.allDay && value.endTime <= value.startTime) {
        ctx.addIssue({
          code: "custom",
          message: m.endAfterStart,
          path: ["endTime"],
        });
      }
    });
}

export type EventFormValues = z.infer<ReturnType<typeof eventFormSchema>>;
