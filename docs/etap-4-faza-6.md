# Faza 6 — Porządki i szlif (plan implementacji)

Status: plan. Wejście: fazy 0–5 DONE.

Cel: domknięcie etapu — zero martwego kodu, jawne decyzje architektoniczne
zamiast długów, pełna zieleń. BEZ nowych funkcji, BEZ Mail/Calendar
(świadomie poza etapem — ewentualny follow-up).

## Krok 0 — Martwy kod (usunąć)

- `queryKeys.health` w `lib/query/keys.ts` — zero użyć (PoC usunięty w fazie 3).
  `queryKeys.session` ZOSTAJE (kontrakt invalidacji po renamie, używany).
- Sprawdzić grepem inne sieroty po fazach (TODO/FIXME, `console.log`,
  `zz-*.spec.ts` — nie powinno ich być; `.playwright-mcp/` nie istnieje
  w repo — weryfikować przed commitem).

## Krok 1 — Koegzystencja Radix + Base UI (zaakceptować, nie migrować)

Stan: `button/dropdown-menu/input/sonner` na Base UI; `dialog/select/field`
zostały na Radix (ConfirmDialog, wszystkie Selecty, FormField/FormMessage).
Migracja tych trzech na Base UI = przepisanie ConfirmDialoga, wszystkich
formularzy i selectów przy zerowej wartości biznesowej i wysokim ryzyku
regresji w walidowanych przepływach (auth, invite, billing). Decyzja:
ZOSTAJĄ na Radix; dopisać akapit do `ARCHITECTURE.md` (sekcja Stack):
prymitywy shadcn na dwóch silnikach, podział per komponent, reguła —
NOWE komponenty na Base UI, istniejące przepisujemy tylko przy okazji
dotykania ich z innego powodu. Zależności `@radix-ui/*` ZOSTAJĄ.

## Krok 2 — Małe naprawy (3 sztuki, każda z testem lub MCP-dowodem)

1. **Sales-plan overlap** (`sales-metrics.tsx`): `text-6xl` "100%" wchodzi
   na opis kohorty w wąskiej kolumnie + martwa klasa `max-lg:5xl`
   (nieistniejący utility, kopia z template'u). Fix: `text-5xl xl:text-6xl`,
   usunąć martwą klasę, rodzic `min-w-0`. Dowód: screenshot MCP.
2. **`NotificationBell` IntlError** (pre-existing, notowany od fazy 1):
   `format.relativeTime(date)` bez `now` sypie `ENVIRONMENT_FALLBACK`
   przy każdym otwarciu dzwonka. Fix: przekazać `new Date()` jako `now`
   (re-render co poll 15s i tak odświeża). Dowód: istniejący
   `notifications.spec.ts` + zero `IntlError` w MCP.
3. **Flake `pagination returns to the first page`** w pełnej suicie
   (przechodzi solo): nie gasić na siłę — najpierw JEDEN czysty przebieg
   całej suity; jeśli padnie znowu, dopisać mu `retry` na poziomie testu
   z komentarzem (headless-shell, nie aplikacja) albo podzielić asercje.
   Decyzja przy implementacji na podstawie dowodu.

## Krok 3 — Audyt zależności i plików

- `package.json` web: każda nowa zależność z faz 1–2 musi mieć użycia
  (query/table/nuqs/recharts/rhf/resolvers/base-ui — grep). Nic do usunięcia
  się nie spodziewamy; to checkpoint, nie polowanie.
- `components/ui`: każdy plik ma użycia (faza 3–5 pokryły). `field.tsx`
  zostaje (decyzja z Kroku 1).
- `docs/etap-4*.md`: statusy DONE, daty, lekcje (jw. + z tego planu).

## Krok 4 — Weryfikacja końcowa (definicja "etap zamknięty")

1. `typecheck + lint + format + build` (obie paczki).
2. Pełna suita E2E zielona poza 3 znanymi MinIO.
3. MCP: PL/EN, light/dark, mobile (dashboard + members + settings/profile
   - 1 strona auth), zero błędów konsoli i hydratacji.
4. Commit `chore: etap-4 maintenance (faza 6)` + push.

## Jawnie NIE w tej fazie

Mail/Calendar z template'u, zmiana e-maila/hasła, awatary, self-delete,
migracja dialog/select/field na Base UI, nowe endpointy, `/users`.
