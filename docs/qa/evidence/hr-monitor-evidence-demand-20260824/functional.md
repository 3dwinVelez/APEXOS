# Validacion funcional

- Empresa modelo: NYVORA en una base PostgreSQL QA local y aislada.
- Certificacion API: 9 de 9 controles aprobados.
- Evidencia de actividad y de marcacion anunciada sin incluir el contenido Base64 en la consulta inicial.
- Ambas evidencias recuperadas mediante `GET /api/v1/hr/monitor-evidence/:source/:id`.
- Certificacion de navegador: 2 botones y 0 imagenes antes de la solicitud; 0 botones y 2 imagenes despues de solicitar ambas evidencias.
- La captura `monitor-evidence-loaded.png` prueba el estado final del monitor.
- Los usuarios, horario, credencial y base temporal creados para la prueba fueron saneados al finalizar.
