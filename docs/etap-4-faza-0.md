# Faza 0 — Inwentaryzacja AdminCN Free (wynik)

Stan template'u: commit `dd1afd2` ("refactor(sidebar): update sidebar with collapsible icon fix"),
sklonowany do `/tmp/admincn-free`. Poniżej pełny wynik inwentaryzacji wymaganej
przez [etap-4.md](etap-4.md): co przenosimy, co wyrzucamy, kolizje zależności,
mapowanie tras i brakujące endpointy Nest.

## 0. Najważniejsze ustalenie: dwa systemy prymitywów

Template **nie używa Radixa**. Wszystkie 28 plików w `src/components/ui`
stoi na **`@base-ui/react@1.6.0`** (Base UI — `Dialog`, `Menu`, `Select`,
`Tabs`, `Checkbox`, `Switch`, `Tooltip`, `Collapsible`, `useRender`/`mergeProps`
itd.). Boilerplate używa `@radix-ui/*` (dialog, dropdown-menu, label, select,
slot) — w template nie ma ani jednego importu `@radix-ui`.

Decyzja: **dokładamy `@base-ui/react` i kopiujemy pliki `ui/` 1:1 z template'u,
zastępując kolidujące nazwy.** Utrzymywanie dwóch implementacji `button.tsx`
/ `dialog.tsx` / `select.tsx` nie wchodzi w grę (ten sam alias `@/components/ui`,
ten sam `cn()`). Przepisywanie 22KB `sidebar.tsx` i całego drzewa menu z
`render={<Link/>}` (API Base UI) na Radix to więcej pracy niż podmiana plików.
Shadcn i tak idzie w stronę Base UI (`components.json`: `"style": "base-vega"`),
więc to jest zgodne z kierunkiem ekosystemu.

Konsekwencja do zweryfikowania w fazie 1/2: istniejące użycia w boilerplate
(`features/auth`, `features/organizations`, `features/billing`, `NotificationBell`,
`AccountSwitcher`) muszą działać na podmienionych prymitywach. API jest
zbliżone (shadcn), ale są różnice sygnatur, np.:

- Base UI `DropdownMenuTrigger`/`CollapsibleTrigger` przyjmują `render={...}`
  zamiast `asChild`; `nativeButton={false}` przy zagnieżdżaniu triggerów.
- Template'owy `Button` przyjmuje `render` + `nativeButton` (przykład:
  `views/pages/auth/login/index.tsx:68`).
- Template'owy `Field` ≠ boilerplate'owy `field.tsx` (template ma
  `Field/FieldGroup/FieldLabel/FieldError/FieldSet/FieldLegend` po Base UI;
  boilerplate ma `Label/FormField/FormMessage`). Plik docelowy = wersja
  z template'u; użycia `FormField/FormMessage` w boilerplate trzeba przepisać.
- Template'owy `sonner.tsx` robi `@/components/ui/sonner` + `useTheme`
  z `next-themes` — jak nasz; scalić w jeden.

## 1. Shell (faza 2) — pliki i adaptacje

