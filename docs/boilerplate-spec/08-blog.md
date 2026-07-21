## 8. Blog / CMS treści

### 8.1 Model treści

- Treści (posty blogowe, strony dokumentacji) przechowywane jako pliki (np. MDX/Markdoc) w repozytorium LUB w bazie danych — decyzja architektoniczna do podjęcia na starcie, wpływa na to czy nietechniczni użytkownicy mogą edytować treść bez deploya
- Metadane posta: tytuł, slug, data publikacji, autor, opis (dla meta tagów), obraz okładkowy, tagi/kategorie, status (draft/published)

### 8.2 Generowanie stron

- Każdy opublikowany post generuje statyczną stronę pod przewidywalnym URL (np. `/blog/[slug]`)
- Automatyczne generowanie: sitemapy XML (aktualizowanej przy każdej publikacji), meta tagów (title, description, Open Graph, Twitter Card) na podstawie metadanych posta, structured data (JSON-LD) dla lepszej indeksacji

### 8.3 Dokumentacja/Help Center

- Analogiczna struktura do blogu, ale z nawigacją hierarchiczną (kategorie → podstrony) i wyszukiwarką po treści dokumentacji

### 8.4 Changelog

- Lista wpisów z datą i opisem zmian, generowana z tego samego mechanizmu treści co blog, dedykowany layout (grupowanie po wersjach/datach)

---
