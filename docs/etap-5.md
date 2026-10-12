# Etap 5 — Pozostałe funkcje AdminCN Free

Status: w trakcie (fazy 5.0–5.4 DONE, 5.5 w planie). Poprzedni: [etap-4.md](etap-4.md) (shell,
Orders, członkowie, profil, auth — zamknięty).

Decyzje etapowe (z planowania, nie do renegocjacji w środku faz):
zero speców E2E (weryfikacja: typecheck/lint/format/build + walkthrough MCP);
strefy czasowe per organizacja (osobny byt: migracja + endpoint + UI);
nic nie cięte (demo-strony z jawnym banerem, connections modelowane,
two-steps wchodzi).

## Faza 5.0 — Inwentaryzacja i steel thread — DONE (2026-10-12)

- Template bez zmian (HEAD `dd1afd2`, klon w `/tmp/admincn-free` aktualny).
- Puste trasy w shellu: `/(app)/apps/mail`, `/(app)/apps/calendar`
  (RSC, metadata, karta "Coming soon", zero mocków); grupa nav Apps
  (Mail/Calendar, ikony jak w template) + klucze `nav.admin.*` EN/PL.
- Weryfikacja: typecheck + lint zielone, MCP (nav, obie trasy, zero błędów).

## Faza 5.1 — Strony bez backendu

Status: DONE (2026-10-12). Dowiezione: `features/demo/`, trasy `/(app)/demo/*`, grupa nav Demo, klucze `demo.*` EN/PL; prymitywy `ui/checkbox`, `ui/radio-group`, `ui/textarea`, `ui/input-group` + 7 `Field*` w `ui/field`. Weryfikacja: static + build zielone, istniejące specy zielone, MCP (5 tras, submit→toast, walidacja live, sort/pin/filtry, dark, PL, mobile 390). Bez nowych speców E2E (decyzja). Szczegóły: [etap-5-faza-5-1.md](etap-5-faza-5-1.md).

Szczegóły: [etap-5-faza-5-1.md](etap-5-faza-5-1.md). Skrót: `features/demo/`
(form layouts ×2, validation, datatable ×3 z banerem demo, error-demo,
menu-level), trasy `/(app)/demo/*`, grupa nav Demo, i18n `demo.*`.
Bez E2E.

## Faza 5.2 — Profil i Workspace

Status: DONE (2026-10-12). Dowiezione: Nest `user_connection` (migracja,
symetryczne pary low/high + unique, moduł `connections/`: list/connect
(neutralny)/disconnect, `PATCH /v1/organizations/:slug` + `timezone`
(IANA, 422 na śmieci) + `timezone` w `getOrganization`/kontrakcie;
web `features/connections/` + `features/profile/` (zakładki `?view=`,
self-view, formularz nazwy), selektor strefy w ustawieniach org
(Radix `SelectGroup/Label` dopisane do `ui/select`), klucze
`profile.tabs`, `connections.*`, `organizations.fields.timezone`.
Weryfikacja: static zielone, MCP (profil, connect/remove, timezone
Warsaw→NY persist, izolacja Charlie/pusty, invalid 422, PL, mobile,
zero błędów). Bez speców E2E (decyzja). Lekcja: ubity serwer API-dev
(`BILLING_PROVIDER=none`) reuse'owany przez suitę dawał fałszywe 404
webhooków — przed suitą ZAWSZE czyścić `:3000/:3001` i weryfikować
`ps`, nie tylko curl.

## Faza 5.3 — Calendar, pełny backend

Status: DONE (2026-10-12). Dowiezione: Nest `calendar_event` (migracja
`0014`, owner personal XOR org — constraint `(organizationId IS NULL) <>
(accountId IS NULL)`, check `endsAt > startsAt`, indeksy po ownerze i
`startsAt`); moduł `calendar/` (list range `[from,to)` stabowanie,
create/update/delete z hintem `org` w query — bare id nie nazywa tenanta,
więc obcy hint daje 404, a nie skan tenantów; walidacja zakresu 400,
schema 422); kontrakt OpenAPI (`calendar` tag, `CalendarEvent` +
`CalendarEventInput`). Web `features/calendar/`: widoki month/week/day
(port z template, `date-fns` + `date-fns-tz`), `CalendarApp` (zakres →
query key, mount-gate, ticker „teraz", klawisze M/W/D), Sheet + RHF
create/edit (wall-time w strefie → UTC w zapisie), `ui/popover` (Base UI,
dopisany), trasy `/(app)/apps/calendar` (personal, strefa przeglądarki) i
`/(app)/orgs/[slug]/calendar` (strefa org), link w widoku org, klucze
`calendar.*` EN/PL. Weryfikacja: static/build zielone, MCP (PL+EN,
create/edit/delete + toast, walidacja end>start, kategorie, all-day,
week/day, klawisze, mobile 390, org NY vs Warsaw dowodzi strefy org, izolacja
personal puste, zero błędów konsoli). Bez speców E2E (decyzja). Szczegóły
poniżej w skrócie.

## Faza 5.4 — Mail, pełny backend

Status: DONE (2026-10-12). Dowiezione: Nest `mail_thread` /
`mail_thread_participant` / `mail_message` (migracje `0015` + `0016`; folder
CHECK, unique `(threadId,userId)`, `draftRecipientIds` na wątku żeby szkic
miał do kogo trafić po wysłaniu); moduł `mail/` (list z folderem/labelą/
szukaniem/unread + counts, detail, compose, reply, PATCH flag/folder/label,
DELETE własnej kopii; owner = użytkownik, wiadomości wewnętrzne user↔user —
brak MX, więc nieznany odbiorca = 422 `issues.to`); dostawa przez istniejącą
kolejkę (`mail.deliver`, kontrakt + rejestr + handler, idempotentny). Web
`features/mail/`: trójpanelowy `MailApp` na `resizable` (jedyne użycie
`react-resizable-panels`), nav/list/item/display + compose Sheet (RHF),
prymitywy `ui/resizable`, `ui/scroll-area`, `ui/switch`, trasa
`/(app)/apps/mail`, klucze `mail.*` EN/PL. Weryfikacja: static/build zielone,
API curl (dostawa przez job, izolacja 404, wątki/flagi/labelki/draft→send,
422), MCP (skrzynka, detail, reply, star/label/archive, compose, search,
mobile, zero błędów konsoli). Bez speców E2E (decyzja).

## Faza 5.5 — Domknięcie (plan)

Martwy kod, audyt zależności, docs, MCP całości, commit.
