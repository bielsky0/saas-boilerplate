### EPIK 28 — Regulaminy i akceptacje

**US-28.1** Jako administrator, chcę przypisać regulamin do typu grupy przy jego tworzeniu.
- AC1: Given tworzę/edytuję `group_type`, When wskazuję `policy_document_id`, Then wskazany dokument jest wiązany z typem grupy i widoczny klientowi przy zapisie.
- AC2: Given `group_type` nie ma przypisanego regulaminu, When klient przechodzi formularz rejestracji, Then krok akceptacji regulaminu jest pomijany.

**US-28.2** Jako klient, chcę zaakceptować obowiązujący regulamin przy zapisie na zajęcia i mieć pewność, że ta konkretna wersja jest zapamiętana.
- AC1: Given `group_type` ma przypisany `policy_document`, When wypełniam formularz rejestracji, Then muszę zaznaczyć akceptację regulaminu przed finalizacją zapisu.
- AC2: Given akceptuję regulamin, When zapis jest finalizowany, Then tworzony jest `policy_acceptance` z zamrożoną `policy_document_version`.

**US-28.3** Jako administrator, chcę zmienić treść regulaminu bez wpływu na już złożone akceptacje.
- AC1: Given edytuję treść `policy_document` (nowy plik), When zapisuję zmianę, Then powstaje nowy rekord/wersja — istniejące `policy_acceptance` nadal wskazują starą wersję i pozostają niezmienione.
- AC2: Given klient z akceptacją starszej wersji wraca i dopisuje się na kolejny termin tego samego `group_type`, When `policy_document.version` różni się od wersji jego ostatniej akceptacji dla tego `group_type`, Then system wymusza ponowną akceptację przed finalizacją — decyzja wymaga potwierdzenia prawnego przed wdrożeniem.

**US-28.4** Jako administrator, chcę zobaczyć, jaki dokładnie regulamin obowiązywał klienta w danym momencie, na potrzeby sporu/reklamacji.
- AC1: Given przeglądam profil klienta, When sprawdzam historię akceptacji, Then widzę listę `policy_acceptance` z linkiem do dokładnie tej wersji pliku, którą klient zaakceptował.
