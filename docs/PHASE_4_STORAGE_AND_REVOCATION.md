# Fase 4: Storage autoritativo y revocación efectiva

## Resultado implementado

- La evidencia de Servicios puede usar preautorización de cinco minutos, ruta
  aleatoria de cuarentena, carga firmada de un solo uso, validación binaria en el
  servidor y promoción a la ruta final.
- La cuarentena no es legible, actualizable ni eliminable por usuarios
  autenticados. La API elimina objetos rechazados y existe una tarea acotada para
  limpiar autorizaciones expiradas.
- El flujo anterior permanece disponible solamente mientras
  `AUTHORIZED_EVIDENCE_UPLOADS_ENABLED` y
  `NEXT_PUBLIC_AUTHORIZED_EVIDENCE_UPLOADS_ENABLED` estén desactivados.
- Los JWT propios incluyen sesión y versiones de usuario/empresa. En cada
  solicitud se consulta el estado autoritativo y se reemplaza el rol embebido por
  el vigente.
- Existen revocación selectiva de sesión, revocación global ante cambios de
  usuario/rol/contraseña y modos separados de observación y aplicación.
- QA requiere una identidad explícita de ambiente y proyecto antes de cualquier
  inspección de RLS.

## Activación segura

1. Aplicar primero las migraciones Prisma y Supabase en QA.
2. Inyectar secretos desde el gestor del entorno; no convertir
   `config/qa.env.example` en un archivo versionado con valores reales.
3. Activar `AUTHORIZATION_VERSION_OBSERVATION_ENABLED=true` y revisar solamente
   eventos `authorization_version_mismatch`.
4. Activar `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED=true`.
5. Activar ambos flags de carga autorizada para una empresa piloto.
6. Programar `cleanup-evidence-upload-quarantine.js` con un lote acotado.
7. Repetir aislamiento RLS, carga inválida/válida, revocación y latencia antes de
   ampliar el despliegue.

## Límites de esta fase

No se aplicaron migraciones remotas, no se habilitaron flags, no se desplegó y no
se modificaron CSP final, MFA, almacenamiento local, rate limiting distribuido ni
dependencias incompatibles. La medición end-to-end de base de datos debe
realizarse en QA después de aplicar las migraciones; las pruebas locales cubren
la decisión de revocación y los validadores binarios sin simular resultados
remotos.
