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

## Faza 5.1 — Strony bez backendu (plan)

Form layouts, form-validation, datatable demo (baner demo), error page,
menu-level + i18n. Bez E2E.

## Faza 5.2 — Profil i Workspace (plan)

Self-view profilu, connections (model user↔user), Workspace settings
+ selektor `timezone` (migracja `organization.timezone`, PATCH, UI).

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
