### Faza 18 — Silniki Availability-First i Slot-First + Force Override

**Status:** nierozpoczęta
**Cel:** pozostałe dwa silniki rezerwacji + kontrolowane wymuszanie konfliktu trenera.
**Pokrywa:** §2.1 (AF/SF), §2.32 (wpięcie dostępności), EPIK 14.5, EPIK 34 (US-34.2/34.3/34.4 — konsumpcja slotów w silnikach); spec §5 pkt 16–17.
**Zależności:** F5 (ścieżka rezerwacji), F2 (definicje), **F17.5 (warstwa dostępności + kolumny `group_type.default_*`)**.
**Zakres:** Availability-First (sesje ręczne `is_recurring=false`, konflikt trenera = Hard Block bez wyjątków; **dostępność z F17.5 jako miękkie ostrzeżenie w UI, nie blokada** — US-34.3); Slot-First (sesja tworzona w locie przy rezerwacji, trener nie wymagany na definicji, rozstrzyga wyłącznie constraint §5.1; **podpowiedź slotów z warstwy F17.5** — US-34.2, cel biznesowy; długość/pojemność sesji z `group_type.default_*` — US-34.4); `sessions.force_override` (wyłącznie konflikt trenera w Schedule-First, NIGDY capacity — US-14.5; nie ustawia `is_manually_adjusted` — US-3.4/AC10) + audyt każdego użycia.
**DoD:** e2e: AF hard block + miękkie ostrzeżenie o dostępności; SF constraint-only z podpowiedzią slotów (dwa kliknięcia w ten sam slot → jeden sukces przez §5.1); sesja w locie dziedziczy `default_duration_minutes`/`default_capacity`; force override działa dla konfliktu i nie istnieje dla capacity; suita zielona.

---

