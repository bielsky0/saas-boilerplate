## 4. RBAC (Role-Based Access Control)

### 4.1 Model ról i uprawnień

- Role predefiniowane minimum: Owner, Admin, Member (z możliwością rozszerzenia o role custom w wersji zaawansowanej)
- Każda rola to zestaw uprawnień (permissions) — uprawnienia to atomowe akcje (np. `billing.manage`, `members.invite`, `members.remove`, `settings.edit`, `content.create`, `content.delete`)
- Definicja uprawnień per rola musi być scentralizowana w jednym miejscu (mapa rola → lista uprawnień), nie rozproszona po komponentach

### 4.2 Egzekwowanie uprawnień

- **Poziom backendu (obowiązkowy):** każda akcja API/serwerowa modyfikująca dane musi sprawdzać, czy użytkownik ma wymagane uprawnienie w kontekście aktywnej organizacji, zanim wykona operację. To jest jedyne źródło prawdy dla bezpieczeństwa.
- **Poziom UI (kosmetyczny):** elementy interfejsu (przyciski, linki) dla akcji, do których użytkownik nie ma uprawnień, powinny być ukryte lub zablokowane — wyłącznie dla UX, nigdy jako jedyne zabezpieczenie
- Próba wykonania nieautoryzowanej akcji przez API (np. przez bezpośrednie wywołanie) musi zwracać błąd 403 z jasnym komunikatem

### 4.3 Role custom (rozszerzenie)

- Możliwość zdefiniowania przez organizację własnych ról z dowolnym zestawem uprawnień z dostępnej puli
- Wymaga UI do zarządzania rolami (tworzenie, edycja, przypisywanie do członków) oraz walidacji, że nie da się usunąć roli, która jest aktualnie przypisana do aktywnych członków (albo wymuszenie przepięcia ich na inną rolę przed usunięciem)

---
