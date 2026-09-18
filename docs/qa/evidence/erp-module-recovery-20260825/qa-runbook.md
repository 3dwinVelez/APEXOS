# Runbook de certificación QA

1. Desplegar en QA el commit candidato exacto sin promover a `main`.
2. Auditar el esquema antes de migrar y aplicar únicamente las cinco migraciones declaradas, primero en QA.
3. Configurar `TARGET_ENV=qa`, URLs QA HTTPS, `QA_EXPECTED_COMMIT`, anon key y los perfiles `QA_ERP_ADMIN_*`, `QA_ERP_READONLY_*`, `QA_ERP_OTHER_TENANT_*`.
4. Ejecutar:

```text
node scripts/certifications/erp-module-recovery-qa.js --env-file <qa.env> --output docs/qa/evidence/erp-module-recovery-20260825/qa-certification.json
```

5. En navegador autenticado NYVORA recorrer Compras, Inventario, Tesorería, Ventas y Contabilidad: abrir listado, crear un registro controlado, editarlo, guardar, recargar y comprobar persistencia. Ejecutar negativas con perfil solo lectura y otro tenant.
6. Ejecutar auditoría de esquema y certificado transversal de plataforma.
7. Solo con todo aprobado, completar el manifiesto de aprobación y solicitar la promoción posterior. Nunca promover a `main` sin instrucción expresa independiente.
