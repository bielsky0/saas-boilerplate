### 1.1 Diagram relacji (opis tekstowy)

```
organization (1) ──< location (N)
                │
                ├──< plan (przez organization.plan_id, N:1) ──< plan_limit_definition (N)
                │                                            └─< plan_feature_flag (N)
                ├──< organization_limit_override (N) (v13)
                ├── stripe_connect_account_id / stripe_connect_status (v14, Connected Account — płatności klientów akademii)
                │   (odrębne od platform_stripe_customer_id — Platform Billing za plan, §EPIK 29, patrz Zasada nadrzędna #7)
                │
organization (1) ──< group_type (N) ──< group_type_recurrence (N) ──< session (N) ──< booking (N) >── athlete (1)
                │                              │        │                    │             │            │
                │                              │        └── location_id ──> location       │            │
                │                              │        (nadpisuje group_type.default_location_id)      │
                │                              └── target_recurrence_id ── credit_purchase   │     parent_client_id
                │                              └── default_location_id ──> location          │
                │                              └── allowed_purchase_modes / allowed_billing_types
                │                              └── policy_document_id ──> policy_document     │
                │                              └── description (v15, markdown na stronie oferty)
                │                              └── default_duration_minutes / default_capacity (v16, tylko silniki bez wzorca — §2.32)
                │                              └── status (v17, scheduled|collecting_interest — zapisy przed harmonogramem, §2.34, EPIK 36)
                │                                                                             │
                │                          attendance_status / attendance_marked_at / _by_user_id (v15)
                │                          (oś niezależna od payment_status — patrz §2.29)
                │
                ├──< client (N, is_verified, +v19: password_hash/password_set_at/password_updated_at — §2.43) ──< athlete (N, +v17: emergency_contact_* / health_notes — §2.35)
                │         │
                │         ├──< credit (N) >── credit_type (1) ── group_type (1:1)
                │         │         │
                │         │         └── source_booking_id / used_in_booking_id / credit_purchase_id
                │         │
                │         ├──< policy_acceptance (N) ── group_type_id / policy_document_id
                │         │
                │         ├──< client_price_override (N, v15) ── group_type_id (nullable)
                │         │         (rabat per klient; §2.31, EPIK 33)
                │         │
                │         └──< notification (N, recipient_type=client)
                │
                ├──< trainer_rate (N, v15) ── trainer_id / group_type_id (nullable)
                │         (stawka informacyjna; §2.30, EPIK 32; +v17: rate_type flat_per_session|hourly, §2.37)
                │
                ├──< interest_signup (N, v17) ── group_type_id / client_id / athlete_id (bez session_id)
                │         (zapis-zainteresowanie przed harmonogramem; §2.34, EPIK 36, Constraint 13)
                ├──< consent_document (N, v17) ──< athlete_consent (N) >── athlete (1)
                │         (wersjonowane zgody, wzorzec policy_document/policy_acceptance; §2.35, EPIK 37)
                ├──< membership_permission_override (N, v17) ── membership_id / permission_key / effect grant|revoke
                │         (override overlay na statyczną rolę; §2.36, EPIK 38, Constraint 14)
                │
                ├──< trainer_availability (N, v16) ── trainer_id / location_id (nullable) / day_of_week
                │         (warstwa podpowiedzi slotów AF/SF; §2.32, EPIK 34, Constraint 11 — nigdy źródło prawdy o zajętości)
                │
                ├──< grade_field (N, v16) ── group_type_id XOR session_id (Constraint 12)
                │         └──< grade (N, v16) >── athlete (1)  (wartość + komentarz per uczestnik; §2.33, EPIK 35)
                ├──< progress_note (N, v16) ── athlete_id / session_id (nullable)  (notatka o postępach; §2.33, EPIK 35)
                │
                ├──< qualification_card (N, v18) ── athlete_id / group_type_id (dwufazowa; §2.40, EPIK 41, Constraint 16)
                │         (karta kwalifikacyjna wypoczynku; group_type.requires_qualification_card=true)
                ├──< extra_fee (N, v18) ── client_id / athlete_id (nullable) / booking|group_type|session (opcjonalne)
                │         (opłata ad-hoc POZA systemem kredytowym; §2.41, EPIK 42, Rozstrzygnięcie #35)
                ├──< lesson_topic (N, v18) ── session_id  (temat całej sesji; §2.42, EPIK 43)
                ├──< homework (N, v18) ── session_id (nullable) ──< homework_completion (N) >── athlete (1)
                │         (praca domowa + wykonanie per uczestnik, osobna oś; §2.42, EPIK 43, Constraint 18)
                │
                ├──< credit_type (N) ── group_type_id (1:1)
                ├──< product_template (N) ── credit_type_id
                │          │  (billing_type musi mieścić się w group_type.allowed_billing_types
                │          │   ORAZ w plan_feature_flag organizacji — patrz §2.21, v13)
                │          └──< credit_purchase (N) ── target_recurrence_id (nullable) ── payment_method: online|cash
                │                     └── subscription_status / invoice_requested_at / invoice_issued_at
                │
                ├──< policy_document (N)
                ├──< notification_event_type (N, katalog/słownik)
                └──< notification (N) >── notification_preference (N)
```

`session.location_id` kopiowana przy generowaniu z `group_type_recurrence.location_id` (lub `group_type.default_location_id`, jeśli wzorzec nie nadpisuje); edytowalna per-sesja, chroniona flagą `is_manually_adjusted` na równi z `start_time`/`end_time`.

`organization.plan_id` (v13) rozstrzyga efektywne limity/featury organizacji łącznie z ewentualnym `organization_limit_override` — patrz §1.3 i §2.20.

`organization.stripe_connect_account_id`/`stripe_connect_status` (v14) rozstrzygają, czy akademia może przyjmować płatności online od swoich klientów — patrz §1.3, §2.24–§2.26. To pole jest niezależne od billingu platformy (opłaty organizacji za plan, §EPIK 29) — patrz Zasada nadrzędna #7.

`booking.attendance_status` (v15) jest osią całkowicie niezależną od `booking.payment_status` — patrz §2.29. `trainer_rate` (v15) i `client_price_override` (v15) są encjami organizacji, rozstrzyganymi regułami pierwszeństwa z §1.3 (Constraint 8 i 9); żadna z nich nie wpływa na silnik rezerwacji ani na ochronę współbieżności z §5.

`trainer_availability` (v16) jest wyłącznie warstwą podpowiedzi slotów dla silników Availability-First i Slot-First (§2.32, Constraint 11) — nigdy źródłem prawdy o zajętości trenera; tą pozostaje wyłącznie constraint §5.1. `grade_field`/`grade`/`progress_note` (v16, e-dziennik) są osią całkowicie niezależną od `booking.payment_status` i `booking.attendance_status` (§2.33, Constraint 12); żadna z tych encji nie wpływa na silnik rezerwacji ani na ochronę współbieżności z §5.

Powiązane: 01f-relacje-integralnosc.md
