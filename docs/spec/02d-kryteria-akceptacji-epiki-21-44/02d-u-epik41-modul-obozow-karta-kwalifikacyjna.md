### EPIK 41 — Moduł obozów: karta kwalifikacyjna uczestnika wypoczynku (v18)

**US-41.1** Jako administrator, chcę oznaczyć ofertę jako wypoczynek wymagający karty kwalifikacyjnej.
- AC1: Given tworzę/edytuję `group_type`, When ustawiam `requires_qualification_card=true`, Then oferta jest wypoczynkiem wymagającym karty (`qualification_card`), a ścieżka obsługi uczestnika dokłada wymóg karty. Kształt sygnalizacji (flaga vs pole `category`) jest otwartym punktem (§8, #17), ale nie blokuje zapisu oferty.
- AC2: Given `requires_qualification_card=false`, When przechodzi przepływ zapisu/obsługi, Then krok karty jest pomijany — pole opcjonalne na poziomie typu grupy, jak `policy_document_id` (§2.18).

**US-41.2** Jako rodzic, chcę wypełnić część karty przed wypoczynkiem.
- AC1: Given zapisuję dziecko na ofertę obozową, When wypełniam część rodzica (dane, informacje zdrowotne, kontakt na czas wypoczynku), Then powstaje `qualification_card` ze `status=parent_completed`, a zgody na wizerunek reużywają `athlete_consent`/`consent_document` (§2.35), nie są duplikowane w karcie.
- AC2: Given zgłaszam to samo dziecko na ten sam obóz po raz drugi, When karta już istnieje, Then nie powstaje duplikat (Constraint 16) — dwie fazy żyją na tym samym wierszu.
- AC3: Given czy wypełnienie karty blokuje finalizację zapisu, When przechodzę formularz, Then zachowanie zależy od decyzji z §8 (#19: blokada twarda jak regulamin vs wymóg przed startem z przypomnieniem).

**US-41.3** Jako administrator, chcę, aby dane zdrowotne karty nie były widoczne dla całego personelu.
- AC1: Given karta ma wypełnione pola zdrowotne, When przegląda je użytkownik bez `athlete_health.view`, Then dane wrażliwe nie są mu prezentowane — **ten sam** mechanizm co dla `athlete.health_notes` (§2.35), nie drugi równoległy (zasięg → §8, #13/#21).
- AC2: Given próba odczytu danych zdrowotnych karty następuje bezpośrednio przez API bez uprawnienia, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI (§4.2).

**US-41.4** Jako kierownik wypoczynku, chcę wypełnić część karty po zakończeniu wypoczynku.
- AC1: Given mam uprawnienie `qualification_card.complete_return`, When wypełniam część kierownika (stan zdrowia w trakcie, zdarzenia, data/podpis), Then `qualification_card.status → leader_completed`, `completed_by_user_id`/`leader_signed_at` są zapisywane, a zmiana logowana w audit trail.
- AC2: Given mam wyłącznie `bookings.mark_attendance` (bez `qualification_card.complete_return`), When próbuję wypełnić część kierownika, Then operacja jest odrzucana — uprawnienia są świadomie osobne.

**US-41.5** Jako organizator, chcę wyeksportować/wydrukować kartę do okazania na miejscu obozu.
- AC1: Given karta jest wypełniona, When ją eksportuję, Then otrzymuję dokument do fizycznego okazania. Format (PDF przez storage §21 vs wydruk przeglądarkowy) zależy od decyzji z §8 (#20).
