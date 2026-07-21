### EPIK 38 — Granularne uprawnienia personelu (override overlay) (v17)

**US-38.1** Jako administrator, chcę nadać pojedynczemu recepcjoniście uprawnienie spoza jego roli bazowej.
- AC1: Given mam `member_permissions.manage`, When tworzę `membership_permission_override` (`effect=grant`) dla konkretnego membership, Then ten członek personelu wykonuje odtąd akcję, której rola bazowa nie dawała, a pozostali z tą samą rolą — nadal nie.
- AC2: Given tworzę override `effect=revoke` dla uprawnienia, które rola bazowa daje, When ten członek próbuje wykonać akcję, Then dostaje 403 mimo roli bazowej (Constraint 14).
- AC3: Given zapisuję override bez `reason`, When zapisuję, Then system odrzuca zapis — powód jest wymagany (wzorzec `credits.manual_grant`).
- AC4: Given override został nadany, When sprawdzam audit trail, Then widoczne jest kto, komu, jakie uprawnienie, `grant`/`revoke`, z jakim powodem.

**US-38.2** Jako administrator systemu, chcę, aby rozstrzyganie uprawnień pozostało fail-closed i egzekwowane na backendzie.
- AC1: Given uprawnienie nie jest w roli bazowej ani w żadnym `grant`-override, When sprawdzana jest autoryzacja, Then jest odmawiane (fail-closed, Constraint 14) — brak wpisu nigdy nie oznacza „wolno".
- AC2: Given override wskazuje nieistniejący `permission_key`, When rozstrzygany jest efektywny zbiór, Then jest ignorowany.
- AC3: Given użytkownik bez `member_permissions.manage` próbuje nadać override bezpośrednio przez API, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI (§4.2).

**US-38.3** Jako właściciel platformy, chcę mieć pewność, że statyczna mapa ról pozostaje bazą, a override tylko ją modyfikuje.
- AC1: Given membership bez żadnego override, When rozstrzygana jest autoryzacja, Then efektywny zbiór = dokładnie uprawnienia statycznej roli (zachowanie sprzed v17, Rozstrzygnięcie #27) — override jest nakładką, nie zamiennikiem.
