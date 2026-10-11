# Faza 2 — Shell AdminCN (plan implementacji)

Status: plan. Wejście: [etap-4-faza-0.md](etap-4-faza-0.md) (inwentaryzacja),
faza 1 DONE (Query + `NuqsAdapter` w root layoucie).

Cel: jedna powłoka AdminCN (sidebar + header + footer) zamiast prostego navbara
w `(app)/layout.tsx`. Guard (`requireSession`), dane (`api()`), trasy i treść
stron BEZ ZMIAN — zmienia się tylko chrome wokół `{children}`. Grupa `(admin)`
celowo poza zakresem (osobny shell, spec 6.1).

## Krok 0 — Instalacja

`pnpm --filter web add @base-ui/react@1.6.0` — dokładnie wersja z template'u
(`sidebar.tsx`, `dropdown-menu.tsx` itd. pisane pod to API; nowsza może zmienić
`render`/`useRender`). Nic więcej (wszystkie inne deps fazy weszły w fazie 1).

## Krok 1 — Kopie plików (źródło: `/tmp/admincn-free/src/`)

### 1a. Nowe (bez kolizji) → kopiować 1:1, tylko `next/link` → i18n `Link`

| Źródło                          | Cel                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `components/ui/sidebar.tsx`     | `components/ui/sidebar.tsx`                                                       |
| `components/ui/collapsible.tsx` | `components/ui/collapsible.tsx`                                                   |
| `components/ui/breadcrumb.tsx`  | `components/ui/breadcrumb.tsx`                                                    |
| `components/ui/separator.tsx`   | `components/ui/separator.tsx`                                                     |
| `components/ui/avatar.tsx`      | `components/ui/avatar.tsx`                                                        |
| `components/ui/sheet.tsx`       | `components/ui/sheet.tsx`                                                         |
| `components/ui/skeleton.tsx`    | `components/ui/skeleton.tsx`                                                      |
| `components/ui/tooltip.tsx`     | `components/ui/tooltip.tsx`                                                       |
| `hooks/use-mobile.ts`           | `src/hooks/use-mobile.ts` (nowy katalog; alias `@/*` działa bez zmian w tsconfig) |
| `assets/svg/logo.tsx`           | `components/layout/admin-logo.tsx` (marka do podmiany: nazwa z `lib/site.ts`)     |

Przed kopiowaniem sprawdzić w każdym pliku użycia klasy `font-heading`
(template ma `--font-heading` w theme; my nie) — jeśli występuje, dodać alias
tokenu albo zamienić na `font-sans` i odnotować.

### 1b. Podmiany (kolizja nazw) — kopiować + migrować call sites

