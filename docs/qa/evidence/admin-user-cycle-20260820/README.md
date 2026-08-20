# Evidencia QA — ciclo administrativo de usuarios

- Ambiente: `QA`
- Commit web certificado: `5eed5811972a96ecf0ce79afd6ad2b374de93451`
- Certificado: `scripts/certifications/admin-user-cycle-qa.js`
- Resultado especifico: `passed`, 13/13 controles
- Limpieza usuario funcional: inactivado
- Limpieza actor efimero: membresia `204`, perfil `204`, Auth `200`

## Bloqueo de promocion

`apexos-api-qa` reporto el commit `b66f4348f987`, distinto del commit actual de `develop`. Por politica, la regresion transversal no puede declararse aprobada contra un artefacto diferente. No se genero un manifiesto de aprobacion ficticio y no se promovio a `main`.

Para cerrar la compuerta se requiere:

1. desplegar `5eed5811972a96ecf0ce79afd6ad2b374de93451` en `apexos-api-qa`;
2. ejecutar el certificado transversal versionado y el barrido NYVORA;
3. registrar aprobador funcional independiente, fecha y decision;
4. generar y validar el manifiesto con `npm run qa:approval:evidence -- <manifest>`.
