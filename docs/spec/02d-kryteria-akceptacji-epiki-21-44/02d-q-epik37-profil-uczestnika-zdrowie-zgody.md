### EPIK 37 — Profil uczestnika: dane zdrowotne, kontakt awaryjny, zgody (v17)

**US-37.1** Jako rodzic, chcę podać dane bezpieczeństwa mojego dziecka.
- AC1: Given wypełniam profil uczestnika, When podaję kontakt awaryjny i uwagi zdrowotne, Then są zapisywane na `athlete`; When pomijam je, Then zapis i tak przechodzi (pola opcjonalne, US-4.1).
- AC2: Given nie podałem danych profilu przy zapisie, When wracam później do panelu klienta, Then mogę je uzupełnić bez ponownego zapisu na zajęcia.

**US-37.2** Jako administrator, chcę zdefiniować wersjonowaną zgodę i wymagać jej akceptacji przy zapisie.
- AC1: Given tworzę `consent_document` z `is_required_at_signup=true`, When klient przechodzi formularz zapisu, Then akceptacja zgody jest krokiem obowiązkowym (twardość vs odnotowanie odmowy — §8).
- AC2: Given klient akceptuje zgodę, When zapis jest finalizowany, Then powstaje `athlete_consent` z **zamrożoną** `consent_document_version` (Zasada nieretroaktywności zgód, §1.3).
- AC3: Given edytuję treść zgody (nowa wersja), When zapisuję zmianę, Then powstaje nowy rekord `consent_document`, a istniejące `athlete_consent` nadal wskazują starą wersję i pozostają niezmienione.
- AC4: Given klient odmawia zgody, When `granted=false` jest zapisywane, Then odmowa jest odnotowana jako świadome zdarzenie, odróżnialne od braku akceptacji.

**US-37.3** Jako administrator, chcę, aby dane wrażliwe uczestnika nie były widoczne dla całego personelu.
- AC1: Given uczestnik ma uzupełnione `health_notes`, When przegląda je użytkownik bez `athlete_health.view`, Then dane wrażliwe nie są mu prezentowane (zasięg uprawnienia → §8).
- AC2: Given próba odczytu danych wrażliwych następuje bezpośrednio przez API bez uprawnienia, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI (§4.2).
