### Faza 14 — ⚠️ Notification Center domenowy (EPIK 26; odejście #1)

**Status:** nierozpoczęta
**Cel:** dedykowana encja powiadomień langlion (odbiorcy: klienci + personel) z katalogiem zdarzeń edytowalnym bez deploya; retrofit wszystkich wcześniejszych zdarzeń e-mail-only.
**Pokrywa:** EPIK 26; §2.16; spec §5 pkt 12.
**Zależności:** F3 (klienci), F5–F12 (zdarzenia istnieją).
**Zakres:** tabele `notification_event_type` (słownik: default_channels, `is_overridable` — false dla finansowych/bezpieczeństwa), `notification` (recipient_type `client`|`staff`, polimorficzny odbiorca, content po podstawieniu zmiennych, channel_sent), `notification_preference`; jeden punkt emisji (serwis + job, wzorzec `enqueueNotification` boilerplate'u); preferencje klienta w jego panelu (odrzucenie wyłączenia dla `is_overridable=false` — US-26.1/AC2); dzwonek + licznik w panelu klienta (polling, jak boilerplate); seed katalogu z tabeli §2.16 (w tym `plan_limit_*` z F9, `stripe_connect_requires_attention` z F10 oraz **`grade_recorded`/`progress_note_added` z F6, `is_overridable=tak`** — v16); **retrofit**: wszystkie zdarzenia wysyłane dotąd e-mailem przechodzą przez katalog (e-mail + in-app wg preferencji), w tym powiadomienia o ocenach/notatkach z F6.
**DoD:** e2e: preferencje respektowane, niewyłączalne odrzucane, jedno zdarzenie wielu odbiorców = osobne rekordy; retrofit potwierdzony na min. 3 wcześniejszych zdarzeniach (odwołanie sesji, zmiana wzorca, częściowy auto-fill); suita zielona.

---

