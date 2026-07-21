### Faza 1 — ⚠️ RLS retrofit tabel tenantowych boilerplate'u

**Podzielona na F1a i F1b w trakcie planowania (2026-07-19).** Uzasadnienie podziału: eksploracja wykazała blast radius 15 sygnatur DAL-i, ~26 call site'ów i 5 wyjątków ESLint, obejmujący jednocześnie warstwę żądań, panel super admina, joby i webhooki. Jeden commit dotykający tego wszystkiego naraz jest trudny do zdiagnozowania przy czerwonej suicie, a webhooki mają inny profil (właściciela trzeba najpierw rozwiązać) niż ścieżki żądań (kontekst org jest już w `OrgContext`). Podział przebiega dokładnie po tej granicy.

---

### Faza 1a — ⚠️ RLS: membership, invitation, file, notification

**Status:** ✅ **zakończona** (2026-07-19)
**Cel:** druga linia obrony (RLS) na tabelach tenantowych boilerplate'u obsługiwanych ze ścieżki żądania + infrastruktura pod drugi kształt właściciela.
**Pokrywa:** US-1.1/AC1 dla tabel boilerplate'u ze ścieżki żądań; boilerplate §11.2.
**Zależności:** F0 ✅

**Zrealizowany zakres:** typ `Owner` + `withOwner` i drugi GUC `app.account_id` (`withTenant` przepisany jako alias); `cross-tenant.ts` jako ogrodzony moduł dla trzech odczytów bez tenanta; DAL-e organizations/storage/notifications przyjmują `tx: TenantDb`; wąski bypass w `storage/purge.ts`; hardening `notificationJobSchema` (XOR); migracja `0016_rls_boilerplate_tenant.sql`; probe rozszerzony o `mode: "owner"`, `rowOwner` i `EXCLUDED_TABLES`; nowy `e2e/boilerplate-rls.spec.ts` (10 testów).

#### Raport z realizacji Fazy 1a — referencja względem DoD

