import { z } from "zod";

import { email, type TemplateName } from "@/lib/adapters/email";
import type { JobHandler } from "@/lib/adapters/jobs";
import { TEMPLATE_CATEGORY, categoryFor } from "./categories";
import { isSuppressed } from "./data";
import { unsubscribeHeaders, unsubscribeUrl } from "./suppression";

/**
 * The `email.send` job handler — the ONLY place `email.send` is called (spec 10).
 *
 * Everything policy-shaped happens here, exactly once, for every message in the
 * app: suppression, unsubscribe headers, and the unsubscribe link injected into
 * the template's props.
 */

/**
 * jsonb round-trips are UNTYPED — whatever the enqueue-side types claimed, this
 * is what actually came back out of the database. Parse, don't trust. (Payloads
 * are JSON primitives by contract, so there is no Date to coerce here; if a
 * future template needs one, use z.coerce.date().)
 */
const emailJobSchema = z.object({
  template: z.string().refine((t): t is TemplateName => t in TEMPLATE_CATEGORY, {
    message: "Unknown email template",
  }),
  data: z.record(z.string(), z.unknown()),
  to: z.email(),
  name: z.string().optional(),
});

export const emailSendHandler: JobHandler<"email.send"> = async (payload) => {
  const p = emailJobSchema.parse(payload);
  const category = categoryFor(p.template);

  if (category === "transactional") {
    // No suppression check and no List-Unsubscribe: this mail is not optional and
    // must never be silenced. See features/emails/categories.ts.
    await email.send(p.template, p.data, { to: p.to, name: p.name });
    return;
  }

  // THE GUARANTEE (spec 10.3). The enqueue-time check is an optimization that
  // cannot see the future; this one runs at the moment of delivery, which is the
  // only moment whose answer is correct — a day-7 job enqueued on day 0 learns
  // about a day-2 unsubscribe right here.
  if (await isSuppressed(p.to, category)) {
    // A no-op is a SUCCESSFUL outcome, not a failure: retrying would never change
    // the answer, and dead-lettering would fill the queue with red rows recording
    // the system working correctly.
    console.log(`[email] suppressed to=${p.to} template=${p.template} category=${category}`);
    return;
  }

  await email.send(
    p.template,
    // Injected here rather than at enqueue: the link is derived from the address
    // and the signing secret, neither of which a caller should have to handle,
    // and it must not sit in `job.payload` any longer than necessary.
    { ...p.data, unsubscribeUrl: unsubscribeUrl(p.to, category) },
    { to: p.to, name: p.name },
    { headers: unsubscribeHeaders(p.to, category) },
  );
};
