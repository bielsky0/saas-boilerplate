### EPIK 40 — Zapis wielu uczestników w jednym przejściu (rozszerzenie EPIK 4, v17)

**US-40.1** Jako rodzic dwójki dzieci, chcę zapisać oboje na tę samą ofertę w jednym przejściu.
- AC1: Given wypełniam formularz zapisu, When dodaję N uczestników, Then przechodzę **jeden** OTP i jedną weryfikację `client` dla wszystkich dzieci.
- AC2: Given wszystkie dzieci mają wolne miejsce, When finalizuję zapis, Then powstaje osobna `booking` per dziecko na tej samej ofercie.

**US-40.2** Jako rodzic, chcę jasny wynik, gdy nie dla wszystkich dzieci starczyło miejsca.
- AC1: Given sesja ma 1 wolne miejsce, a zapisuję 2 dzieci, When finalizuję zapis, Then jedno dziecko dostaje `booking`, drugie nie — z jasnym komunikatem, którego dziecka nie udało się zapisać (częściowy sukces, Constraint 15, wzorzec §7.5a/US-9.1/AC3–4).
- AC2: Given próby są wykonywane sekwencyjnie, When jedno dziecko napotyka kolizję zawodnika (§5.3) lub pełną pojemność (§5.2), When system to wykrywa, Then niepowodzenie tego dziecka **nie wycofuje** sukcesu rodzeństwa (każde dziecko = osobna transakcja zajęcia miejsca).
- AC3: Given zapisuję N dzieci, When którekolwiek przechodzi przez zajęcie miejsca, Then przechodzi **pełną** ochronę §5 niezależnie — posiadanie miejsca przez jedno dziecko nie omija sprawdzenia dla drugiego.
