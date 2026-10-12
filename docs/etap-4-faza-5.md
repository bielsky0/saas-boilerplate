# Faza 5 — Auth UI reskin (plan implementacji)

Status: plan. Wejście: [etap-4-faza-0.md](etap-4-faza-0.md) (inwentaryzacja
auth), faza 4 DONE.

Cel: wygląd AdminCN na istniejących trasach i akcjach. Logika (formularze
`features/auth`, Better Auth, wywołania Nest, callbackUrl, tokeny) BEZ ZMIAN
— podmieniamy tylko chrome stron (tło + karta + nagłówek + linki).

## Decyzje zakresu (do veta, nie do dyskusji w środku fazy)

1. Trasy zostają: `/login`, `/signup`, `/forgot-password`,
   `/reset-password`, `/verify-email`. Zero nowych tras, zero tras z template'u.
2. Z template'u bierzemy TYLKO: wrapper (tło + wyśrodkowana karta),
   `AuthBackgroundShape` SVG, układ nagłówka karty (logo + tytuł + opis).
   Formularze w środku to NASZE (`SignInForm` itd.) — atrapy
   (`LoginForm` z `preventDefault`) nie wchodzą.
3. Wyrzucamy bez zastępstwa: "Login as User/Admin" (atrapy), "Magic Link"
   (brak backendu), "Sign in with google" (nasz OAuth to most MCP-agenta,
   spec 26 — NIE social login; przycisk kłamałby), checkbox privacy-policy
   (brak strony regulaminu), two-steps (brak 2FA w Nest — jak w fazie 0).
4. `verify-email`: nasza strona ma prawdziwe stany (`?status=sent`, sukces
   z `Continue`) — wkładamy JE do karty, nie statyczny mock z template'u
   ("hello@example.com", "Skip for now", "Resend" bez backendu).
5. Shared `AuthCard` w `features/auth/components/auth-card.tsx`
   (title/description/children + wariant szerokości sm:max-w-md vs lg);
   logo = istniejące `AdminLogo` (site.name), NIE kopia `Logo.tsx`.

## Krok 0 — Pliki z template'u (kopie, `/tmp/admincn-free/src/`)

- `assets/svg/auth-background-shape.tsx` →
  `features/auth/components/auth-background.tsx` (1:1; czyste path'e,
  `var(--primary)` — zero zewnętrznych referencji, CSP-bezpieczne).
- Reszta (indexy/formularze auth) służy WYŁĄCZNIE jako referencja wizualna —
  nie kopiować plików, pisać od nowa na naszych formularzach.

## Krok 1 — Strony (5× ten sam ruch)

Każda strona: `AuthCard` + istniejący formularz/treść + linki krzyżowe
(i18n `Link`, nasze trasy). Linki: login↔signup, "Forgot password?" (już
w SignInForm — nie dublować), forgot→"Back to login", reset→login,
verify→login/dashboard wg stanu. Tytuły/opisy kart: NOWE klucze
`auth.card.*` (EN/PL) — kopia marketingowa z template'u ("Ship Faster…")
ODPADA, piszemy własną, zgodną z tonem boilerplate'u. Istniejące
hardcoded h1 ("Welcome back"…) znikają razem ze starym layoutem (nie
przenosimy długu).

## Krok 2 — i18n

Namespace `auth.card`: title/description per strona + linki krzyżowe
(o ile nie ma ich już w `auth.*` — `shared.backToLogin`,
`signIn.needAccount` do ponownego użycia). EN + PL w jednym commicie.

## Krok 3 — E2E

- Istniejące specy auth MUSZĄ przejść bez zmian
  (`register-verify-login`, `login-enumeration`, `validation`,
  `invitation-accept`): formularze nietknięte, więc selektory
  (`getByLabel("Email")`…) działają — to jest test regresji reskina.
- Nowy `auth-reskin.spec.ts` (mały): karta renderuje się na 5 stronach
  (logo/site.name, tytuł, tło SVG w DOM), linki krzyżowe nawigują
  (login→signup→login, forgot→login), CSP bez naruszeń. Żadnej logiki
  formularzy (pokryta gdzie indziej).
- Limit headless-shell: max 1 client-nawigacja na test (linki klikać
  w osobnych testach albo przez `goto`, jak w orders).

## Krok 4 — Weryfikacja i commit

1. `typecheck + lint + format`.
2. Auth-specy + pełna suita.
3. MCP: 5 stron wizualnie (light/dark — tło `var(--primary)` w obu),
   PL/EN, mobile (karta `sm:max-w-*`), pełny przepływ signup→verify→login.
4. Commit `feat(web): auth reskin (etap-4 faza 5)`.

## Ryzyka

- ** realize `Card` z fazy 2 (Radix-nie-BaseUI? `card.tsx` NIE był podmieniany
  — nasz, działa) — weryfikuje typecheck.
- **`z-1` i `absolute` tło**: tło `absolute` + karta `z-1` jak w template;
  sprawdzić, że tło nie przechwytuje kliknięć (`pointer-events` — template
  tego nie ustawia; jeśli E2E kliknie w tło zamiast w kartę, dodać
  `pointer-events-none` + `aria-hidden` na wrapper SVG).
- **Oversize SVG (686×671) na mobile**: wrapper ma `overflow-x-hidden` jak
  w template; zweryfikować na 390px w MCP.
- **Pre-existing hardcoded h1**: znikają — żaden spec ich nie asertuje
  (sprawdzić grepem `Welcome back|Create your account` w e2e przed commit).
