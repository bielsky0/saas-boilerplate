# Faza 5.1 — Strony bez backendu (plan implementacji)

Status: plan. Wejście: [etap-5.md](etap-5.md), template HEAD `dd1afd2` bez zmian.

Cel: strony-wzorce AdminCN (formularze, tabele demo, error, menu-level).
Zero backendu z definicji — formularze kończą się na toascie, tabele na
stałych danych z jawnym banerem demo. Bez speców E2E (decyzja etapowa);
weryfikacja: typecheck/lint/format/build + walkthrough MCP.

## Krok 0 — Kopie (źródło: `/tmp/admincn-free/src/`)

### 0a. Nowe prymitywy UI (bez kolizji)

| Źródło                       | Cel                          | Uwagi                                                                   |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `components/ui/checkbox.tsx` | `components/ui/checkbox.tsx` | Base UI, używany przez datatable (selekcja wierszy); u nas nie istnieje |

### 0b. Widoki (kopiować + adaptować, tabela reguł poniżej)

| Źródło                                            | Cel                                                         |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `views/forms/form-layouts/vertical/*` (3 pliki)   | `features/demo/forms/vertical/*`                            |
| `views/forms/form-layouts/horizontal/*` (3 pliki) | `features/demo/forms/horizontal/*`                          |
| `views/forms/form-validation/*` (3 pliki)         | `features/demo/forms/validation/*`                          |
| `views/datatables/basic/*` (2 pliki)              | `features/demo/datatables/basic/*`                          |
| `views/datatables/filters/*` (2 pliki)            | `features/demo/datatables/filters/*`                        |
| `views/datatables/pinnable-columns/*` (2 pliki)   | `features/demo/datatables/pinnable/*`                       |
| `views/datatables/index.tsx`                      | kompozycja w `features/demo/datatables/datatable-demos.tsx` |
| `views/pages/misc/error-page/index.tsx`           | `features/demo/misc/error-demo.tsx`                         |

Nowy katalog `features/demo/` (nie `features/orders` — to nie domena, tylko
galeria wzorców; trzymane razem, żeby jedno spojrzenie mówiło "demo").

### 0c. Reguły adaptacji (do każdego kopiowanego pliku)

1. `ui/field` (`Field/FieldError/FieldLabel/FieldDescription`) → NASZE
   `FormField/FormMessage/Label` z `ui/field` (Base UI field nie kopiować —
   decyzja z fazy 6: formularze zostają na Radix).
2. `ui/label` (`Label`) → `ui/field` (u nas `Label` mieszka tam; osobnego
   `label.tsx` nie tworzyć).
3. `* as z` + składnia v3 (`required_error`, komunikaty pozycyjne
   gdzie v4 ich nie przyjmuje) → PRZEPISAĆ na Zod v4; komunikaty walidacji
   do katalogu i18n (jak `profile.validation`, fabryki ze schematami).
4. `Button render={<Link/>}` → `Link + buttonVariants` (rola linku! —
   dotyczy m.in. "Go back to home" w error-demo).
5. `date-fns` — NIE dodawać; daty w demach albo stałe stringi, albo `Intl`.
6. Wszystkie hardcoded stringi → `demo.*` w EN/PL (dużo: labele formularzy,
   nagłówki tabel, statusy-atrapy, komunikaty toastów).
7. `next/link` → i18n `Link` tam, gdzie komponenty linkują wewnętrznie.
8. Single quotes z template'u znormalizuje prettier przy zapisie.

### 0d. Czego NIE kopiować

`command`/`input-otp`/`resizable` (poza zakresem fazy), `chart.tsx` (mamy),
`datatable-transaction.tsx` (mamy jako tabelę transakcji), mock-`fake-db`
(tego katalogu w template nie ma dla tych widoków — dane są inline;
zostają inline + baner).

## Krok 1 — Baner demo (wspólny komponent)

`features/demo/components/demo-banner.tsx`: `Alert`/`Badge` z tekstem
"strona demonstracyjna — dane przykładowe" (i18n `demo.banner.*`).
Renderowany NA GÓRZE każdej trasy demo (datatable + forms? formularze
nie pokazują danych — tam wystarczy, że submit idzie w toast; baner
tylko tam, gdzie widać cudze liczby: datatable ×3). Decyzja jawna i
jedna, żeby reguła "zero fake-db" miała udokumentowany wyjątek.

## Krok 2 — Trasy (RSC: metadata + `<DemoView/>`, jak dashboard)

| Trasa                          | Treść                                                                       |
| ------------------------------ | --------------------------------------------------------------------------- |
| `/(app)/demo/forms/vertical`   | layout vertical + with-icon                                                 |
| `/(app)/demo/forms/horizontal` | layout horizontal + with-icon                                               |
| `/(app)/demo/forms/validation` | validation-demos + registration-demo                                        |
| `/(app)/demo/datatable`        | basic + pinnable + filters (kompozycja jak template)                        |
| `/(app)/demo/error`            | error-demo (osobna trasa, NIE nadpisuje `forbidden.tsx` ani domyślnego 404) |

Prefix `demo/` zamiast mapowania 1:1 ścieżek template'u (`/forms/...`,
`/datatable`, `/pages/misc/...`) — nasze `/settings`, `/orgs` itd. już
znaczą co innego; jedna grupa `demo` mówi wprost, że to galeria.

## Krok 3 — Nav + menu-level

- Nowa grupa nav (po Apps): Demo → Forms (Vertical, Horizontal, Validation),
  Data Table, Error Page. Etykiety z `nav.admin` (rozszerzyć).
- Menu-level demo: zagnieżdżone wpisy `Menu Item / Menu Level 1 / Menu Level 2`
  z `href: "#"` w tej samej grupie ( demonstracja drzewa; klik nic nie robi —
  jak w template).

## Krok 4 — Weryfikacja (bez E2E) i commit

1. `typecheck + lint + format + build`.
2. Walkthrough MCP: 5 tras (EN: formularze wypełnij + submit→toast; tabele:
   sortowanie/filtry/paginacja na mockach; error-demo; menu-level rozwija),
   PL smoke 1 trasy, dark, mobile 390 (tabele scrollują poziomo w karcie —
   sprawdzić brak h-scrolla strony), zero błędów konsoli/hydratacji.
3. Commit `feat(web): demo pages (etap-5 faza 5.1)`.

## Ryzyka

- **Objętość i18n**: formularze i tabele to ~100 nowych kluczy ×2 języki.
  Mechaniczne, ale największy kawał fazy — nie pomijać (reguła repo).
- **`mode: onChange/onBlur` + Base Input**: demo trybów walidacji na naszym
  Inpucie — jeśli Base UI Input gubi `onBlur` z RHF `Controller`, test MCP
  to wykaże (pola dotykane celowo).
- **Pinnable columns na Table v8**: template pisany na 8.21.3 — mamy dokładnie
  tę wersję (downgrade z fazy 3), więc API się zgadza.
- **Pokusa logiki**: formularze demo NIE dostają endpointów "bo łatwo" —
  granica fazy to brak backendu; backendowe formularze to faza 5.2+ (profil
  już ma, invite ma).