| Kryterium DoD                                     | Wynik                                                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Polityki aktywne (`ENABLE`+`FORCE`) na 4 tabelach | ✅ 8 polityk w `pg_policies`, `relrowsecurity`+`relforcerowsecurity` na wszystkich 4                                       |
| Obie gałęzie właściciela działają                 | ✅ test gałęzi kontowej: konto widzi wyłącznie własne pliki, ani cudzego konta, ani organizacji                            |
| Odmowa zapisu cross-owner                         | ✅ `42501` w tej samej gałęzi ORAZ cross-branch (kontekst org nie spełnia gałęzi kontowej)                                 |
| Kontrola pozytywna                                | ✅ zapis dla własnego właściciela przechodzi — bez tego testy odmowy przechodziłyby przy polityce odmawiającej wszystkiego |
| Asercja carve-outu (negatywna)                    | ✅ `organization`, `personal_account`, `notification_preference`, `audit_log` mają `relrowsecurity=false`                  |
| Fail-closed bez kontekstu                         | ✅ `mode:"raw"` na wszystkich 4 tabelach zwraca `[]`                                                                       |
| Brak wycieku kontekstu przez pulę                 | ✅ odczyt w kontekście → natychmiastowy odczyt raw → `[]`                                                                  |
| **Cała istniejąca suita e2e zielona**             | ✅ **146 passed, 3 skipped, 0 failed** (baseline F0: 136+3; +10 nowych testów)                                             |
| `lint` / `typecheck` / `test` / `format`          | ✅ wszystkie zielone                                                                                                       |
| Migracje od zera na czystej bazie                 | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` → 8 polityk, 4 tabele FORCE                                   |
| Bramka danych 8.0 (przed migracją)                | ✅ patrz niżej                                                                                                             |

**Wynik bramki danych** (rola właściciela, przed migracją, na bazie dev z realnymi danymi):

| tabela         | wierszy | org-owned | account-owned | **bez właściciela** |
| -------------- | ------- | --------- | ------------- | ------------------- |
| `notification` | 118     | 8         | **110**       | **0**               |
| `file`         | 3       | 3         | 0             | **0**               |
| `membership`   | 70      | 70        | —             | **0**               |
| `invitation`   | 5       | 5         | —             | **0**               |

Bramka nie była pusta, więc jej zero ma treść. Dwie obserwacje warte zapamiętania: **110 ze 118 powiadomień to wiersze kont osobistych** — jednogałęziowa polityka z F0 ukryłaby ~93% tej tabeli, więc drugi GUC nie był decyzją teoretyczną; oraz `file` nie ma w dev ani jednego wiersza account-owned, dlatego test gałęzi kontowej seeduje własny wiersz zamiast polegać na zastanych danych.

#### Rozstrzygnięcia podjęte w Fazie 1a

| #   | Decyzja                                                                                  | Uzasadnienie                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D14 | **Drugi GUC `app.account_id` + `withOwner`**; polityka dwugałęziowa na tabelach XOR      | Tabele XOR mają wiersze `organizationId IS NULL`; polityka z F0 ukryłaby je przed ich własnymi właścicielami (110/118 powiadomień w dev)                                                                                                            |
| D15 | `withOwner` **zawsze zapisuje oba GUC-i**, blankując nieaktywny                          | Zagnieżdżenie otwiera SAVEPOINT, nie nową transakcję, a `set_config(…, true)` przeżywa jego zwolnienie — inaczej transakcja spełniałaby oba człony polityki naraz                                                                                   |
| D16 | `requireOrgAccess` przez `withTenant`, **nie** przez bypass                              | Najgorętsza ścieżka aplikacji; `warn` na żądanie zagłuszyłby log, którego celem jest policzalność dziur, i uczyniłby fence dekoracją. GUC pochodzi ze sluga (`organization` poza RLS), więc nie ma cyklu — a nazwanie tenanta nie jest uprawnieniem |
| D17 | `personal_account` i `organization` poza RLS **jako reguła**, nie dwa wyjątki            | Polityki kluczowanej po właścicielu nie da się nałożyć na wiersz definiujący właściciela — zapytanie rozwiązujące jest zapytaniem produkującym wartość GUC                                                                                          |
| D18 | `notification_preference` poza RLS jako **odnotowane odstępstwo** (nie czysty carve-out) | Druga połowa reguły z `schema/index.ts` nie zachodzi (granicą jest sesja). Trzeci GUC odrzucony: rozerwałby `isInAppSuppressed` + zapis na dwie transakcje. Pilnowane **testem negatywnym**                                                         |
| D19 | Wąski bypass: obejmuje wyłącznie zapytanie rozwiązujące właściciela                      | Zapisy (`acceptInvitation`, `storage.purge`) biegną już przez `withOwner`, więc `WITH CHECK` pozostaje load-bearing tam, gdzie pomyłka tenanta niszczy dane                                                                                         |
| D20 | `cross-tenant.ts` jako **osobny plik**, nie wyjątek na `organizations/data.ts`           | Wyjątek na cały `data.ts` dałby bypass funkcjom `getMembership`/`listMembers` — dokładnie tym, które fence ma ograniczać                                                                                                                            |
| D21 | `createOrganizationAction` i `seed-org` **mintują `organizationId` jawnie**              | GUC musi być ustawiony przy otwarciu transakcji, a `.returning()` daje id o jedno stanowienie za późno. Przy okazji znika round-trip                                                                                                                |
| D22 | Seeder `seed-org` używa `withTenant`, nie bypassu                                        | Seeder idący ścieżką, której produkcja nigdy nie używa, przestaje być dowodem, że ścieżka produkcyjna działa                                                                                                                                        |

---

### Faza 1b — ⚠️ RLS: tabele billingowe

**Status:** ✅ **zakończona** (2026-07-19)
**Cel:** domknięcie retrofitu na `billing_customer`, `subscription`, `billing_payment`, `webhook_event`.
**Zależności:** F1a ✅ — odziedziczyła całą infrastrukturę. **Zero nowych GUC-ów, zero nowej infrastruktury.**

**Zrealizowany zakres:** cztery bloki polityk XOR w `0017_rls_billing.sql` (8 polityk, wszystkie 4 tabele `ENABLE`+`FORCE`) przepisane z `0016`; `tx: TenantDb` w siedmiu funkcjach `billing/data.ts`; `findBillingCustomer` wyprowadzone do nowego, ogrodzonego `features/billing/cross-tenant.ts` (jedyny bypass); zapisy webhooka przez `withOwner(ownerOf(customer))`; `BillingOwner` jako alias kanonicznego `Owner`; `notifySchema` hartowany do XOR; dwa konteksty właściciela w `checkout.ts` (wywołanie Stripe pomiędzy); `withOwner` w seederze i `withTenant` (sekwencyjnie) w `billing-state`; probe rozszerzony o cztery tabele i **nową akcję `upsert`**; osiem nowych testów w `boilerplate-rls.spec.ts`.

**Wykonano w dwóch commitach**, celowo: commit A (sam kod, bez migracji) musiał odtworzyć baseline F1a **dokładnie**, przy nieistniejących politykach — to jedyny moment, w którym błąd refaktoru da się odróżnić od wyniku izolacji. Odtworzył (146/3/0).

#### Raport z realizacji Fazy 1b — referencja względem DoD

| Kryterium DoD                                        | Wynik                                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Polityki aktywne na 4 tabelach billingowych          | ✅ 8 polityk w `pg_policies`, `relrowsecurity`+`relforcerowsecurity` na wszystkich 4                                                         |
| Webhook: rozwiązanie właściciela pod wąskim bypassem | ✅ `findBillingCustomer` w `cross-tenant.ts`; log `rls bypass` z powodem raz na event                                                        |
| Webhook: zapisy w kontekście właściciela             | ✅ `withOwner(ownerOf(customer))`; `webhooks.ts` **nie** jest zwolniony z fence'a — zweryfikowane próbą (lint faktycznie pada przy imporcie) |
| **`billing-webhook.spec.ts` (główny kanarek)**       | ✅ **8/8** — sygnatury, trójka idempotencji z równoległą parą, watermark, unknown-customer                                                   |
| Bramka danych 8.0                                    | ✅ trzy kwerendy, rolą właściciela przed migracją — patrz niżej                                                                              |
| Obie gałęzie właściciela                             | ✅ test gałęzi kontowej seeduje własny wiersz (dev nie miał ani jednego account-owned)                                                       |
| Odmowa zapisu cross-owner + kontrola pozytywna       | ✅ `42501` przy cudzym właścicielu, sukces przy własnym                                                                                      |
| Fail-closed bez kontekstu                            | ✅ `mode:"raw"` na wszystkich 4 zwraca `[]`                                                                                                  |
| **Cała suita e2e**                                   | ✅ **154 passed, 3 skipped, 0 failed** (baseline F1a 146+3; +8 nowych)                                                                       |
| Migracje od zera                                     | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` → 8 polityk, 4 tabele FORCE                                                     |
| `lint` / `typecheck` / `test` / `format:check`       | ✅ wszystkie zielone                                                                                                                         |

