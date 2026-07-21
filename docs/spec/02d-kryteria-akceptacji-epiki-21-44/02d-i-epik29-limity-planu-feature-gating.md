### EPIK 29 — Limity Planu i Feature Gating (v13)

**US-29.1** Jako Super Admin, chcę definiować plany z limitami liczbowymi bez udziału developerów.
- AC1: Given tworzę `plan_limit_definition` dla planu „Basic" z `limit_key=max_students`, `limit_value=25`, When zapisuję, Then limit obowiązuje natychmiast dla wszystkich organizacji na planie Basic, bez wdrożenia kodu.
- AC2: Given zmieniam `limit_value` z 25 na 30, When zapisuję, Then organizacje wcześniej blokowane przy 26–30 uczniach mogą natychmiast dodawać kolejnych.
- AC3: Given zostawiam `limit_value` puste (NULL), When system to interpretuje, Then oznacza to brak limitu — jawnie, nie przez brak rekordu.

**US-29.2** Jako administrator akademii, chcę być zablokowany przy próbie przekroczenia limitu planu, z jasną informacją co dalej.
- AC1: Given organizacja ma plan z `max_students=25` i już 25 uczniów, When admin próbuje dodać 26., Then operacja jest odrzucana z komunikatem wskazującym limit, zużycie i CTA „Przejdź na wyższy plan".
- AC2: Given powyższe, When sprawdzenie jest wykonywane, Then jest wykonywane na backendzie niezależnie od UI.
- AC3: Given brak zdefiniowanego `limit_key` dla planu organizacji, When admin próbuje dodać zasób tego typu, Then operacja jest blokowana (fail-closed).

**US-29.3** Jako Owner organizacji, chcę wiedzieć, że zbliżam się do limitu, zanim zostanę zablokowany.
- AC1: Given zużycie limitu osiąga próg 90% (konfigurowalny), When próg jest przekraczany, Then generowane jest powiadomienie `plan_limit_approaching` (Notification Center, §2.16, `recipient_type=staff`).
- AC2: Given limit zostaje osiągnięty (100%) i kolejna próba jest blokowana, When to następuje, Then generowane jest osobne powiadomienie `plan_limit_reached`, jednorazowo per przekroczenie — nie przy każdej kolejnej odrzuconej próbie.

**US-29.4** Jako Super Admin, chcę wynegocjować niestandardowe limity dla pojedynczej organizacji bez tworzenia dla niej osobnego planu.
- AC1: Given organizacja X jest na planie „Pro" (`max_students=100`), When tworzę `organization_limit_override` (X, `max_students`, 150), Then efektywny limit dla X wynosi 150, a pozostałe organizacje na Pro nadal mają 100.
- AC2: Given override istnieje, When plan organizacji jest później zmieniany, Then override pozostaje w mocy niezależnie od nowego planu, dopóki Super Admin go jawnie nie usunie.

**US-29.5** Jako klient, chcę widzieć, które funkcje są dostępne w moim planie, a które wymagają upgrade'u.
- AC1: Given `plan_feature_flag.subscriptions_enabled=false` dla planu organizacji, When admin próbuje utworzyć `product_template` z `billing_type=recurring`, Then operacja jest blokowana z komunikatem o wymaganym planie — niezależnie od tego, czy `allowed_billing_types` na `group_type` dopuszcza `recurring` (§EPIK 23).
- AC2: Given funkcja niedostępna w planie, When admin przegląda odpowiednią sekcję UI, Then widzi ją oznaczoną „wymaga planu X" z linkiem do upgrade'u, zamiast całkowitego ukrycia.

**US-29.6** Jako administrator platformy, chcę mieć pewność, że downgrade nie niszczy danych klienta.
- AC1: Given organizacja ma 35 aktywnych uczniów, When przechodzi na plan z `max_students=25`, Then żaden z 35 rekordów `athlete` nie jest usuwany ani dezaktywowany automatycznie.
- AC2: Given stan 35/25, When admin próbuje dodać 36. ucznia, Then operacja jest blokowana jak przy zwykłym osiągnięciu limitu.
- AC3: Given downgrade się powiódł i organizacja przekracza nowy limit, When operacja się kończy, Then Owner/Admin otrzymuje powiadomienie z listą przekroczonych limitów.

**US-29.7** Jako Super Admin, chcę mieć pewność, że każda zmiana konfiguracji planu jest audytowalna.
- AC1: Given zmieniam `limit_value` lub `is_enabled` na dowolnym `plan_limit_definition`/`plan_feature_flag`, When zapisuję, Then wpis trafia do audit trail (boilerplate §6.4) z wykonawcą `SuperAdmin`, starą i nową wartością.

Powiązane: 02d-c-epik23-tryby-zakupu-rozliczenia.md
