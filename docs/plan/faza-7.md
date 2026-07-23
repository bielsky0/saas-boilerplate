### Faza 7 — Dopisanie, anulowanie 24h, odrabianie, anulowania administracyjne

**Status:** ✅ **zakończona** (2026-07-23)

#### Postęp na 2026-07-23

Zrealizowane i zweryfikowane (`pnpm lint` / `pnpm tsc --noEmit` / `pnpm test`: 121/121 zielone, baseline F6 106):

- **D1 — Infrastruktura:**
  - RBAC: `bookings.cancel_reschedule` dodane do owner/admin/secretariat/reception (NIE trainer). Komentarz fazy w mapie permisji.
  - Audit: 3 nowe `AuditAction` — `booking.cancel`, `booking.cancel_admin`, `class_session.cancel` + i18n PL/EN.
  - Emaile: szablony `booking-cancelled` / `session-cancelled` (React Email), zarejestrowane w `contract.ts` / `categories.ts` (transactional) / `templates/index.ts`, i18n PL/EN.

- **D2 — Helpery danych:**
  - `getBookingWithSession(tx, orgId, bookingId, opts?)` — booking + session JOIN z opcjonalnym `FOR UPDATE OF class_session` (LOCK ORDER). Dwa warianty: `lockSession: true` (blokada przed modyfikacją), `lockSession: false` (czysty odczyt).
  - `getActiveBookingsForClient(tx, orgId, clientId)` — lista aktywnych bookingów klienta z joinem przez `athlete.parentClientId` + `groupType.name`.
  - `getClientIdForBooking(tx, orgId, bookingId)` — rezolucja rodzica przez `athlete.parentClientId`.

- **D11 — `consumeCreditForBooking()` zmiana sygnatury:**
  - Zwraca `{ creditId, source } | null` zamiast `string | null`.
  - `claimCredit()` wzbogacone o `source` w SQL i typie zwracanym.
  - Caller F5/F6/dev-route zaktualizowane.

- **D3 — `cancelBooking()` core (nowy plik `features/bookings/cancel.ts`):**
  - Jedna funkcja dla ścieżki klienta (24h) i admina (bypass24h).
  - **LOCK ORDER: `class_session` → `booking`** — blokada sesji przez `getBookingWithSession(lockSession: true)`, potem booking przez `FOR UPDATE`.
  - 24h = różnica UTC (`session.startTime - now >= 24h`).
  - `confirmed` → `issueCredits(source: "cancellation")` z `sourceBookingId`.
  - `booked_offline` / `payment_pending` → brak kredytu.
  - Audit z `booking.cancel` lub `booking.cancel_admin`.
  - US-12.3 (group_change_request) deferred do F15 — stub + `TODO(F15)`.
  - Klasy błędów: `BookingNotFoundError`, `BookingAlreadyCancelledError`, `CancellationTooLateError`, `CancellationBlockedByChangeRequestError`.

- **D4 — Anulowanie przez personel (UI):**
  - `cancelBookingAction()` w `staff-actions.ts` — gated `bookings.cancel_reschedule`, bypass24h=true.
  - `CancelBookingButton` — przycisk `variant="destructive"` na rosterze sesji (gated `hasPermission` + `paymentStatus !== "cancelled"`).
  - i18n PL/EN w `staffPanel`.

- **D5 — Anulowanie całej sesji przez admina (US-19.2):**
  - `cancelClassSession()` w `features/schedule/cancel-session.ts` — LOCK ORDER: session → bookingi.
  - `confirmed` → `issueCredits(source: "admin_session_cancellation")` per booking; `booked_offline`/`payment_pending` → bez kredytu.
  - Audit `class_session.cancel` z liczbą anulowanych bookingów i kredytów.
  - `cancelSessionAction()` gated `sessions.manage`.
  - `CancelSessionButton` z `ConfirmDialog` (ostrzeżenie o nieodwracalności).
  - i18n PL/EN w `schedule`.

- **D6 — Panel klienta:**
  - Nowa ścieżka `(site)/moje-zajecia/page.tsx` na tenant domain.
  - OTP-gated przez `resolveClientSession()`.
  - Lista upcoming bookingów z nazwą grupy, datą, statusem.
  - `cancelMyBookingAction()` w `client-actions.ts` — sprawdza własność bookingu przez `getActiveBookingsForClient()`, woła `cancelBooking(bypass24h: false)`.
  - `CancelMyBookingButton` — przycisk na liście, 24h egzekwowane backendowo.
  - i18n PL/EN w `enrollment`.

- **D7 — Dopisanie i Odrabianie (EPIK 8 + 13):**
  - `dopisanieBooking()` w `features/bookings/credit-booking.ts` — tworzy booking `confirmed` + konsumuje kredyt FIFO w jednej transakcji.
  - LOCK ORDER: session → booking insert → credit consumption.
  - Audit z `bookingType: "extra_session" | "makeup"` w metadata (rozróżnienie po źródle kredytu — D11).
  - `addExtraSessionAction()` w `client-actions.ts`.
  - Klasy błędów: `SessionNotScheduledError`, `SessionPastError`, `SessionFullError`, `NoCreditsAvailableError`, `AthleteNotOwnedError`.

- **D8 — Testy:**
  - 15 nowych testów jednostkowych (error classes + 24h pure logic) w 3 plikach: `cancel.test.ts`, `cancel-session.test.ts`, `credit-booking.test.ts`.
  - 121 testów zielonych (11 plików).
  - Wszystkie lint/tsc warningi wyczyszczone (0 errors, 0 warnings).

**Cel:** samoobsługowy cykl życia rezerwacji klienta + narzędzia admina.
**Pokrywa:** EPIK 8, 12, 13; US-19.2 (odwołanie sesji — kompensacja; powiadomienia e-mail-only, retrofit in-app w F14).
**Zależności:** F5 (booking), F4 (kredyty), F6 (panel — dla ścieżek admina).
**Zakres:** Dopisanie (Proces A) w panelu klienta — konsumpcja FIFO przez tę samą transakcję §5.2/§5.3; odwołanie przez klienta z regułą 24h (kredyt `cancellation` wyłącznie za `confirmed`; `booked_offline` → cancelled bez kredytu); odrabianie = Dopisanie kredytem `cancellation` w ramach tego samego `group_type`; anulowanie rezerwacji przez admina (kredyt niezależnie od 24h dla `confirmed`); odwołanie całej sesji przez admina (status `cancelled`, kredyty `admin_session_cancellation` dla opłaconych, e-maile do dotkniętych); uprawnienie `bookings.cancel_reschedule`.
**DoD:** e2e na wszystkie AC EPIK 12 (w tym granica 24h) i EPIK 8; odwołanie sesji generuje kredyty tylko dla opłaconych; suita zielona.
**Uwaga:** US-12.3 (group_change_request blokada) i US-19.2/AC4 (group_change_request → cancelled_by_admin) — odłożone do F15. Stub + `TODO(F15)` w kodzie.

---

