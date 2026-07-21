## 4. Tabela porównawcza: płatność online vs na miejscu

| Cecha | Płatność online | Płatność na miejscu |
|---|---|---|
| Status startowy | `payment_pending` | `booked_offline` |
| Weryfikacja płatności | automatyczna (webhook) | ręczna (recepcja/admin/trener) |
| Gwarancja miejsca | po opłaceniu | od razu, ale wymaga pilnowania listy (brak automatycznego timeoutu) |
| Rola kredytu | generowany i konsumowany atomowo (`online_payment`) | generowany i konsumowany po ręcznym zatwierdzeniu (`on_site_payment`) |
| Co widzi trener | zielony „Opłacone" | żółty „Do zapłaty" |
| No-show | bez konsekwencji (na razie) | bez konsekwencji (na razie) |

Obie ścieżki są symetryczne pod względem roli kredytu — różnią się wyłącznie momentem i sposobem potwierdzenia płatności. Fakturowanie (§2.17) jest procesem ręcznym niezależnym od tej tabeli.

---

