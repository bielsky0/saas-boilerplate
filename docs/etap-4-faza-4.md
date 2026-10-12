# Faza 4 — Users + Settings/Profile (plan implementacji)

Status: plan. Wejście: [etap-4-faza-0.md](etap-4-faza-0.md) (inwentaryzacja
Users/Settings), faza 3 DONE (Query + E2E-harness + headless-shell limity).

Cel: zarządzanie członkami + profil własny w UI AdminCN, na żywych danych.
Bez nowych domen, bez nowych tabel.

## Decyzje zakresu (do veta, nie do dyskusji w środku fazy)

1. **BEZ nowych tras `/users`.** Istnieje w pełni działająca strona
   `/orgs/[slug]/members` (lista + invite + role + remove + revoke, RSC).
   Faza 4 to jej reskin tabelą AdminCN — nie dublowanie routingu. Dylemat
   `/users` vs `/orgs` vs `/admin` z fazy 0 rozstrzygnięty: `/orgs/[slug]/members`
   wygrywa (dane `GET /v1/organizations/:slug/members`, dowolny member ma
   odczyt), `/admin/users` zostaje bez zmian (super-admin, surowy model).
2. **BEZ strony detalu użytkownika.** Widok `users/view` z template'u
   (`STATIC_USER = users[0]`, projekty/faktury/urządzenia/connections) nie ma
   źródeł w Nest — kopiowanie go dałoby atrapę. Self-view pokrywa profil.
3. **Kolumny用户的 okrojone do modelu:** email/nazwa/rola/status/dołączył.
   `plan/billing/company/country/contact` z `AppUser` NIE ISTNIEJĄ w Nest —
   nie wymyślać, nie losować. Enumy ról nasze (`owner/admin/member`), nie
   template'u (`Admin/Editor/…`); statusy członkostwa jak w API.
