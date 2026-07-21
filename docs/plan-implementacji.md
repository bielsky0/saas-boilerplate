# Plan implementacji: langlion (Moduł Grup i Rezerwacji)

**Utworzono:** 2026-07-19
**Podstawa:** `docs/specyfikacja.md` — wersja dokumentu 19 (EPIK 44 hasło klienta jako alternatywna metoda logowania), budowana na v18 (EPIK 41 karta kwalifikacyjna wypoczynku, EPIK 42 opłaty dodatkowe ad-hoc `extra_fee`, EPIK 43 tematy lekcji + prace domowe), v17 (EPIK 36–40 + stawka godzinowa), v16 (EPIK 34 dyspozycyjność trenerów, EPIK 35 e-dziennik: oceny i notatki — rozszerzenie EPIK 31), v15 (EPIK 31 obecność, EPIK 32 wynagrodzenia trenerów, EPIK 33 indywidualne ceny klienta), rewizja 14.2 (adresowanie, `class_session`), rewizja 14.1 (encja `client`)
**Specyfikacja fundamentu:** `docs/boilerplate-spec.md` (odwołania „boilerplate §X")
**Dokument siostrzany:** `docs/specyfikacja-cms.md` — moduł Website Builder (Payload CMS). Nie jest objęty fazami tego planu, ale **dzieli z EPIK 4 jedną zależność blokującą: routing subdomenowy** (patrz „Otwarte pytania"). Middleware budowany raz, dla obu modułów — nie dwa równoległe routingi.
**Konwencje kodu:** `docs/ARCHITECTURE.md`

**To jest spis treści.** Pełna treść planu została podzielona na osobne pliki tematyczne w `docs/plan/`, ponieważ oryginalny dokument (1042 linie) był zbyt duży do wygodnego wczytywania w całości. Zanim zaczniesz czytać którykolwiek z plików poniżej, zapytaj graf graphify o konkretną fazę/temat — patrz sekcja „Duże dokumenty — zasady dostępu" w `CLAUDE.md`.

Ten plik jest nadal **jedynym trwałym źródłem prawdy o planie i postępie** między sesjami pracy — aktualizacje statusu faz i korekty planu robimy w plikach `docs/plan/*.md`, nie tutaj.

## Spis sekcji

| Sekcja                                                                           | Plik                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Rozstrzygnięcia wiążące dla wszystkich faz + Stan na start (audyt)               | [docs/plan/00-rozstrzygniecia-i-audyt.md](plan/00-rozstrzygniecia-i-audyt.md) |
| Faza 0 — Fundament domeny: dokumenty + rdzeń modelu danych + infrastruktura RLS  | [docs/plan/faza-0.md](plan/faza-0.md)                                         |
| Faza 1 (1a, 1b) — ⚠️ RLS retrofit tabel tenantowych boilerplate'u                | [docs/plan/faza-1.md](plan/faza-1.md)                                         |
| Faza 2 — Schedule-First: definicje, wzorce, generowanie sezonu (panel akademii)  | [docs/plan/faza-2.md](plan/faza-2.md)                                         |
| Faza 3 — ⚠️ Tożsamość klienta: encja client + OTP + sesja klienta (odejście #2)  | [docs/plan/faza-3.md](plan/faza-3.md)                                         |
| Faza 4 — System kredytowy (silnik)                                               | [docs/plan/faza-4.md](plan/faza-4.md)                                         |
| Faza 4.5 — ⚠️ Middleware subdomenowy: rozpoznanie tenanta z `Host`               | [docs/plan/faza-4.5.md](plan/faza-4.5.md)                                     |
| Faza 4.6 — Migracja panelu personelu na hosty tenantów                           | [docs/plan/faza-4.6.md](plan/faza-4.6.md)                                     |
| Faza 5 — Publiczny zapis + płatność na miejscu + współbieżność end-to-end        | [docs/plan/faza-5.md](plan/faza-5.md)                                         |
| Faza 5.5 — ⚠️ Handoff sesji personelu między apeksem a hostem tenanta            | [docs/plan/faza-5.5.md](plan/faza-5.5.md)                                     |
| Faza 6 — Panel trenera i recepcji                                                | [docs/plan/faza-6.md](plan/faza-6.md)                                         |
| Faza 7 — Dopisanie, anulowanie 24h, odrabianie, anulowania administracyjne       | [docs/plan/faza-7.md](plan/faza-7.md)                                         |
| Faza 8 — Soft delete domenowy + reasygnacje                                      | [docs/plan/faza-8.md](plan/faza-8.md)                                         |
| Faza 9 — ⚠️ Plany i limity jako dane w DB (EPIK 29; odejście od plans.ts)        | [docs/plan/faza-9.md](plan/faza-9.md)                                         |
| Faza 10 — ⚠️ Stripe Connect per organizacja (EPIK 30; Zasada #7)                 | [docs/plan/faza-10.md](plan/faza-10.md)                                       |
| Faza 11 — Płatność online za pojedyncze zajęcia (EPIK 5)                         | [docs/plan/faza-11.md](plan/faza-11.md)                                       |
| Faza 12 — Pakiety i subskrypcje (EPIK 9, 10, 23, 25)                             | [docs/plan/faza-12.md](plan/faza-12.md)                                       |
| Faza 13 — Portfel klienta UI (§7.12)                                             | [docs/plan/faza-13.md](plan/faza-13.md)                                       |
| Faza 14 — ⚠️ Notification Center domenowy (EPIK 26; odejście #1)                 | [docs/plan/faza-14.md](plan/faza-14.md)                                       |
| Faza 15 — Zmiana Grupy (swap) + przeniesienie kredytu między dziećmi             | [docs/plan/faza-15.md](plan/faza-15.md)                                       |
| Faza 16 — Zwroty fiducjarne (EPIK 18)                                            | [docs/plan/faza-16.md](plan/faza-16.md)                                       |
| Faza 17 — Regulaminy i akceptacje (EPIK 28)                                      | [docs/plan/faza-17.md](plan/faza-17.md)                                       |
| Faza 17.5 — Dyspozycyjność trenerów (EPIK 34, v16)                               | [docs/plan/faza-17.5.md](plan/faza-17.5.md)                                   |
| Faza 18 — Silniki Availability-First i Slot-First + Force Override               | [docs/plan/faza-18.md](plan/faza-18.md)                                       |
| Faza 19 — Warunkowe UI formularza + fakturowanie ręczne                          | [docs/plan/faza-19.md](plan/faza-19.md)                                       |
| Faza 20 — Wynagrodzenia trenerów, wyłącznie informacyjne (EPIK 32, v15)          | [docs/plan/faza-20.md](plan/faza-20.md)                                       |
| Faza 21 — Indywidualne ceny klienta (EPIK 33, v15)                               | [docs/plan/faza-21.md](plan/faza-21.md)                                       |
| Fazy 22–25 — poprawki konkurencyjne (spec v17)                                   | [docs/plan/faza-22-25.md](plan/faza-22-25.md)                                 |
| Fazy 26–28 — dalsze poprawki konkurencyjne (spec v18)                            | [docs/plan/faza-26-28.md](plan/faza-26-28.md)                                 |
| Faza 29 (29a, 29b) — Hasło klienta jako alternatywna metoda logowania (spec v19) | [docs/plan/faza-29.md](plan/faza-29.md)                                       |
| Ryzyka i otwarte pytania                                                         | [docs/plan/ryzyka-i-otwarte-pytania.md](plan/ryzyka-i-otwarte-pytania.md)     |
