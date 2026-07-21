# Architektura i konwencje kodu

**To jest spis treści.** Pełna treść dokumentu została podzielona na osobne pliki tematyczne w `docs/architecture/`, ponieważ oryginalny dokument (1331 linii) był zbyt duży do wygodnego wczytywania w całości. Zanim zaczniesz czytać którykolwiek z plików poniżej, zapytaj graf graphify o konkretną sekcję/temat — patrz sekcja „Duże dokumenty — zasady dostępu" w `CLAUDE.md`.

## Spis sekcji

| Sekcja | Plik |
|---|---|
| Stack, Directory layout, Core principles | [docs/architecture/00-overview.md](architecture/00-overview.md) |
| Reference patterns (fill in as modules land) | [docs/architecture/reference-patterns.md](architecture/reference-patterns.md) |
| Rate limiting in production, Common commands, Local setup, Two database URLs (RLS) | [docs/architecture/operations-and-local-setup.md](architecture/operations-and-local-setup.md) |
| Row-Level Security (spec §1.3, US-1.1) — deep dive, incl. deploying migrations, `ON CONFLICT`, adding a table | [docs/architecture/rls.md](architecture/rls.md) |
| Two session mechanisms (staff/parents), Host resolution and tenant header, Canonical URLs at build time | [docs/architecture/sessions-and-routing.md](architecture/sessions-and-routing.md) |
| Background jobs in production, Billing webhooks locally | [docs/architecture/jobs-and-webhooks.md](architecture/jobs-and-webhooks.md) |
