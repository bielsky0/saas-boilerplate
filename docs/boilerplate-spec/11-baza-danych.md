## 11. Baza danych

### 11.1 Wymagania ogólne

- Schemat bazy zarządzany przez system migracji (wersjonowane, odtwarzalne migracje, nie ręczne zmiany na produkcji)
- Wsparcie dla PostgreSQL jako baza referencyjna, z warstwą ORM umożliwiającą (w miarę możliwości) przełączenie się na inny provider hostingu Postgres (Neon, PlanetScale/MySQL-compatible, Supabase) bez zmian w logice zapytań

### 11.2 Izolacja danych (tenant isolation)

- Patrz sekcja 1.3 — każda tabela z danymi biznesowymi musi mieć kolumnę referencyjną do właściciela (organization_id lub account_id), indeksowaną, z egzekwowaniem filtracji na poziomie warstwy dostępu do danych
- Rekomendowane dodatkowe zabezpieczenie: row-level security na poziomie bazy (jeśli silnik wspiera), jako druga linia obrony niezależna od logiki aplikacji

### 11.3 Soft delete i retencja

- Kluczowe encje (użytkownik, organizacja, dane rozliczeniowe) powinny wspierać miękkie usuwanie (flaga `deletedAt`) zamiast trwałego usunięcia, z jasno zdefiniowanym okresem retencji i procesem trwałego czyszczenia (do zgodności z żądaniami usunięcia danych, np. RODO)

---
