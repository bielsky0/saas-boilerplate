# Specyfikacja techniczna: Next.js SaaS Boilerplate

> **Uwaga (2026-07-21):** ten plik jest teraz wyłącznie spisem treści. Pełna treść żyje w `docs/boilerplate-spec/`, podzielona na jeden plik per rozdział — numeracja rozdziałów jest zachowana 1:1, więc odwołania „boilerplate §X" w `docs/specyfikacja.md`, `docs/specyfikacja-cms.md` i `docs/ARCHITECTURE.md` nadal jednoznacznie wskazują rozdział `X` poniżej (plik `docs/boilerplate-spec/XX-*.md`). Stan faktycznej implementacji względem tej specyfikacji opisuje `docs/plan-implementacji.md` (sekcja „Stan na start"). Oryginalny, niepodzielony plik zachowany jako `docs/boilerplate-spec.md.bak`.

**Wersja:** 1.0
**Cel dokumentu:** Kompletna specyfikacja funkcjonalna i techniczna do przekazania zespołowi deweloperskiemu. Dokument opisuje działanie każdego modułu, model danych na poziomie koncepcyjnym, przepływy (flow), reguły biznesowe i przypadki brzegowe. Nie zawiera kodu — jest podstawą do implementacji i wyceny.

---

## Spis treści

1. [Założenia ogólne i stack](boilerplate-spec/01-zalozenia-ogolne-i-stack.md)
2. [Autentykacja](boilerplate-spec/02-autentykacja.md)
3. [Multi-tenancy / Organizacje](boilerplate-spec/03-multi-tenancy.md)
4. [RBAC (Role-Based Access Control)](boilerplate-spec/04-rbac.md)
5. [Billing i płatności](boilerplate-spec/05-billing-i-platnosci.md)
6. [Panel administracyjny (Super Admin)](boilerplate-spec/06-panel-administracyjny.md)
7. [UI / Frontend](boilerplate-spec/07-ui.md)
8. [Blog / CMS treści](boilerplate-spec/08-blog.md)
9. [SEO](boilerplate-spec/09-seo.md)
10. [System e-maili](boilerplate-spec/10-system-e-maili.md)
11. [Baza danych](boilerplate-spec/11-baza-danych.md)
12. [Background jobs](boilerplate-spec/12-background-jobs.md)
13. [Integracja AI SDK](boilerplate-spec/13-integracja-ai-sdk.md)
14. [Testy](boilerplate-spec/14-testy.md)
15. [Monitoring i observability](boilerplate-spec/15-monitoring-i-observability.md)
16. [Internacjonalizacja (i18n)](boilerplate-spec/16-internacjonalizacja.md)
17. [Reguły AI-assisted development (meta-wymaganie projektowe)](boilerplate-spec/17-reguly-ai-assisted-development.md)
18. [Pluginy dodatkowe](boilerplate-spec/18-pluginy-dodatkowe.md)
19. [Deployment](boilerplate-spec/19-deployment.md)
20. [Priorytetyzacja wdrożenia (rekomendacja)](boilerplate-spec/20-priorytetyzacja-wdrozenia.md)
21. [Storage / przechowywanie plików](boilerplate-spec/21-storage.md)
22. [Bezpieczeństwo warstwy aplikacji](boilerplate-spec/22-bezpieczenstwo-warstwy-aplikacji.md)
23. [System powiadomień (Notification center)](boilerplate-spec/23-system-powiadomien.md)
24. [Onboarding — wieloetapowy flow po pierwszej rejestracji](boilerplate-spec/24-onboarding-wieloetapowy-flow-po-pierwszej-rejestracji.md)
25. [Środowisko developerskie offline](boilerplate-spec/25-srodowisko-developerskie-offline.md)
26. [AI Agent (MCP)](boilerplate-spec/26-ai-agent.md)
27. [Backup i przywracanie danych per organizacja](boilerplate-spec/27-backup-i-przywracanie-danych-per-organizacja.md)
