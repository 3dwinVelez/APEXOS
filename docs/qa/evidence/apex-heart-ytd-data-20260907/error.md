# Controles de seguridad y error

- El script exige el proyecto Supabase QA esperado.
- El tenant debe coincidir por dominio y nombre con `Cliente Piloto QA`.
- Se exige la confirmación `CLIENTE_PILOTO_QA_2026` antes de escribir.
- No contiene operaciones DELETE ni modifica otros tenants.
- Si cualquier dataset queda incompleto, el seed o el certificador termina con error.

