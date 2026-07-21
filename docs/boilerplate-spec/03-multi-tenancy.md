## 3. Multi-tenancy / Organizacje

### 3.1 Struktura danych

- Encja `Organization`: nazwa, slug (unikalny identyfikator w URL), logo, data utworzenia, właściciel
- Encja `Membership`: powiązanie użytkownik ↔ organizacja ↔ rola, ze statusem (aktywny/zaproszony/zawieszony)
- Każdy użytkownik ma dokładnie jedno konto osobiste (personal) i może mieć N członkostw w organizacjach

### 3.2 Tworzenie organizacji

- Formularz: nazwa organizacji → automatyczne wygenerowanie sluga (z możliwością edycji, walidacja unikalności)
- Twórca organizacji automatycznie otrzymuje rolę najwyższego uprawnienia (Owner)
- Organizacja musi mieć zawsze co najmniej jednego Ownera — system musi blokować akcję usunięcia/degradacji ostatniego Ownera

### 3.3 Zaproszenia do zespołu

- Owner/Admin wysyła zaproszenie: e-mail zapraszanego + wybrana rola
- System generuje token zaproszenia (jednorazowy, z czasem wygaśnięcia np. 7 dni) i wysyła e-mail z linkiem
- Scenariusze akceptacji zaproszenia:
  - Zaproszony ma już konto w systemie → po zalogowaniu i kliknięciu linku od razu dołącza do organizacji
  - Zaproszony nie ma konta → link prowadzi do rejestracji, po zakończeniu rejestracji automatycznie dołącza do organizacji z przypisaną rolą
- Lista oczekujących zaproszeń widoczna dla adminów, z możliwością cofnięcia (revoke) niewykorzystanego zaproszenia
- Zaproszenie nie powinno ujawniać, czy dany e-mail już ma konto w systemie (ochrona prywatności)

### 3.4 Zarządzanie członkami

- Widok listy członków organizacji z rolami i statusem
- Zmiana roli członka (z wyjątkiem ostatniego Ownera — patrz 3.2)
- Usunięcie członka z organizacji (natychmiastowa utrata dostępu do zasobów organizacji, ale nie usunięcie jego konta użytkownika w systemie)
- Opcjonalnie: możliwość, by użytkownik samodzielnie opuścił organizację (z tym samym ograniczeniem dot. ostatniego Ownera)

### 3.5 Przełącznik kontekstu (account switcher)

- Element UI dostępny globalnie (np. w navbarze), pokazujący konto osobiste + wszystkie organizacje użytkownika
- Przełączenie kontekstu zmienia „aktywny tenant" dla bieżącej sesji — wszystkie kolejne zapytania do danych filtrowane są po nowym kontekście
- URL-e aplikacji powinny odzwierciedlać kontekst organizacji (np. przez slug w ścieżce), żeby dało się bezpośrednio linkować do zasobu konkretnej organizacji i żeby odświeżenie strony zachowywało kontekst

---
