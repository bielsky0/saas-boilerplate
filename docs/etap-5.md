# Etap 5 — Pozostałe funkcje AdminCN Free

Status: w trakcie (faza 5.0 DONE). Poprzedni: [etap-4.md](etap-4.md) (shell,
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

## Faza 5.2 — Profil i Workspace (plan)

Self-view profilu, connections (model user↔user), Workspace settings

- selektor `timezone` (migracja `organization.timezone`, PATCH, UI).

## Faza 5.3 — Calendar, pełny backend (plan)

Moduł Nest `calendar_event` (owner personal XOR org), CRUD, endpointy
zakresowe; web z renderowaniem w strefie kontekstu (org → jej timezone,
personal → przeglądarka), zapis w UTC. `date-fns` dozwolony tylko tu.

## Faza 5.4 — Mail, pełny backend (plan)

Moduł Nest (wątki/wiadomości/foldery/flagi), wysyłka przez istniejącą
kolejkę, wiadomości wewnętrzne (brak MX inbound — fizyka, nie cięcie);
web z `resizable` (dozwolone tylko tu).

## Faza 5.5 — Domknięcie (plan)

Martwy kod, audyt zależności, docs, MCP całości, commit.
