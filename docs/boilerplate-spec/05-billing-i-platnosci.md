## 5. Billing i płatności

### 5.1 Warstwa abstrakcji nad dostawcami

- Wspólny interfejs dla operacji: utworzenie klienta płatności, utworzenie subskrypcji, aktualizacja subskrypcji, anulowanie, pobranie faktur, obsługa webhooków
- Dostawca referencyjny: Stripe. Struktura musi pozwalać dodać kolejnego dostawcę (Lemon Squeezy, Paddle, PayPal, Dodo, Polar) przez implementację tego samego interfejsu, bez zmian w logice aplikacji korzystającej z billingu

### 5.2 Plany i ceny

- Definicja planów (nazwa, cena, okres rozliczeniowy, limity/quota, lista uprawnień/features odblokowywanych) trzymana w konfiguracji aplikacji, nie hardkodowana w UI — zmiana ceny w konfiguracji ma automatycznie odzwierciedlić się w tabeli cenowej
- Wsparcie modeli: subskrypcja flat-rate (stała cena), per-seat (cena × liczba miejsc/użytkowników), usage-based/metered (cena zależna od zużycia zgłaszanego do dostawcy płatności), jednorazowa płatność (one-time purchase)
- Powiązanie planu z organizacją LUB z kontem osobistym — zależnie od modelu produktu (B2B vs B2C), architektura musi wspierać oba

### 5.3 Checkout

- Inicjacja płatności przekierowuje użytkownika do hostowanej strony checkout dostawcy (np. Stripe Checkout) — nie budujemy własnego formularza kart (redukcja zakresu PCI-DSS)
- Po sukcesie: redirect na stronę potwierdzenia w aplikacji + webhook od dostawcy jako właściwe źródło prawdy o aktywacji subskrypcji (redirect użytkownika NIE może być jedynym mechanizmem aktywacji dostępu — użytkownik może zamknąć kartę przed redirectem)

### 5.4 Webhooki

- Endpoint webhook musi weryfikować podpis żądania (signature verification) dla każdego eventu, odrzucać niepodpisane/niepoprawne żądania
- Obsługiwane eventy minimum: utworzenie subskrypcji, aktualizacja subskrypcji (zmiana planu), anulowanie subskrypcji, nieudana płatność, odnowienie subskrypcji, zwrot płatności
- Przetwarzanie webhooków musi być idempotentne — ten sam event dostarczony wielokrotnie (dostawcy nie gwarantują dostawy dokładnie raz) nie może powodować duplikatów w bazie ani podwójnego naliczenia
- Stan subskrypcji w bazie aplikacji jest zawsze wynikiem przetworzenia webhooka, nigdy zgadywany po stronie klienta

### 5.5 Customer Portal

- Link do hostowanego przez dostawcę portalu, gdzie użytkownik samodzielnie: zmienia metodę płatności, pobiera faktury, zmienia/anuluje plan
- Aplikacja musi zsynchronizować stan po zmianach dokonanych w portalu — ponownie przez webhooki, nie przez odpytywanie API przy każdym wejściu

### 5.6 Quota i limity planu

- Każdy plan definiuje limity (np. liczba projektów, liczba wywołań API, liczba miejsc w zespole)
- Mechanizm sprawdzania limitu musi być wywoływany przed wykonaniem akcji podlegającej limitowi (nie po fakcie) — blokada z czytelnym komunikatem i CTA do upgrade'u planu, gdy limit przekroczony
- Licznik zużycia musi być inkrementowany atomowo (ochrona przed race condition przy równoczesnych żądaniach zbliżających się do limitu)

### 5.7 Plan-based rendering

- Warstwa (hook/serwis) zwracająca informację o aktualnym planie i jego uprawnieniach, wykorzystywana zarówno do warunkowego renderowania UI (np. ukrycie/zablokowanie funkcji premium), jak i do egzekwowania po stronie backendu (to drugie jest obowiązkowe, pierwsze kosmetyczne — analogicznie do RBAC w sekcji 4.2)

---
