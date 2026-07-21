## 21. Storage / przechowywanie plików

**Referencja przy implementacji:** ta sekcja jest fundamentem dla dokumentów/umów (RODO), avatarów, logo organizacji, obrazów bloga (sekcja 8) i wszelkich przyszłych załączników — inne sekcje powinny odwoływać się do tej warstwy, nie implementować własnego uploadu.

### 21.1 Warstwa abstrakcji nad dostawcą

- Wspólny interfejs S3-compatible (działa z AWS S3, Cloudflare R2, Backblaze B2, MinIO lokalnie — sekcja 25) — ten sam wzorzec adaptera co billing (5.1) i e-mail (10.1)
- Operacje: upload, pobranie URL do odczytu (podpisany, czasowo ograniczony dla plików prywatnych), usunięcie, listowanie plików per właściciel

### 21.2 Upload

- Upload przez presigned URL — klient wysyła plik bezpośrednio do storage, nie przez serwer aplikacji (unika przeciążenia serwera dużymi plikami i limitów rozmiaru requestu)
- Backend generuje podpisany URL uploadu tylko po zweryfikowaniu uprawnień (RBAC, sekcja 4.2) i typu/rozmiaru pliku deklarowanego przez klienta
- Walidacja: dozwolone typy MIME per kontekst (np. tylko obrazy dla avatara, PDF/obrazy dla dokumentów), maksymalny rozmiar pliku, skanowanie w tle pod kątem złośliwej zawartości tam, gdzie ryzyko jest istotne (upload publicznie dostępnych plików)

### 21.3 Model danych

- Każdy plik przypisany do `organization_id`/`account_id` (tenant isolation z sekcji 11.2) oraz opcjonalnie do konkretnego rekordu biznesowego (np. dokument przypisany do klienta)
- Metadane: nazwa oryginalna, typ MIME, rozmiar, kto wgrał, kiedy, widoczność (public/private)
- Pliki publiczne (np. logo organizacji na stronie publicznej) dostępne przez stały URL; pliki prywatne wyłącznie przez podpisany, czasowo ograniczony URL generowany na żądanie

### 21.4 Usuwanie i retencja

- Soft delete zgodny z sekcją 11.3 — plik oznaczony jako usunięty nie jest natychmiast kasowany z bucketa, dopiero po okresie retencji (zadanie cykliczne w tle, sekcja 12)

---
