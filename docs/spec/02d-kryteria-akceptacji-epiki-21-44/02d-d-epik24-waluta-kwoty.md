### EPIK 24 — Waluta i kwoty pieniężne

**US-24.1** Jako administrator, chcę zdefiniować walutę mojej akademii raz, aby wszystkie ceny i płatności były w niej spójnie wyrażane.
- AC1: Given tworzę `organization`, When nie podaję `currency`, Then system odrzuca zapis (pole wymagane, brak wartości domyślnej dorozumianej).
- AC2: Given `organization.currency = PLN`, When tworzę `group_type` z ceną, Then Stripe Checkout jest inicjowany w PLN bez dodatkowej konfiguracji.

**US-24.2** Jako klient, chcę mieć pewność, że moja zamrożona cena nie zmieni waluty, nawet jeśli akademia kiedyś zmieni swoją walutę rozliczeniową.
- AC1: Given rezerwuję zajęcia przy `organization.currency = PLN`, When admin później zmienia walutę organizacji na EUR, Then moje istniejące `booking.price_snapshot` zachowuje zapisaną walutę PLN, nie jest przeliczane.
