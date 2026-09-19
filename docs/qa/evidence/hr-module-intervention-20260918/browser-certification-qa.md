# Authenticated browser certification — QA (hr-module-intervention-20260918)

- Environment: QA (`https://apexos-web-qa-production.up.railway.app`)
- API deployed commit verified by health: `6bdd527d710d` (develop tip)
- Session: authenticated QA user (temporary certification account `diag.probe.*@internal.apexos.local`, role APEX_ADMIN on NYVORA, deactivated at the end of the session)
- Date: 2026-09-18
- Result: passed

Observed in the live browser session:

1. Authentication completed and the application remained online (no logout, no blank screen).
2. Dashboard loaded with navigation to Servicios, Marcar, Mapa and Talento Humano.
3. `Talento Humano / Rutas` loaded the schedule administration screen with filters, summary counters and the schedule list.
4. The `Nuevo horario` creation modal opened with the corrected compact structure: schedule type cards, assignment type, marking control, date/time/tolerance fields, internal notes, live summary, people selector, and the sticky action footer with `Asignar horario`.
5. Design tokens render correctly in dark theme (teal accents, rounded cards, consistent spacing).

This evidence certifies the visual correction of the schedule creation modal and the
navigation smoke on the QA environment. The structured certifications
`qa-nyvora-mass-regression.json` (69/69) and `qa-marking-concurrency.json` (20/50/100)
provide the API, negative authorization, concurrency and model-company coverage used by the aggregate gate.
