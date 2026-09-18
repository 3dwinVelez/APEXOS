# HR Workday Novelties Regression

## Scope

- Human talent landing IA keeps access to routes, schedules, novelties, employees, labor entities, affiliations and labor configuration.
- Workday novelties policy functions validate same-day schedules, day/night split and mileage thresholds.
- API route contract exposes employee master, labor entities, affiliations, novelties, schedules and labor configuration endpoints.
- Supabase and Prisma migrations create the same HR tables for QA database readiness.

## Result

Passed locally with the dedicated certification script and focused API/UI tests.

## Residual Risk

The labor configuration module stores and edits the legal parameters and surcharge concepts. The full payroll/liquidation calculation that consumes every configured concept remains pending as a later implementation phase.