**Wynik bramki danych** (rola właściciela, przed migracją):

| tabela             | wierszy | org-owned | account-owned | **bez właściciela** |
| ------------------ | ------- | --------- | ------------- | ------------------- |
| `billing_customer` | 30      | 30        | 0             | **0**               |
| `subscription`     | 14      | 14        | 0             | **0**               |
| `billing_payment`  | 8       | 8         | 0             | **0**               |
| `webhook_event`    | 26      | 26        | 0             | **0**               |

Wszystkie cztery `*_owner_ck` obecne i `convalidated=true`, więc te zera są **dowiedzione**, nie tylko zaobserwowane. Trzecia kwerenda (zgodność właściciela `subscription`/`billing_payment` z ich `billing_customer`) — **0 wierszy rozbieżnych**; to ona miała tu treść, bo żaden constraint jej nie pilnuje. Odwrotnie niż w F1a: **zero wierszy account-owned we wszystkich czterech tabelach**, dlatego testy gałęzi kontowej seedują własne dane zamiast ufać zastanym.

#### Rozstrzygnięcia podjęte w Fazie 1b

| #   | Decyzja                                                                                               | Uzasadnienie                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D23 | Bypass w **`billing/cross-tenant.ts`**, nie w `webhooks.ts` — **odstępstwo od linii Zakres tej fazy** | D20 zastosowane dosłownie: zwolnienie `webhooks.ts` postawiłoby furtkę w tym samym pliku co `applySubscriptionEvent`/`applyPaymentEvent`, których `WITH CHECK` jest ostatnią linią obrony na jedynej zewnętrznie sterowanej ścieżce zapisu. `webhooks.ts` trafił na listę NOT-EXEMPT |
| D24 | `getSubscriptionByProviderId` pod `withOwner`, **bez bypassu** — **odstępstwo od linii Zakres**       | `notifySchema` już niósł `organizationId`/`accountId` w obu wariantach. Odczyt staje się owner-scoped — wzmocnienie, nie kompromis. Schemat hartowany do XOR (precedens `notificationJobSchema`)                                                                                     |
| D25 | Bramka 8.0 rozszerzona o **kwerendę zgodności właściciela** i o walidację `*_owner_ck`                | Zmierzone: `ON CONFLICT DO UPDATE` na wiersz niewidoczny pod USING rzuca `42501`. Rozbieżność właściciela = wieczna pętla retry providera. Kolumna „bez właściciela" jest pusta z definicji (XOR CHECK inline), więc sama w sobie nie niosła treści                                  |
| D26 | `setWhere` ewaluowany **przed** sprawdzeniem USING                                                    | Zmierzone. Sygnał „stale" (`applied.length === 0`) jest przez RLS nietknięty — ale rozbieżność właściciela na stale evencie jest połykana po cichu, więc `42501` nie jest detektorem tego stanu; jest nim wyłącznie bramka przedmigracyjna                                           |
| D27 | `checkout.ts`: **dwa** konteksty właściciela, nie jeden obejmujący wywołanie Stripe                   | Jedno opakowanie trzymałoby połączenie z puli przez latencję providera — deadlock dokumentowany w nagłówkach `admin/audit.ts` i `webhooks.ts`. Nie „upraszczać" z powrotem do jednego                                                                                                |
| D28 | `billing-state`: `withTenant` + **sekwencyjnie**, koniec `Promise.all`                                | Trzy równoległe kwerendy na jednym połączeniu transakcji nie są bezpieczne; poprzednia forma działała tylko dlatego, że każda funkcja brała własne połączenie                                                                                                                        |

---