| Źródło (`/tmp/admincn-free/src/…`)                         | Cel (`apps/web/src/…`)                | Uwagi                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/sidebar.tsx` (21 KB)                        | `components/ui/sidebar.tsx` (nowy)    | Rdzeń powłoki: `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarTrigger`, `useSidebar`. Wymaga tokenów `--sidebar-*` (pkt 5). Stan `open` trzymany w cookie (`_sidebar_state` — do sprawdzenia przy kopiowaniu; cookie musi przejść przez `proxy.ts`, który klonuje nagłówki, więc zadziała, ale do weryfikacji).                                              |
| `components/layout/Sidebar.tsx` (22 KB)                    | `components/layout/admin-sidebar.tsx` | Client. `usePathname` + `useSearchParams` do aktywnego menu. **Do przepisania:** `next/link` → `@/lib/i18n/navigation` Link; `pathname === href` / `startsWith` muszą ignorować segment `[locale]` (helper `stripLocale`). Gałęzie Pro / zewnętrzne (`isExternalLink`) **usunąć** — bierzemy tylko wpisy lokalne.                                                   |
| `components/layout/Header.tsx`                             | `components/layout/admin-header.tsx`  | Breadcrumb z segmentów pathname — **odcinać locale** i mapować `users/list` → label. **Usunąć** przycisk GitHub (`buttons.github.io/buttons.js` — zewnętrzny skrypt, zabije CSP `script-src`). `LanguageDropdown` → nasz `locale-switcher`. `ProfileDropdown` → wersja na sesji (pkt 1.1). `ModeToggle` → nasz `theme-toggle` (te same, `next-themes` 0.4.6 w obu). |
| `components/layout/Footer.tsx`                             | scalić z istniejącą stopką            | **Zachować link `shadcnstudio.com`** — wymóg licencji MIT template'u.                                                                                                                                                                                                                                                                                               |
| `components/layout/BlankLayout.tsx`                        | nie kopiować                          | Trywialny wrapper `<div>` — niepotrzebny.                                                                                                                                                                                                                                                                                                                           |
| `components/layout/ScrollToTop.tsx`                        | nie kopiować / do oceny               | Drobiazg UX; opcjonalnie w fazie 6.                                                                                                                                                                                                                                                                                                                                 |
| `components/layout/Download.tsx`                           | **NIE kopiować**                      | Przycisk "Download" template'u (promo).                                                                                                                                                                                                                                                                                                                             |
| `configs/navConfig.tsx`                                    | `configs/admin-nav.tsx` (nowy)        | Przepisać na nasze trasy (pkt 4). Typy `MenuItem/NavItem` — wziąć w całości, to dobry kształt. Wszystkie wpisy `Pro` / zewnętrzne odrzucić.                                                                                                                                                                                                                         |
| `configs/themeConfig.ts`                                   | scalić do `lib/site.ts`               | Zawiera tylko `templateName` + `homePageUrl` — nie osobny plik.                                                                                                                                                                                                                                                                                                     |
| `components/Providers.tsx`                                 | **nie kopiować**                      | Zastąpione: nasz root layout dostaje `NuqsAdapter` + `SidebarProvider` obok istniejącego `ThemeProvider` (z `nonce` — wersja z template'u nonce nie zna, więc nasza zostaje).                                                                                                                                                                                       |
| `components/ThemeProvider.tsx`                             | nie kopiować                          | Nasz `theme-provider.tsx` już to robi (z `nonce`).                                                                                                                                                                                                                                                                                                                  |
| `components/shared/Logo.tsx` + `assets/svg/logo.tsx`       | `components/layout/admin-logo.tsx`    | SVG logo template'u; podmienić na markę boilerplate'u w fazie 2.                                                                                                                                                                                                                                                                                                    |
| `assets/svg/auth-background-shape.tsx`                     | `components/auth/auth-background.tsx` | Tło stron auth (faza 5). Sprawdzić `img-src`/`style-src` pod CSP.                                                                                                                                                                                                                                                                                                   |
| `app/api/nav-apps/route.ts` + `lib/nav-apps.ts`            | **NIE kopiować**                      | Promo-fetcher z CDN (`cdn.shadcnstudio.com/.../nav-apps.json`), dokleja pozycje "Pro" do grupy Apps. Sidebar ma jawne komentarze "Remove when the nav-apps API is removed". U nas: usunąć `useEffect(getNavApps)` z kopii Sidebar.tsx.                                                                                                                              |
| `components/shared/LanguageDropdown.tsx`                   | **nie kopiować**                      | Atrapa na lokalnym `useState` (english/deutsch/…), bez żadnego i18n. Zastępuje ją nasz `locale-switcher`.                                                                                                                                                                                                                                                           |
| Obrazki `public/images/` (avatary, brandy, flagi, widgety) | selektywnie do `apps/web/public/`     | Potrzebne: avatary fallback dla tabel/transakcji (albo generowane inicjały — decyzja w fazie 3/4; kopiowanie 20 plików `.webp` to balast). Flagi z `personal-info.tsx` — do wyrzucenia razem z hardcoded listą krajów (zastąpić TBD).                                                                                                                               |

### 1.1 ProfileDropdown — atrapa do podpięcia

`STATIC_USER = { fullName: 'John Doe', email: 'john.doe@example.com', imageUrl: '/images/avatars/avatar-1.webp' }`.
Wydmuszka: "My Account" → `/pages/user-profile`, "Settings" → `/pages/user-settings`,
"Sign out" → link do strony logowania (nie wylogowuje!). W fazie 2 podpiąć:
dane z `session.user` (props z RSC layoutu), "Sign out" → istniejący `SignOutButton`
z `features/auth`, linki → nasze trasy. `AccountSwitcher` + `NotificationBell`
z obecnego layoutu wkomponować w header obok.

### 1.2 Brak i18n w template — potwierdzone

Zero słowników, zero `next-intl`. Wszystkie stringi hardcoded po angielsku.
Każdy kopiowany widok wymaga kluczy w katalogach `next-intl` (fazy 2–5).
`useQueryState` z `nuqs` do zakładek (`user-settings-tabs.tsx`,
`user-profile-tabs.tsx`) — działa niezależnie od locale, przepisać tylko Linki.

## 2. Widoki i dane

### 2.1 Orders dashboard — 100% stałych w kodzie

`app/(pages)/dashboard/orders/page.tsx` (346 linii): `StatisticsCardData` (3 karty),
`earningData` (2 wiersze), `transactionData` (25 wierszy `Item`) — wszystko
inline w pliku route. Komponenty (`statistics-card-01`, `chart-sales-metrics`
— Bar+Pie z recharts, `widget-product-insights` — 2× BarChart,
`widget-total-earning`, `datatable-transaction` — TanStack Table z sortowaniem,
filtrowaniem i paginacją client-side + `hooks/use-pagination.ts`) biorą dane
wyłącznie z props / stałych zdefiniowanych w sobie. **Brak `fake-db`,
brak fetcha, brak `nuqs` w dashboardzie.** Wszystkie liczby i wykresy to
atrapy ("Sandy' Company", "Zipcar -$23,569.26", "Plan completed 56%").

Wniosek: tabela mock→endpoint dla orders to po prostu "stałe w page.tsx
i w 4 komponentach → NOWE endpointy Nest" (pkt 6). Kształt docelowego API
projektujemy w fazie 3 pod nasz model (nie ma czego mapować 1:1).

Do skopiowania w fazie 3: 4 komponenty widoków + `components/ui/chart.tsx`
(wrapper ~10 KB na recharts, wymagany przez wykresy) + `hooks/use-pagination.ts`

- typy `Item` z `datatable-transaction.tsx` (jako punkt startu kontraktu).

### 2.2 Users — `fake-db` + client-side state, widok "view" to atrapa na pierwszym rekordzie

- `fake-db/apps/users.ts` eksportuje `users: AppUser[]` (kilkadziesiąt bogatych
  rekordów z projektami, timeline, fakturami, urządzeniami, connections).
- `hooks/use-user-app.ts` (309 linii): **cały "backend" to `useState(seedUsers)`
  - `useMemo` (filtr/sort/paginacja) + handlery add/update/delete.**
    Filtrowanie po `role/plan/status/search`, sortowanie po 6 kolumnach,
    `rowsPerPage=10`, selekcja wierszy. W fazie 4 ten hook zamieniamy na
    `useQuery` (+ `nuqs` do filtrów w URL, żeby zastąpić lokalny `useState`).
- `views/apps/users/list/` (7 plików: `index`, `user-table`, `user-table-columns`,
  `user-table-filters`, `user-table-toolbar`, `user-table-pagination`,
  `dialogs/add-edit-user-sheet.tsx`): tabela TanStack (`getCoreRowModel`,
  kontrolowana selekcja), kolumny z `date-fns/format` dla `joinedDate`,
  arkusz add/edit na RHF+`zod` (`UserFormData` = name/email/contact/company/
  country/role/plan/status).
- `views/apps/users/view/` to **atrapa**: `const STATIC_USER = users[0]`
  (`user-001`), brak parametru id w route (`view/page.tsx` bez `[id]`).
  W fazie 4 route musi być `users/[id]` + `useUser(id)`.
- Typ `AppUser` (pkt: `types/apps/user-types.ts`): `id/name/email/avatar?`,
  `role: Admin|Editor|Subscriber|Maintainer|Guest`, `plan: Basic|Team|Enterprise`,
  `status: Active|Pending|Suspended|Inactive`, `billing: Auto Debit|Manual|Credit Card`,
  `company/country/contact/joinedDate(ISO)/coverImage/website/skype/socialLinks`,
  `tasksDone/projectsDone`, `username/billingEmail/taxId/language`,
  `projects[]/activityLog[]/billingPlan/invoices[]/connections[]/teamMemberships[]/