| Plik                   | Zmiana API                                                                                                                          | Call sites do migracji (`asChild` → `render`)                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/button.tsx`        | `asChild` znika; linki jako `<Button render={<Link href/>} nativeButton={false}>` (wzorzec z `views/pages/auth/login/index.tsx:68`) | `app/[locale]/page.tsx`, `(marketing)/layout.tsx`, `invitations/[token]/page.tsx`, `verify-email/page.tsx`, `forbidden.tsx`, `(app)/dashboard/page.tsx`, `(app)/orgs/[slug]/page.tsx`, `ui/pagination.tsx` (wewnętrzne) |
| `ui/dropdown-menu.tsx` | `Trigger asChild` → `render={...}`; `Item asChild` → `render={<Link/>}` (wzorzec z `ProfileDropdown.tsx`)                           | `theme-toggle.tsx`, `locale-switcher.tsx`, `account-switcher.tsx`, `notification-bell.tsx`                                                                                                                              |
| `ui/input.tsx`         | Prawdopodobny drop-in (Base UI `Input` przyjmuje zwykłe propsy `<input>`); zweryfikować typecheckiem, nie zakładać                  | brak (jeśli typecheck czysty)                                                                                                                                                                                           |
| `ui/sonner.tsx`        | Scalić z naszym (te same: `next-themes` + `sonner` 2.0.7); nasza wersja eksportuje też `toast` — zachować                           | brak                                                                                                                                                                                                                    |

### 1c. Nietykane w tej fazie

`alert, badge, card, dialog, field (nasz FormField/FormMessage zostaje!),
pagination (tylko wewnętrzna migracja Button), select, table, textarea(brak),
command/input-otp/resizable/chart (nie kopiować — poza zakresem fazy)`.
`ui/index.ts` rozszerzyć o eksporty nowych plików
(`SidebarProvider, Sidebar(Inset,Trigger), Breadcrumb*, Avatar*,
Collapsible*, Separator, Sheet*, Skeleton, Tooltip*` + co dropdown wymaga).

### 1d. Czego NIE kopiować (powtórka z fazy 0, obowiązuje)

`Download.tsx`, `ScrollToTop.tsx` (decyzja: pominąć; ewentualnie faza 6),
`BlankLayout.tsx`, `Providers.tsx`, `ThemeProvider.tsx` (mamy z `nonce`),
`LanguageDropdown.tsx` (atrapa), `lib/nav-apps.ts` + `app/api/nav-apps/route.ts`
(promo-fetcher; usunąć `useEffect(getNavApps)` z kopii Sidebar),
przycisk GitHub w Header (`buttons.github.io` vs CSP `script-src`),
`ModeToggle.tsx` (mamy `theme-toggle`), obrazki `public/images/*`
(awatary/flagi — niepotrzebne: awatar = inicjały z sesji).

## Krok 2 — Tokeny (`app/globals.css`, dopisać w HSL, nie kopiować pliku)

Zestaw `--sidebar`, `--sidebar-foreground`, `--sidebar-primary(-foreground)`,
`--sidebar-accent(-foreground)`, `--sidebar-border`, `--sidebar-ring` (+ mapowania
`--color-sidebar-*` w `@theme inline`), wartości neutralne spójne z resztą
tokenów. `--chart-*` NIEruszać (faza 3). `.dark` odpowiedniki jak w template
(przeliczone na HSL, nie kopiowane oklch).

## Krok 3 — `configs/admin-nav.ts` (przepisany `navConfig.tsx`)

- Wziąć typy `MenuItem/NavItem/...` 1:1 (dobry kształt).
- Tylko wpisy lokalne; wszystkie `Pro`/zewnętrzne odrzucić.
- Pozycje fazy 2 (TYLKO istniejące trasy):
  - Main: Dashboard → `/dashboard`
  - Organizations: New organization → `/orgs/new` (gdy `orgsExposed`; cała grupa znika przy `MULTI_TENANCY_MODE=disabled`)
  - Settings: Billing → `/settings/billing`, Notifications → `/settings/notifications`
  - (`/users`, Users, Orders-rozbudowa — fazy 3–4 dopisują grupy; struktura na to gotowa.)
- Etykiety przez next-intl (nowy namespace `nav` w EN/PL), hrefy gołe (prefix locale dokleja i18n `Link`).
- Logika `isLinkActive`/`getActiveBranchKeys` z `Sidebar.tsx` — wziąć w całości (wspiera `?setting=`/`?view=` z faz 4–5).

## Krok 4 — Komponenty shella (`src/components/layout/`)

- **`admin-shell.tsx`** (`"use client"`): `SidebarProvider defaultOpen`
  (statycznie `true` jak w template — cookie `sidebar_state` jest w template
  zapisywane, ale nigdy czytane po stronie serwera, więc brak parsowania
  w RSC) + `TooltipProvider` + `AdminSidebar` + `SidebarInset(AdminHeader,
  <main>, AdminFooter)`. Props z RSC: `user {name,email}`, `orgs`,
  `showSwitcher`, `showNewOrg`, `personalLabel`.
- **`admin-sidebar.tsx`**: kopia `Sidebar.tsx` minus `getNavApps`, `next/link`
  → i18n `Link`, helper `stripLocale(pathname)` przed każdym porównaniem
  (`pathname === href`, `startsWith`, `isLinkActive`) — BEZ TEGO aktywny stan
  menu nigdy nie zadziała pod `[locale]`. Logo → `admin-logo`.
- **`admin-header.tsx`**: kopia `Header.tsx` minus GitHub-button;
  breadcrumb z segmentów BEZ locale (`/en/orgs/new` → Org… wait: segmenty
  `orgs/new` — label per segment, `[slug]` wartości raw); po prawej:
  `AccountSwitcher` (istniejący, po migracji dropdown), `NotificationBell`,
  `ThemeToggle`, `LocaleSwitcher` (istniejący), `AdminProfileMenu`
  (przepisany `ProfileDropdown`: dane z sesji, inicjały w `AvatarFallback`,
  items My Account → `/settings/...` (decyzja: `/settings/billing`? lepiej
  neutralne — do ustalenia przy implementacji, propozycja: profil użytkownika
  w fazie 4; w fazie 2 item prowadzi do `/dashboard`), Settings →
  `/settings/notifications`, BEZ fake sign-out (nasz `SignOutButton` zostaje
  osobno w headerze — zero churn w 2 specach E2E używających
  `getByRole("button", /sign out/i)`).
- **`admin-footer.tsx`**: kopia `Footer.tsx` (link `shadcnstudio.com` ZOSTAJE —
  wymóg MIT) + dopisać nazwę produktu z `site.ts`? Nie — stopka template'u
  - osobna linia boilerplate'u to chaos; decyzja przy implementacji
    (rekomendacja: stopka template'u + "Built on SaaS Boilerplate" bez linków).

## Krok 5 — Przepisanie `(app)/layout.tsx`

`requireSession` + fetch orgów BEZ ZMIAN → `<AdminShell ...>{children}</AdminShell>`
zamiast obecnego `<header>+<main max-w-5xl>`. Szerokość contentu: template
`max-w-360` w `(pages)/layout` — przenieść do `admin-shell` (`<main
className="mx-auto size-full max-w-360 ...">`), żeby podstrony nie musiały
myśleć o kontenerze. `(app)/orgs/layout.tsx` (guard `requireOrgsEnabled`)
i `(admin)/*` nietknięte.

## Krok 6 — E2E: `e2e/admin-shell.spec.ts` (nowy)

Konwencje jak w `query-foundation.spec.ts` (`loginAsFreshUser` → wydzielić do
`helpers.ts`, bo oba specy go potrzebują).

1. Sidebar renderuje nav (link Dashboard), `SidebarTrigger` zwija do rail
   (icon mode) i rozwija; stan aktywny na `/dashboard` i po przejściu do
   `/settings/billing`.
2. Breadcrumb pokazuje sekcję bez segmentu locale.
3. Header: switcher widoczny (mode `required`), theme toggle przełącza
   klasę `dark`, sign out działa (przez istniejący przycisk).
4. Mobile (390×844): sidebar schowany, trigger otwiera Sheet z nav, link
   klika się do strony.
5. Zero naruszeń CSP + zero padniętych requestów do API (kopiować wzorzec
   z query-foundation).
6. Tryb `disabled` (`TENANCY_MODE`, wzorzec z `tenancy-fixtures.ts`): grupa
   Organizations nie istnieje w sidebarze.

## Krok 7 — Weryfikacja i commit

1. `typecheck + lint + format` (spodziewane iteracje po migracji `asChild`).
2. Nowy spec + pełna suita (`query-foundation` musi zostać zielony —
   treść dashboardu nietknięta, tylko chrome).
3. Ręcznie (MCP): collapse/expand, dark bez flasha, PL/EN, mobile Sheet,
   `Cmd/Ctrl+B` shortcut.
4. Commit `feat(web): admincn shell (etap-4 faza 2)`, push.

## Ryzyka (z fazy 0 + nowe)

- **Base UI `render` vs next-intl `Link`**: `render={<Link href/>}` klonuje
  element i scala propsy (ref!). Jeśli `Link` z `@/lib/i18n/navigation`
  nie przekaże refa, padnie w runtime — E2E (locale-switcher, switcher,
  nawigacja) to wykaże; fallback: opakować we własny `AdminNavLink`
  z `forwardRef`. Niczego nie zakładać, przetestować.
- **`asChild` w ~12 plikach**: migracja mechaniczna, ale `nativeButton={false}`
  wymagane tam, gdzie Button renderuje `<a>` (inaczej Base UI wyrenderuje
  `<button>` wokół linku — hydratacja + a11y). Każdy taki przypadek sprawdzić.
- **`field.tsx` i formularze**: NIE ruszać (RHF-przepisanie to faza 4/5).
  Jeśli template'owy `button/input` połamie style formularzy, naprawiać
  klasami, nie podmianą prymitywów.
- **Sidebar cookie**: tylko zapis po stronie klienta; brak parsowania w RSC
  to wierne odwzorowanie template'u, nie bug. (Pro czyta je serwerowo —
  nie dotyczy free.)
- **`font-heading`**: sprawdzić przy kopiowaniu (Krok 1a).
- **Paginacja/select/dialog**: zostają Radix do faz 4–5; dwa systemy
  prymitywów koegzystują przez 2 fazy — jawny dług, spłacany przy
  przepisywaniu formularzy (tam Base UI wygrywa).

## Otwarte punkty (rozstrzygnąć w trakcie, nie przed)

- Cel itemu "My Account" w `AdminProfileMenu` (propozycja w Kroku 4).
- Link do `/admin` w sidebarze dla super-adminów (propozycja: NIE w fazie 2 —
  `(admin)` ma własny shell; admin wchodzi bezpośrednim URL jak dziś).
- Ostateczny kształt stopki (Krok 4).
- Wersja `@tanstack/react-table` wylosowana przez pnpm: **9.2.8** (template
  pinował 8.21.3) — przy fazie 4 sprawdzić breaking changes v8→v9 w API
  tabel (`user-table.tsx`, `datatable-transaction.tsx`).
