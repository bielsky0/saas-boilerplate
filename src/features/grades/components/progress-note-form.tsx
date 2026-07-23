"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { Button, FormMessage, Textarea, toast } from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { addProgressNoteAction } from "../actions";

const initial: FormState = {};

/** Add a running-log note about a participant — langlion §2.33, Faza 6. */
export function ProgressNoteForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("grades");
  const [state, action, pending] = useActionState(addProgressNoteAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex items-start gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Textarea
        name="content"
        rows={1}
        placeholder={t("form.note")}
        className="min-h-8 flex-1"
        aria-label={t("form.note")}
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t("form.addNote")}
      </Button>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}