recentDevices[]/twoFactorEnabled/notificationSettings[]`.

  **Rozjazd z Nest (krytyczny dla fazy 4):** `GET /v1/admin/users` zwraca
  `{ rows: [{ id, email, name, emailVerified, isSuperAdmin, status, createdAt }], page, hasNext }`
  gdzie `status ∈ active|suspended|deleted`, paginacja `ADMIN_PAGE_SIZE` + `hasNext`
  (nie `totalPages`), filtry `q/status/from/to` (nie `role/plan`), sortowanie tylko
  `createdAt desc`. **Cała warstwa `role/plan/billing` z template'u nie ma odpowiednika
  w Nest.** Faza 4 musi jawnie zdecydować: (a) okroić UI Users do pól Nest
  (rekomendowane na start), albo (b) rozszerzyć model Nest o role/plan/billing.
  Dodatkowo endpoint jest za `SuperAdminGuard` — decyzja, czy Users w AdminCN
  pokazuje `GET /v1/admin/users` (tylko super-admin), czy nowy endpoint
  per-tenant (np. członkowie organizacji z `GET /v1/organizations/:slug/members`).
  To rozstrzyga dylemat `/users` vs `/orgs` vs `/admin`: **propozycja — `/users`
  jako widok członków bieżącej organizacji (dane z members), a surowy
  `GET /v1/admin/users` zostaje w istniejącym `/admin`.** Ostateczna decyzja
  na starcie fazy 4.

### 2.3 Settings / Profile — sekcje statyczne, formularze bez logiki

- `user-settings`: zakładki `general|workspace` przez `nuqs` (`?setting=`).
  Sekcje general: `personal-info` (upload awatara — atrapa z `useRef`, select
  kraju z **hardcoded listą 9 krajów + `/images/flags/*.webp`** — do wyrzucenia),
  `email-password`, `connect-account`, `social-url`, `danger-zone`.
  Sekcje workspace: `workspace-name/detail/data/organizations/danger-zone`
  (`workspace-data.tsx` robi `toast` z sonner — jedyna "logika").
  **Żaden formularz nie ma RHF ani submit** — czyste JSX-Inputy.
- `user-profile`: zakładki `profile|connections` przez `nuqs` (`?view=`),
  dane z `fake-db/pages/user-profile.ts`, typy w `types/pages/user-profile-types.ts`.
- Mapowanie tras: template `/pages/user-settings?setting=` + `/pages/user-profile?view=`
  → nasze istniejące `/(app)/settings/*`. Istniejące trasy settings w boilerplate
  (do sprawdzenia w fazie 4: `/(app)/settings/` — pliki) zostają, podmieniamy
  tylko treść sekcji. Zdjęcia/cover z `fake-db` odpadają (brak storage w zakresie).

### 2.4 Auth — czyste atrapy, idealne do reskinu

Wszystkie 5 formularzy (`login`, `register`, `forgot-password`, `reset-password`,
`two-steps`) to `<form onSubmit={e => e.preventDefault()}>` — zero walidacji,
zero RHF, zero fetcha. Pola: login (email/hasło/remember + link do forgot),
register (username/email/hasło/potwierdzenie/checkbox policy), forgot (email),
reset (email/nowe/potwierdzenie), two-steps (6× `InputOTP` — jedyne użycie
`input-otp`). Strony (`views/pages/auth/*/index.tsx`) dodają kartę, logo,
"Login as User / Login as Admin" (atrapy — **usunąć**), "Sign in with google"
(atrapa — usunąć albo podpiąć pod istniejący OAuth, do decyzji w fazie 5),
linki krzyżowe (`/pages/auth/register` → przepisać na nasze trasy).

Wniosek: kopiujemy JSX + klasy, cała logika (akcje `features/auth`, Better Auth,
wywołania Nest) zostaje. `two-steps` pomijamy (Nest nie ma endpointów 2FA —
`auth.controller.ts` ma tylko sign-up/sign-in/sign-out/password-reset/verify-email;
Better Auth w boilerplate nie ma włączonego 2FA).

### 2.5 Datatable / form-validation — wzorce, nie strony

- `views/datatables/*` (basic/filters/pinnable + `datatable-transaction`):
  wzorce TanStack Table na stałych danych. Nie kopiujemy jako tras;
  `datatable-transaction` wchodzi w skład dashboardu (pkt 2.1).
- `form-validation/registration-demo-form.tsx`: wzorzec RHF + `zodResolver` +
  `Controller` + `FieldError` + `toast.custom` — do naśladowania w fazie 4/5,
  nie do kopiowania jako strona.
- Mail/Calendar (poza zakresem, odnotowane współdzielenia): mail używa
  `resizable` (layout 2-panele), `date-fns`, `use-mail-app`; calendar —
  `date-fns` + `calendar-utils` + 2 hooki czasowe. Oba jedzą `fake-db/apps/*`.
  Współdzielone z zakresem: `date-fns` (kolumny users, billing-tab),
  `Select/Dialog/Sheet/Avatar/Badge` ui. Rezygnacja z mail/calendar **nie blokuje**
  niczego w zakresie — żadnych wspólnych typów ani hooków.

## 3. Zależności — decyzje

| Pakiet                                                                                           | Template                   | Web        | Decyzja                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@base-ui/react`                                                                                 | 1.6.0                      | —          | **DODAĆ.** Fundament wszystkich kopiowanych `ui/*`.                                                                                                                                                                                                                                                         |
| `@tanstack/react-table`                                                                          | 8.21.3                     | —          | **DODAĆ** (faza 1).                                                                                                                                                                                                                                                                                         |
| `@tanstack/react-query` (+devtools)                                                              | — (template go nie używa!) | —          | **DODAĆ** (faza 1). Uwaga: mimo logo TanStack na stronie template'u, kod używa tylko Table + `useState` — Query wprowadzamy my.                                                                                                                                                                             |
| `recharts`                                                                                       | 3.8.0                      | —          | **DODAĆ** (faza 1/3). Pod CSP `enforce` do przetestowania (SVG, brak inline scripts — niskie ryzyko).                                                                                                                                                                                                       |
| `react-hook-form`                                                                                | 7.81.0                     | —          | **DODAĆ** (faza 1).                                                                                                                                                                                                                                                                                         |
| `@hookform/resolvers`                                                                            | 5.4.0                      | —          | **DODAĆ** (faza 1).                                                                                                                                                                                                                                                                                         |
| `nuqs`                                                                                           | 2.9.0                      | —          | **DODAĆ** (faza 1). Wymaga `NuqsAdapter` w root layout (jak w template).                                                                                                                                                                                                                                    |
| `date-fns`                                                                                       | 4.4.0                      | —          | **DODAĆ** (małe użycie: `format` w kolumnach users) albo zastąpić `Intl` — decyzja w fazie 4 (rekomendacja: dodać, koszt minimalny).                                                                                                                                                                        |
| `zod`                                                                                            | 3.25.76                    | ^4.1.13    | **NIE ruszać** (zostaje v4). Adaptować schematy z template'u: `* as z` → `import { z }`; `z.enum([...], { required_error })` nie istnieje w v4 (komunikaty przez `.refine` / globalne locale) — do przepisania przy kopiowaniu formularzy. Boilerplate ma `@repo/validation` — nowe schematy najlepiej tam. |
| `next`                                                                                           | 16.2.6                     | 16.2.10    | Zostaje nasza.                                                                                                                                                                                                                                                                                              |
| `sonner` / `next-themes` / `lucide-react` / `cva` / `clsx` / `tailwind-merge` / `tw-animate-css` | identyczne wersje          | identyczne | Bez zmian.                                                                                                                                                                                                                                                                                                  |
| `cmdk` (command.tsx), `input-otp` (two-steps), `react-resizable-panels` (resizable.tsx, mail)    | tak                        | —          | **NIE dodawać** — tylko poza zakresem. Jeśli przy kopiowaniu `ui/` weźmiemy te 3 pliki, usunąć je lub doinstalować (decyzja: usunąć — nieużywane w zakresie).                                                                                                                                               |
| `shadcn` (CLI, deps template)                                                                    | 4.13.0                     | —          | Nie dotyczy (narzędzie, nie runtime).                                                                                                                                                                                                                                                                       |

## 4. Mapowanie tras (docelowe, po fazie 2–5)

| Template                                                 | Boilerplate (docelowo)                                                                   | Uwagi                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/orders`                                      | `/(app)/dashboard` (istnieje)                                                            | Orders staje się treścią `/dashboard`; osobna ścieżka `/dashboard/orders` niepotrzebna. Stary prosty dashboard znika w fazie 3. |
| `/apps/users/list`, `/apps/users/view`                   | `/(app)/users`, `/(app)/users/[id]` (nowe)                                               | Patrz decyzja dot. źródła danych w pkt 2.2.                                                                                     |
| `/pages/user-settings?setting=`                          | `/(app)/settings/*` (istniejące)                                                         | Treść sekcji z template'u, trasy nasze.                                                                                         |
| `/pages/user-profile?view=`                              | `/(app)/settings/profile` lub profil w users (decyzja fazy 4)                            | Nie dublować `/pages/*`.                                                                                                        |
| `/pages/auth/login` itp.                                 | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` (istniejące) | Tylko JSX (faza 5).                                                                                                             |
| `/datatable`, `/forms/*`, `/apps/mail`, `/apps/calendar` | — (nie przenosimy)                                                                       | Poza zakresem per etap-4.                                                                                                       |
| `/pages/misc/error-page`                                 | istniejący `forbidden.tsx` + 404                                                         | Nie kopiować; nasza obsługa błędów zostaje.                                                                                     |

Wszystkie hrefy w kopii `navConfig` dostają prefix przez `@/lib/i18n/navigation`
Link (goły `next/link` zakazany w nowym kodzie — reguła z etap-4).

## 5. Style — co dokładamy do `globals.css` (nie zamieniamy pliku)

Template: tokeny **oklch**, `@import 'shadcn/tailwind.css'`, `@theme inline`
mapujące `--color-*: var(--*)`, osobne zestawy `--sidebar-*` i `--chart-*`
(light/dark). Boilerplate: trójki HSL + `hsl(var(--*))`.

Kopiowane komponenty wymagają tych klas/tokenów (inaczej rozjadą się wizualnie):

1. `--sidebar`, `--sidebar-foreground`, `--sidebar-primary(-foreground)`,
   `--sidebar-accent(-foreground)`, `--sidebar-border`, `--sidebar-ring`
   (+ mapowania `--color-sidebar-*` w `@theme inline`) — sidebar, header, menu.
2. `--chart-1…5` (+ `--color-chart-*`) — `chart.tsx` i kolory wykresów.
3. Klasy `input-size-lg` (two-steps — **poza zakresem**, odpada),
   `github-button` (usuwamy z headera) — nie kopiować.
4. `max-w-360`, `size-*`, `min-h-13`, `h-38.5` — Tailwind v4 generuje
   dynamicznie ze skali spacing — działa bez zmian.
5. `color-mix(in oklab, var(--primary) 60%, transparent)` w configach wykresów —
   działa z naszym `--primary` (HSL) bez zmian, bo `color-mix` przyjmuje
   dowolny kolor; do weryfikacji wizualnej w fazie 3.
6. `bg-primary/10`, `text-accent-foreground`, `ring-foreground/10` — nasze
   tokeny już to pokrywają (opacity modifiers na `hsl(var())` działają).
7. `@import 'shadcn/tailwind.css'` — pakiet `shadcn@4.13.0` jako zależność
   CSS-owa; **nie importować całości** (ciągnie obce tokeny/utilities).
   Jeśli przy kopiowaniu wyjdą braki konkretnych utilities, donieść pojedynczo.
8. `.dark` zostaje na klasie (obie strony tak mają); `next-themes` z `nonce`
   — nasza konfiguracja zostaje.

Rekomendacja: tokeny sidebar/chart dopisać w HSL (kontynuacja konwencji
boilerplate'u), nie kopiować wartości oklch — kolory neutralne i tak są
bliskie (`oklch(0.205 0 0)` ≈ nasz `--primary: 0 0% 9%`).

## 6. Tabela mock → endpoint (wejście do faz 3–4)

| Mock w template                                                                                      | Co eksportuje                                                     | Cel w Nest                                                                                                               | Status                                          |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Stałe w `dashboard/orders/page.tsx` (`StatisticsCardData`, `earningData`, `transactionData: Item[]`) | 3 statystyki, 2 wiersze earning, 25 transakcji                    | **NOWE endpointy** (kształt do zaprojektowania w fazie 3, np. `GET /v1/dashboard/summary` + `GET /v1/transactions`)      | brak — dopisać w `apps/api` w fazie 3           |
| Stałe w `chart-sales-metrics.tsx`, `widget-product-insights.tsx`, `widget-total-earning.tsx`         | serie wykresów, metryki, cele                                     | jw. (część summary)                                                                                                      | brak                                            |
| `fake-db/apps/users.ts` → `users: AppUser[]`                                                         | lista + pełne detale (projekty, faktury, urządzenia, connections) | `GET /v1/admin/users` (istnieje, kształt inny — pkt 2.2) lub nowy endpoint per-tenant                                    | istnieje częściowo — decyzja kształtu w fazie 4 |
| `fake-db/pages/user-profile.ts`                                                                      | profil + connections                                              | `GET /v1/session` (istnieje — zalążek profilu) + ewentualny `GET /v1/profile`                                            | częściowo istnieje                              |
| Formularze settings/auth                                                                             | brak danych (puste JSX)                                           | istniejące `features/auth` + `POST /v1/auth/*`; profil `PATCH` — do sprawdzenia w fazie 4/5 (czy Nest ma update profilu) | do weryfikacji                                  |
| `fake-db/apps/mail.ts`, `fake-db/apps/calendar.ts`                                                   | —                                                                 | — (poza zakresem, nie ruszamy)                                                                                           | n/a                                             |

## 7. Otwarte punkty — status po fazie 0

- [x] Miejsce `<QueryProvider>`: root `[locale]/layout.tsx` obok `ThemeProvider`
      (muszą go widzieć też strony auth w fazie 5; `NuqsAdapter` też w root — jak w template).
- [x] Lista nowych zależności: pkt 3 (doinstalować w fazie 1).
- [x] Kolizja prymitywów: Base UI wygrywa, Radix schodzi (pkt 0).
- [ ] Źródło danych `/users` (`admin/users` vs members org) — decyzja na starcie fazy 4.
- [ ] Kształt NOWYCH endpointów orders/summary — projekt w fazie 3.
- [ ] Avatary `.webp` z template'u vs inicjały — decyzja w fazie 3/4.
- [ ] `PATCH /v1/profile` (czy istnieje w Nest) — sprawdzić w fazie 4.
- [ ] OAuth ("Sign in with google" w login/index.tsx) — podpiąć pod istniejący `/oauth` albo usunąć w fazie 5.
