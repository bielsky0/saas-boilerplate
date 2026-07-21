### Faza 17 — Regulaminy i akceptacje (EPIK 28)

**Status:** nierozpoczęta
**Cel:** wersjonowane regulaminy per typ grupy z zamrożoną akceptacją.
**Pokrywa:** EPIK 28; §2.18; spec §5 pkt 15. **Uwaga:** jeśli którakolwiek akademia wymaga regulaminu prawnie przed startem publicznych zapisów, tę fazę należy wciągnąć przed produkcyjne uruchomienie F5.
**Zależności:** F5 (formularz zapisu); istniejący storage (boilerplate §21) — plik PDF przez `file_id`.
**Zakres:** `policy_document` (wersjonowanie: edycja = nowy rekord), `policy_acceptance` (zamrożona wersja, accepted_at, ip), `group_type.policy_document_id` (nullable → krok pomijany), krok akceptacji w formularzu, wymuszenie re-akceptacji przy nowej wersji (US-28.3/AC2 — **wymaga potwierdzenia prawnego przed implementacją**), historia akceptacji w profilu klienta z linkiem do dokładnej wersji pliku.
**DoD:** e2e na AC US-28.1–28.4; suita zielona.

---

