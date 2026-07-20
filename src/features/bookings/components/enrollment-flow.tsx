"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from "@/components/ui";
import type { CalendarDay, CalendarSlot } from "../calendar";
import type { PaymentOptionsView } from "../payment-options";
import { createBookingAction, type CreateBookingState } from "../actions";

type Recognized = {
  email: string;
  name: string | null;
  athletes: { id: string; name: string }[];
};

export interface EnrollmentFlowProps {
  groupTypeSlug: string;
  groupTypeName: string;
  price: number;
  currency: string;
  isNewClientOnly: boolean;
  paymentView: PaymentOptionsView;
  month: string;
  prevMonth: string;
  nextMonth: string;
  grid: CalendarDay[];
  recognized: Recognized | null;
}

const initial: CreateBookingState = {};

/**
 * The single-route enrollment step machine (F5, EPIK 4).
 *
 * One client component, NO server-driven navigation between steps: a Server Action
 * redirect between segment routes is the F4.6 trap (the target renders without the
 * locale prefix or tenant header). Month navigation is the exception — those are
 * real `<Link>` requests (`?m=`), so the proxy runs and the header is correct.
 */
export function EnrollmentFlow(props: EnrollmentFlowProps) {
  const t = useTranslations("enrollment");
  const locale = useLocale();

  const money = (minor: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: props.currency }).format(
      minor / 100,
    );

  // Offers that cannot be booked in F5 render their message and stop — no calendar,
  // no submit (US-4.4/AC4, decision F).
  if (props.paymentView.kind === "packages_only") {
    return <Notice>{t("payment.packagesOnly")}</Notice>;
  }
  if (props.paymentView.kind === "none_available") {
    return <Notice>{t("payment.noneAvailable")}</Notice>;
  }

  return <Bookable {...props} money={money} />;
}

