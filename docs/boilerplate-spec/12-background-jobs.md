## 12. Background jobs

### 12.1 Zastosowania

- Zadania asynchroniczne niewymagające natychmiastowej odpowiedzi w request-response cyklu: wysyłka e-maili, sekwencje onboardingowe, przetwarzanie webhooków płatności, generowanie raportów, zadania AI (patrz 13), czyszczenie danych po okresie retencji

### 12.2 Wymagania

- Zadania muszą być idempotentne tam, gdzie to możliwe (ponowne wykonanie tego samego zadania nie powoduje efektów ubocznych typu podwójna wysyłka)
- Mechanizm retry z backoffem dla zadań, które mogą się nie powieść z przyczyn przejściowych (np. chwilowa niedostępność dostawcy e-mail)
- Zadania cykliczne (cron-like) dla operacji okresowych (np. codzienne czyszczenie wygasłych tokenów, cotygodniowe raporty)
- Widoczność/observability: możliwość podejrzenia statusu i historii wykonania zadań (przynajmniej w logach, docelowo w dedykowanym UI/panelu dostawcy)

---
