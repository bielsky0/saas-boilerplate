### EPIK 30 — Stripe Connect i konfiguracja płatności per organizacja (v14)

**US-30.1** Jako Owner akademii, chcę połączyć własne konto Stripe z panelu, aby móc przyjmować płatności online od moich klientów.
- AC1: Given jestem zalogowany jako Owner i `organization.stripe_connect_status = not_connected`, When wchodzę w sekcję „Płatności", Then widzę przycisk „Połącz Stripe" i informację, że bez połączenia płatności online są niedostępne (płatność na miejscu działa już teraz).
- AC2: Given klikam „Połącz Stripe", When system inicjuje przepływ, Then jestem przekierowany do Stripe w celu założenia lub podłączenia istniejącego konta (Standard Connect).
- AC3: Given wracam ze Stripe po autoryzacji, When backend odbiera kod, Then `organization.stripe_connect_account_id` jest zapisywane, a `stripe_connect_status` ustawiane na `onboarding_incomplete` do czasu potwierdzenia przez webhook.
- AC4: Given Stripe wysyła webhook `account.updated` z `charges_enabled=true`, When system go przetwarza, Then `stripe_connect_status → active` i `stripe_connect_connected_at` jest ustawiane.

**US-30.2** Jako administrator akademii, nie chcę móc przypadkiem włączyć płatności online, zanim Stripe nie zostanie w pełni skonfigurowany.
- AC1: Given `organization.stripe_connect_status != active`, When próbuję ustawić `group_type.payment_policy` na zawierające „online", Then opcja jest zablokowana w UI z komunikatem i CTA do §US-30.1.
- AC2: Given powyższe, When próbuję to samo bezpośrednio przez API, Then backend odrzuca zapis niezależnie od UI.
- AC3: Given `stripe_connect_status != active`, When klient akademii próbuje zapłacić online za zajęcia, Then Checkout nie jest generowany — backend jest ostatecznym źródłem prawdy, nie tylko UI.
- AC4: Given `stripe_connect_status != active`, When klient akademii wybiera „Płacę na miejscu", Then rezerwacja przebiega normalnie — brak Stripe Connect nie blokuje płatności gotówkowych.

**US-30.3** Jako Owner, chcę wiedzieć, gdy moje konto Stripe wymaga uwagi, zanim moi klienci zaczną mieć problemy z płatnością.
- AC1: Given Stripe oznacza konto jako `restricted` (webhook `account.updated`), When system go przetwarza, Then `organization.stripe_connect_status → restricted`, generowane jest powiadomienie `stripe_connect_requires_attention` (Notification Center, `recipient_type=staff`), a nowe płatności online są ponownie blokowane jak w US-30.2.
- AC2: Given konto jest `restricted`, When sprawdzam już istniejące, aktywne subskrypcje/rezerwacje na Connected Account, Then nie są one przerywane przez samą zmianę statusu — dotyczy wyłącznie nowych checkoutów inicjowanych przez langlion.
- AC3: Given wchodzę do panelu Ownera w dowolnym momencie, When sprawdzam sekcję „Płatności", Then widzę aktualny status Connect (aktywne/wymaga uwagi/niepołączone) niezależnie od tego, czy przeczytałem powiadomienie.

**US-30.4** Jako system, chcę mieć pewność, że płatności za plan platformy i płatności klientów akademii nigdy się nie mieszają.
- AC1: Given organizacja ma zarówno `platform_stripe_customer_id` (opłata za plan), jak i `stripe_connect_account_id` (płatności klientów), When generowany jest dowolny PaymentIntent/Subscription, Then system jawnie wskazuje, które z dwóch kont Stripe jest celem operacji — checkout za plan zawsze na koncie platformy, checkout za zajęcia/pakiety zawsze na Connected Account organizacji.
- AC2: Given webhook dociera od Stripe, When system go przetwarza, Then rozróżnia, czy dotyczy konta platformy (np. `customer.subscription.updated` dla planu, §EPIK 29) czy Connected Account (np. `account.updated`, `charge.refunded` dla zakupów klientów) i kieruje go do odpowiedniej logiki.

**US-30.5** Jako Owner, chcę mieć wyłączne prawo do podłączania/odłączania konta Stripe mojej akademii.
- AC1: Given jestem Adminem (nie Ownerem), When próbuję wejść w opcję połączenia/odłączenia Stripe, Then nie mam do tego dostępu — wymagane jest uprawnienie `billing_connect.manage`, przypisane wyłącznie do roli Owner.
- AC2: Given próba dostępu następuje bezpośrednio przez API z konta bez uprawnienia, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI.

Powiązane: 02d-i-epik29-limity-planu-feature-gating.md
