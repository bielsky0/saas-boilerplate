## 14. Testy

### 14.1 E2E (Playwright)

- Zestaw testów end-to-end pokrywający krytyczne ścieżki: rejestracja, logowanie (wszystkie metody), tworzenie organizacji, zaproszenie członka, proces checkout/subskrypcji (na środowisku testowym dostawcy płatności), podstawowa nawigacja dashboardu
- Testy uruchamiane automatycznie w CI przy każdym pull requeście, blokujące merge w razie niepowodzenia

### 14.2 Jakość kodu

- TypeScript w trybie strict (brak `any` bez uzasadnienia, pełne typowanie danych z API i bazy)
- ESLint + Prettier z regułami wymuszanymi w CI (nie tylko lokalnie w edytorze)

---