function Bookable({
  groupTypeSlug,
  price,
  isNewClientOnly,
  paymentView,
  month,
  prevMonth,
  nextMonth,
  grid,
  recognized,
  money,
}: EnrollmentFlowProps & { money: (minor: number) => string }) {
  const t = useTranslations("enrollment");
  const router = useRouter();
  const methods = paymentView.kind === "options" ? paymentView.methods : [];

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<CalendarSlot | null>(null);
  // A parent with a live cookie is recognised: skip email + OTP entirely.
  const [verified, setVerified] = useState<boolean>(recognized !== null);
  const [state, formAction, pending] = useActionState(createBookingAction, initial);

  const daySlots =
    grid.find((d) => d.dayKey === selectedDay)?.slots.filter((s) => s.bookable) ?? [];

  if (state.bookingId) {
    return (
      <Notice>
        {t("done.booked")} {t("done.bookedOffline")}
      </Notice>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <p className="text-lg font-medium">{t("offer.price", { price: money(price) })}</p>
      {isNewClientOnly ? <Badge variant="outline">{t("offer.newClientOnly")}</Badge> : null}

      {/* Step 2/3 — the calendar and the day's slots. */}
      {!slot ? (
        <Calendar
          month={month}
          prevMonth={prevMonth}
          nextMonth={nextMonth}
          groupTypeSlug={groupTypeSlug}
          grid={grid}
          selectedDay={selectedDay}
          onPickDay={setSelectedDay}
          daySlots={daySlots}
          onPickSlot={setSlot}
        />
      ) : null}

      {/* Once a slot is chosen: recognised parents go straight to confirm; new
          ones verify by OTP first, then confirm. */}
      {slot ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {slot.startsAt}–{slot.endsAt}
              {slot.locationName ? ` · ${slot.locationName}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!verified ? (
              <VerifyStep
                onVerified={() => {
                  // A real request — the proxy runs and the cookie is now present,
                  // so the server re-render can recognise the parent (F4.6 fix, like
                  // loginToAcademy's explicit post-login navigation).
                  router.refresh();
                  setVerified(true);
                }}
              />
            ) : (
              <ConfirmStep
                formAction={formAction}
                pending={pending}
                groupTypeSlug={groupTypeSlug}
                sessionId={slot.sessionId}
                methods={methods}
                recognizedAthletes={recognized?.athletes ?? []}
                error={state.error}
              />
            )}
            <Button variant="ghost" type="button" onClick={() => setSlot(null)}>
              ← {t("offer.chooseDate")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Calendar({
  month,
  prevMonth,
  nextMonth,
  groupTypeSlug,
  grid,
  selectedDay,
  onPickDay,
  daySlots,
  onPickSlot,
}: {
  month: string;
  prevMonth: string;
  nextMonth: string;
  groupTypeSlug: string;
  grid: CalendarDay[];
  selectedDay: string | null;
  onPickDay: (day: string) => void;
  daySlots: CalendarSlot[];
  onPickSlot: (slot: CalendarSlot) => void;
}) {
  const t = useTranslations("enrollment");
  const weekdays = t("calendar.weekdays").split(" ");
  const empty = grid.every((d) => d.slots.length === 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          {/* Real navigation, so the proxy sets the tenant header and locale. */}
          <Link href={`/zapisy/${groupTypeSlug}?m=${prevMonth}`} scroll={false}>
            ← {t("calendar.prevMonth")}
          </Link>
        </Button>
        <CardTitle>{month}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/zapisy/${groupTypeSlug}?m=${nextMonth}`} scroll={false}>
            {t("calendar.nextMonth")} →
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-muted-foreground py-4 text-center">{t("calendar.noSessions")}</p>
        ) : null}
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {weekdays.map((w) => (
            <div key={w} className="text-muted-foreground py-1 font-medium">
              {w}
            </div>
          ))}
          {grid.map((cell, i) => (
            <button
              key={cell.dayKey ?? `blank-${i}`}
              type="button"
              data-day-key={cell.dayKey ?? undefined}
              data-bookable={cell.hasBookableSlot ? "true" : undefined}
              disabled={!cell.dayKey || cell.slots.length === 0}
              aria-pressed={selectedDay === cell.dayKey}
              onClick={() => cell.dayKey && onPickDay(cell.dayKey)}
              className={cellClass(cell, selectedDay)}
            >
              {cell.dayOfMonth ?? ""}
              {cell.dayKey && cell.slots.length > 0 && !cell.hasBookableSlot ? (
                <span className="block text-[10px]">{t("calendar.full")}</span>
              ) : null}
            </button>
          ))}
        </div>

        {selectedDay && daySlots.length > 0 ? (
          <div className="mt-4 space-y-2">
            {daySlots.map((s) => (
              <Button
                key={s.sessionId}
                type="button"
                variant="outline"
                data-session-id={s.sessionId}
                className="w-full justify-between"
                onClick={() => onPickSlot(s)}
              >
                <span>
                  {s.startsAt}–{s.endsAt}
                  {s.locationName ? ` · ${s.locationName}` : ""}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("slot.free", { free: s.freeSeats, capacity: s.capacity })}
                </span>
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function cellClass(cell: CalendarDay, selectedDay: string | null): string {
  const base = "aspect-square rounded p-1 text-sm";
  if (!cell.dayKey) return `${base} invisible`;
  if (cell.slots.length === 0) return `${base} text-muted-foreground/40`;
  if (!cell.hasBookableSlot) return `${base} text-muted-foreground line-through`;
  const selected =
    selectedDay === cell.dayKey
      ? "bg-primary text-primary-foreground"
      : "bg-muted hover:bg-muted/70";
  return `${base} font-medium ${selected}`;
}

function VerifyStep({ onVerified }: { onVerified: () => void }) {
  const t = useTranslations("enrollment");
  const [phase, setPhase] = useState<"contact" | "otp">("contact");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/client-auth/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name: name || undefined, phone: phone || undefined }),
    });
    setBusy(false);
    if (res.status === 429) return setError(t("otp.rateLimited"));
    if (!res.ok) return setError(t("errors.generic"));
    setPhase("otp");
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/client-auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    setBusy(false);
    if (res.status === 429) return setError(t("otp.rateLimited"));
    if (!res.ok) return setError(t("otp.invalid"));
    onVerified();
  }

  if (phase === "contact") {
    return (
      <div className="space-y-3">
        <h3 className="font-medium">{t("contact.heading")}</h3>
        <FormField label={t("contact.email")} htmlFor="ll-email">
          <Input
            id="ll-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label={t("contact.name")} htmlFor="ll-name">
          <Input id="ll-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t("contact.phone")} htmlFor="ll-phone">
          <Input id="ll-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="button" onClick={requestCode} disabled={busy || !email}>
          {busy ? t("contact.sending") : t("contact.submit")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">{t("otp.heading")}</h3>
      <p className="text-muted-foreground text-sm">{t("otp.prompt", { email })}</p>
      <FormField label={t("otp.code")} htmlFor="ll-code">
        <Input
          id="ll-code"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </FormField>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex gap-2">
        <Button type="button" onClick={verify} disabled={busy || code.length !== 6}>
          {busy ? t("otp.verifying") : t("otp.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={requestCode} disabled={busy}>
          {t("otp.resend")}
        </Button>
      </div>
    </div>
  );
}

function ConfirmStep({
  formAction,
  pending,
  groupTypeSlug,
  sessionId,
  methods,
  recognizedAthletes,
  error,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  groupTypeSlug: string;
  sessionId: string;
  methods: { method: "online" | "on_site"; enabled: boolean }[];
  recognizedAthletes: { id: string; name: string }[];
  error?: string;
}) {
  const t = useTranslations("enrollment");
  const hasExisting = recognizedAthletes.length > 0;
  const [participantKind, setParticipantKind] = useState<"existing" | "new">(
    hasExisting ? "existing" : "new",
  );
  const [athleteId, setAthleteId] = useState(recognizedAthletes[0]?.id ?? "");
  const enabledMethod = methods.find((m) => m.enabled)?.method ?? "on_site";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="groupTypeSlug" value={groupTypeSlug} />
      <input type="hidden" name="sessionId" value={sessionId} />

      <fieldset className="space-y-2">
        <legend className="font-medium">{t("participant.heading")}</legend>
        {hasExisting ? (
          <>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="participantKind"
                value="existing"
                checked={participantKind === "existing"}
                onChange={() => setParticipantKind("existing")}
              />
              {t("participant.existing")}
            </label>
            {participantKind === "existing" ? (
              <select
                name="athleteId"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                className="border-input w-full rounded border px-3 py-2"
              >
                {recognizedAthletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="participantKind"
                value="new"
                checked={participantKind === "new"}
                onChange={() => setParticipantKind("new")}
              />
              {t("participant.addNew")}
            </label>
          </>
        ) : (
          <input type="hidden" name="participantKind" value="new" />
        )}
        {participantKind === "new" ? (
          <div className="space-y-2">
            <FormField label={t("participant.name")} htmlFor="ll-participant">
              <Input id="ll-participant" name="participantName" />
            </FormField>
            <FormField label={t("participant.age")} htmlFor="ll-age">
              <Input id="ll-age" name="participantAge" inputMode="numeric" />
            </FormField>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">{t("payment.heading")}</legend>
        {methods.map((m) => (
          <label key={m.method} className="flex items-center gap-2">
            <input
              type="radio"
              name="paymentMethod"
              value={m.method}
              defaultChecked={m.method === enabledMethod}
              disabled={!m.enabled}
            />
            <span className={m.enabled ? "" : "text-muted-foreground"}>
              {m.method === "on_site" ? t("payment.onSite") : t("payment.online")}
              {!m.enabled ? ` — ${t("payment.onlineUnavailable")}` : ""}
            </span>
          </label>
        ))}
      </fieldset>

      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("confirm.booking") : t("confirm.submit")}
      </Button>
    </form>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Alert className="mt-6">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-destructive text-sm">{children}</p>;
}
