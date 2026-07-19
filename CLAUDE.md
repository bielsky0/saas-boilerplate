@docs/specyfikacja.md
@AGENTS.md

Don't remove agents.md file

# Zasady pracy nad langlion

`docs/plan-implementacji.md` jest **jedynym trwałym źródłem prawdy o planie i postępie** implementacji langlion. Specyfikacja fundamentu boilerplate'owego (cel odwołań „boilerplate §X"): `docs/boilerplate-spec.md`. Konwencje kodu: `docs/ARCHITECTURE.md`.

1. **Pracujemy fazami** zgodnie z `docs/plan-implementacji.md`. Na początku każdej sesji pracy nad fazą najpierw odczytaj ten plik, żeby odzyskać kontekst — nie zakładaj, że pamiętasz poprzednie ustalenia.
2. **Po zamknięciu fazy:** zaktualizuj `docs/plan-implementacji.md` (status fazy → „zakończona", ewentualne korekty planu dalszych faz), zreferuj wykonaną pracę względem definicji ukończenia (DoD) tej fazy i **CZEKAJ na zatwierdzenie** użytkownika przed szczegółowym rozpisaniem i rozpoczęciem kolejnej fazy. Aktualizacja pliku planu jest obowiązkowym krokiem kończącym każdą fazę, nie opcjonalnym.
3. **Nigdy nie łącz dwóch faz** w jedną sesję pracy bez wyraźnej zgody użytkownika.
4. **Błąd w planie** (np. zła kolejność zależności odkryta w trakcie pracy): zatrzymaj się, zaktualizuj `docs/plan-implementacji.md` z uzasadnieniem zmiany i zaproponuj korektę — nie improwizuj po cichu.
5. **Otwarte pytania** wypisane w sekcji „Ryzyka i otwarte pytania" planu zadawaj użytkownikowi na starcie fazy, której dotyczą — nie zgaduj.