4. **Nest: tylko `PATCH /v1/profile` (zmiana `name`).** Brak: zmiany e-maila
   i hasła (web nie ma wpiętego Better Auth `changeEmail`/`changePassword` —
   osobny temat, nie ta faza), awatara (brak storage), self-delete (brak
   endpointu; `danger-zone` z template'u odpada w całości).
5. **Settings:** NOWA trasa `/(app)/settings/profile` (formularz nazwy
   w UI sekcji general z template'u: tylko `personal-info`, bez uploadu
   awatara / listy krajów z flagami / `connect-account` / `social-url` —
   wszystko bez źródeł). Istniejące `/settings/billing`,
   `/settings/notifications` i `/orgs/[slug]/settings` BEZ ZMIAN (działają;
   reskin najwyżej gdyby zostało czasu — nie planować).
6. **Nav bez zmian** (członkowie osiągalni jak dziś przez stronę org;
   statyczny sidebar nie zna aktywnego sluga).

## Krok 0 — Nest: `PATCH /v1/profile`

- Route w `AuthController` (tożsamość = domena auth): body `{ name }`,
  zod-schema przy kontrolerze/serwisie (wzorzec `seedBillingCustomerSchema`),
  reguły długości jak silnik (do sprawdzenia: `user.name` w engine — min/max,
  przy implementacji).
- Zapis na `user.name` po `userId` z sesji (`SessionGuard`, jak reszta);
  odpowiedź `{ ok: true, name }` + dopiska w `openapi.yaml`.
- E2E nie potrzebuje nowych seamów (zwykły endpoint z sesją).

## Krok 1 — Web: dane (`src/features/profile/` + haki members)

Nowy slice `features/profile/` (profil nie jest org-scoped):

- `hooks/use-profile.ts` — `useQuery(queryKeys.profile)` → `GET /v1/session`
  (kształt sesji już znany webowi; wyciągnąć `user.name/email`).
- `hooks/use-update-profile.ts` — `useMutation(PATCH /v1/profile)`:
  sukces → `toast` + `invalidateQueries(profile)` (header `AdminProfileMenu`
  i switcher odświeżają się same) ; błąd → zwrot `ApiError` do formularza
  (`issues` → `form.setError`, wzorzec z planu etapu-4).
- `features/organizations/hooks/use-members.ts` (nowy, obok istniejących
  akcji) — `useQuery(['members', slug])` → `GET
/v1/organizations/:slug/members`; `useInviteMember`, `useUpdateMemberRole`,
  `useRemoveMember`, `useRevokeInvitation` jako mutacje na ISTNIEJĄCYCH
  funkcjach (invite/role/remove/revoke już są — przepiąć je z server actions
  na Query + `invalidateQueries(['members'])`). Uwaga: sprawdzić, jak dziś
  wołają API (server actions vs fetch) — mutacje muszą trafiać w te same
  endpointy z tymi samymi permission-guardami.
- Schematy Zod v4 (NIE v3-składnia z template'u!): `name` w `@repo/validation`
  albo obok formularza (jak `features/auth/schema.ts`) + mirror serwerowy
  w Neście. `zodResolver` z `@hookform/resolvers` (wersje z fazy 1).

## Krok 2 — Web: tabela członków (kopie z `/tmp/admincn-free/src/`)

- `views/apps/users/list/` (7 plików: index, user-table, columns, filters,
  toolbar, pagination, `dialogs/add-edit-user-sheet.tsx`) →
  `features/organizations/components/members-table/` — PRZEPISAĆ na kształt
  `{ id, userId, email, name, role, status, createdAt }`:
  - filtry: rola + status + search (jak `use-user-app`, ale źródło z Query;
    stan filtrów w URL przez `nuqs` — shallow-pushe udowodnione jako bezpieczne
    w headless-shell);
  - sortowanie + paginacja CLIENT-SIDE (`useMemo`, jak template) — listy
    członków są małe, a paginacja serwerowa mnożyłaby endpointy i nawigacje
    (patrz ograniczenie headless-shell poniżej);
  - kolumny: Member (inicjały, BEZ `/images/avatars/*`), Role (badge, raw
    enum + tłumaczenie znanych), Status, Joined (`Intl`, nie `date-fns` —
    jedno użycie `format` zamienić, `date-fns` NIE dodawać);
  - akcje w wierszu: istniejące `MemberActions` (role/remove, permission-gated)
    w ostatniej kolumnie zamiast atrap `RowActions` (Edit/Duplicate/Delete);
  - arkusz add/edit → PRZEROBIĆ na invite (email + rola, RHF+zod) ALBO
    zostawić istniejący `InviteMemberForm` i pominąć arkusz — decyzja przy
    implementacji (rekomendacja: arkusz, bo to UI AdminCN; formularz w środku
    i tak woła istniejącą akcję invite).
- `types/apps/user-types.ts` NIE kopiować (model `AppUser` nie istnieje u nas);
  lokalny typ wiersza w slicie.
- `hooks/use-user-app.ts` NIE kopiować (logika `useState(seedUsers)`); nasz
  `useMembers` + `useMemo` filtry na żywych danych.
- Strona `orgs/[slug]/members/page.tsx`: zostaje RSC (guard + metadata),
  treść → nowy Client `<MembersView slug>` (tabela + invite + pending
  invitations z istniejącymi komponentami akcji).

## Krok 3 — Web: profil (`/(app)/settings/profile` + i18n)

- Nowa trasa RSC + Client `<ProfileForm>`: pole name (RHF + `zodResolver`),
  zapis → `useUpdateProfile`, błędy → `setError`, sukces → toast.
  UI sekcji `personal-info` z template'u (układ, NIE logikę uploadu).
- i18n: katalogi `users` (tabela: kolumny, filtry, role, akcje), `profile`
  (formularz, toasty) w EN/PL. Labele ról: istniejący `organizations.roles`
  do ponownego użycia tam, gdzie pasuje.

## Krok 4 — E2E

- `members-table.spec.ts`: seed org + 2 członków (drugi przez invite+accept
  lub `seedOrg members` — sprawdzić seamer), tabela renderuje, search
  i filtr roli w URL, invite wysyła zaproszenie, zmiana roli zapisuje,
  usunięcie członka (z poszanowaniem last-owner — negatywny przypadek!).
- `settings-profile.spec.ts`: zmiana nazwy → widoczna w headerze/profilu
  po invalidacji; błąd walidacji (za krótka) z serwera → `setError`;
  PL smoke.
- CSP jak zwykle. Tryb `disabled`: members/profile… profil osobisty DZIAŁA
  w `disabled` (to nie org!), members nie istnieje (guard 404) — specy muszą
  to respektować (`TENANCY_MODE` pattern).
- Ograniczenie headless-shell (faza 3): max JEDNA client-side nawigacja
  Next-routera na żywot dokumentu; filtry/paginacja BEZ nawigacji (stan
  lokalny + nuqs-shallow albo linki + split testów jak w orders).

## Krok 5 — Weryfikacja i commit

1. `typecheck + lint + format` (obie paczki — Nest też tykany).
2. Nowe specy + pełna suita (orders-dashboard musi zostać zielony).
3. MCP: tabela na realnych członkach, formularz profilu, dark, PL/EN, mobile.
4. Commit `feat(web,api): users table + profile (etap-4 faza 4)`.

## Ryzyka

- **Serwerowe akcje members** — jeśli istniejące invite/role/remove to Server
  Actions z revalidate, przepisanie na mutacje zmienia transport (fetch
  z przeglądarki + CSRF/cookie — ten sam model co Query, udowodniony).
  Zachować kody błędów i permission-guardy 1:1.
- **RHF + zod v4**: schematy template'u (`z.enum(…, {required_error})`,
  `* as z`) NIE kompilują się na v4 — pisać od nowa, nie kopiować.
- **`date-fns`**: nie dodawać dla jednego `format` — `Intl` wystarczy.
- **OpenAPI**: dopisać `PATCH /v1/profile` (jak faza 3).
- **Puste orgi / solo user**: tabela z 1 wierszem (owner) + stany puste
  invitations — jawne asercje w E2E.
