# Scripts de soporte

- `npm run certify:service-order-edit:qa`: certifica el recorrido real de edicion y persistencia.
- `npm run certify:platform-regression:qa`: certifica funciones existentes de seis dominios y seguridad de acceso.
- `npm run qa:approval:evidence -- <manifest>`: bloquea la promocion si faltan evidencias, aprobacion o certificacion transversal.
- Los scripts exigen `QA_EXPECTED_COMMIT` para impedir pruebas sobre una version distinta a la candidata.
