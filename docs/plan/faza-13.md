### Faza 13 — Portfel klienta UI (§7.12)

**Status:** nierozpoczęta
**Cel:** klient widzi kredyty tylko wtedy, gdy ma z czego korzystać.
**Pokrywa:** US-7.6, **US-35.6 (v16, retrofit widoczności e-dziennika)**; spec §5 pkt 11.
**Zależności:** F12 (wszystkie źródła kredytów istnieją), **F6 (dane e-dziennika: `grade`/`progress_note` istnieją)**.
**Zakres:** sekcja portfela w panelu klienta — widoczna wyłącznie przy niezerowym saldzie `available`; pozycje ze źródłem i `valid_until`; kredyty atomowe (drop-in) nigdy niewidoczne; „Nadchodzące zajęcia" zawsze widoczne.
**Zakres dołożony w v16 (retrofit widoczności e-dziennika, US-35.6):** sekcja „Oceny i postępy" w panelu klienta pokazująca `grade`/`progress_note` dziecka (nazwa pola, wartość, komentarz, data). **Warunek widoczności sekcji do rozstrzygnięcia na starcie fazy** (zawsze gdy istnieje ≥1 wpis vs analogicznie do portfela przy niezerowym saldzie — Otwarte pytania). Sama emisja powiadomienia e-mailem o nowej ocenie żyje już od F6; ta faza dokłada wyłącznie widok — pierwsza faza budująca ogólny panel klienta, dlatego retrofit tutaj (analogicznie do tego, jak F14 retrofituje wcześniejsze zdarzenia).
**DoD:** e2e na US-7.6 AC1–AC4; **klient widzi oceny/notatki dziecka zgodnie z rozstrzygniętym warunkiem widoczności (US-35.6)**; suita zielona.

---

