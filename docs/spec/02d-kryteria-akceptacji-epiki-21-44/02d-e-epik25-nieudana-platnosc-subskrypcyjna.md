### EPIK 25 — Nieudana płatność subskrypcyjna

**US-25.1** Jako system, chcę odzwierciedlić stan nieudanej płatności subskrypcyjnej bez wpływu na już wygenerowane kredyty.
- AC1: Given aktywna subskrypcja, When otrzymywany jest webhook `invoice.payment_failed`, Then `credit_purchase.subscription_status → past_due`; żadne wcześniej wygenerowane, dostępne kredyty NIE są cofane ani blokowane.
- AC2: Given `subscription_status = past_due`, When kolejny cykl rozliczeniowy nie generuje `invoice.paid`, Then żadne nowe kredyty nie powstają w tym cyklu.
- AC3: Given webhook `customer.subscription.deleted` (ostateczne anulowanie po wyczerpaniu prób Stripe), When system go przetwarza, Then `subscription_status → canceled`; istniejące, niewygasłe kredyty pozostają `available` do naturalnego `valid_until`.

**US-25.2** Jako klient, chcę być poinformowany, gdy moja płatność subskrypcyjna się nie powiedzie, z jasną ścieżką naprawy.
- AC1: Given webhook `invoice.payment_failed` jest przetworzony, When zdarzenie następuje, Then generowane jest powiadomienie zawierające link do Stripe Customer Portal.
- AC2: Given klient aktualizuje metodę płatności przez Customer Portal i płatność się powodzi, When Stripe wysyła kolejny `invoice.paid`, Then `subscription_status → active`, a auto-wypełnienie terminów jest wykonywane normalnie dla tego cyklu.

**US-25.3** Jako administrator, chcę widzieć status płatności subskrypcji klienta bez odpytywania Stripe ręcznie.
- AC1: Given przeglądam profil klienta, When sprawdzam jego aktywne zakupy, Then widzę `subscription_status` każdej subskrypcji zdenormalizowany lokalnie, bez wywołania do Stripe API.
