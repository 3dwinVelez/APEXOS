# Politica obligatoria de aprobacion de cambios

Todo cambio sigue exclusivamente `desarrollo -> develop -> main`. La aprobacion de pruebas automatizadas permite integrar en `develop`, pero nunca basta para promover a `main`.

## Evidencia obligatoria

Antes de aprobar `develop -> main` debe existir un manifiesto JSON versionado con:

1. Prueba funcional en QA autenticado que reproduzca el flujo real antes y despues del cambio.
2. Pruebas de error y escenarios negativos, incluyendo indisponibilidad, datos vacios y respuestas tardias.
3. Resultado de los scripts de soporte, pruebas automatizadas, lint, tipos y compilacion.
4. Prueba de regresion sobre los flujos adyacentes afectados.
5. Evidencias fechadas: capturas, resultados estructurados o logs sanitizados, sin secretos ni datos sensibles.
6. Aprobacion explicita con responsable, fecha, commit evaluado y decision `approved`.
7. Un script versionado de certificacion extremo a extremo que ejecute la peticion completa en el ambiente objetivo, verifique el estado final y falle con codigo distinto de cero ante cualquier resultado parcial.
8. Evidencia generada por ese script con el commit desplegado, sin contrasenas, tokens ni secretos.
9. Certificacion funcional con datos controlados de la empresa modelo `NYVORA`, incluyendo un rol autorizado, un rol sin el permiso especial y un usuario de otro tenant.
10. Plan de reversa preparado contra el ultimo commit estable de `main`, con disparador objetivo y estrategia `controlled_revert`.

## Certificacion navegador / plataforma en vivo (obligatoria para todo cambio funcional)

La certificacion extremo a extremo no se limita a scripts HTTP. Todo cambio funcional, especialmente correcciones de flujos operativos (servicios, tenancy, estados), debe validarse ejecutando el flujo real desde el navegador sobre la plataforma en el ambiente objetivo (QA) con el commit exacto evaluado:

1. Reproducir la novedad reportada desde la interfaz real antes de declarar el caso resuelto.
2. Ejecutar el flujo completo de la funcionalidad afectada tal como la usaria el usuario: abrir, editar, guardar, reabrir y recargar.
3. Comprobar persistencia de los datos tras recarga de pantalla o de sesion.
4. Ejecutar los escenarios negativos visibles: permisos insuficientes, datos faltantes, registros de otros tenants y rutas no sincronizadas.
5. Adjuntar al manifiesto la evidencia fechada de la sesion navegador (captura o resultado estructurado).

Un `404`, `403`, pantalla vacia o falla de persistencia detectado al usar la plataforma en vivo despues de una certificacion previa indica que esa certificacion no ejecuto el flujo navegador real y bloquea la promocion hasta repetir el ciclo completo.

## Regla de bloqueo

La promocion a `main` queda prohibida si falta una evidencia, si una prueba esta pendiente o fallida, si QA no usa el commit exacto de `develop`, o si el aprobador no esta identificado. Se valida con:

```text
npm run qa:approval:evidence -- <ruta-manifest.json>
```

No se aceptan afirmaciones de funcionamiento basadas solo en revision de codigo, pruebas unitarias, entorno local o compilacion. La evidencia QA debe demostrar el comportamiento visible y los datos esperados.

## Riesgos obligatorios de compatibilidad productiva

Toda actualizacion que modifique contratos API, consultas, serializacion o modelos debe documentar y probar explicitamente:

1. Respuestas actuales, respuestas historicas y contenedores alternos como arreglo directo o `{ data: [...] }`.
2. Registros anteriores con relaciones o colecciones opcionales ausentes.
3. Apertura, edicion, guardado y reapertura del registro afectado con datos reales en QA.
4. Regresion de las funciones adyacentes que consumen el mismo contrato.
5. Comportamiento visible ante datos incompletos, sin pantallas bloqueadas ni cierres de sesion.

Un error de renderizado, una coleccion `undefined`, un contrato no certificado o una pantalla protegida solo por un error boundary bloquean la promocion a produccion.

Antes de iniciar cualquier promocion hacia produccion debe ejecutarse un certificado transversal versionado, independiente del certificado funcional especifico del cambio. Este debe comprobar con datos reales que autenticacion, sesion, navegacion y los modulos adyacentes previamente operativos continúan respondiendo correctamente. El manifiesto debe incluir `checks.platform_regression` y `regression_certification`; su ausencia, ejecucion parcial o resultado fallido bloquea automaticamente `develop -> main` y obliga a alertar, corregir y repetir QA.

Ningun agente esta autorizado a publicar o promover un cambio como completo cuando el script de certificacion no fue ejecutado, termino con error, cubre solo una parte de la solicitud o usa un commit diferente al desplegado. Una respuesta HTTP exitosa no certifica por si sola el resultado funcional.

## Compuerta Nyvora y verificacion productiva

Toda funcion candidata a `main` debe ejecutar en QA el mismo flujo que usara el usuario, con el commit exacto de `develop` y datos controlados de `NYVORA`. Para cambios de ordenes de servicio, la certificacion debe crear o recuperar una orden Nyvora, intervenirla, validar binariamente sus archivos, comprobar persistencia tras recarga y ejecutar negativas de permiso y aislamiento entre tenants.

Despues del despliegue de `main` se repite el certificado sobre el tenant modelo Nyvora y se ejecuta el certificado transversal. No se usan clientes reales para esta verificacion. Si cualquier comprobacion falla, la version queda rechazada: se detienen nuevas publicaciones, se alerta el incidente y se ejecuta la reversa controlada al `previous_main_commit` declarado. La reversa conserva la trazabilidad mediante commit; quedan prohibidos `reset --hard`, force push y reescritura de ramas compartidas.

Una falla productiva no autoriza al agente a saltar `desarrollo -> develop -> main`. La correccion y, si aplica, la reversa deben seguir el flujo y las autorizaciones independientes definidas en `AGENTS.md`.

## Compuerta de esquema y barrido masivo

Antes de aprobar una migracion que incluya modelos Prisma, consultas nuevas o modulos transversales se deben ejecutar y adjuntar estos controles:

1. `npm run audit:qa:schema -- --env-file <qa.env>` debe comprobar todas las tablas y columnas del cliente publicado contra QA sin diferencias.
2. Despues del despliegue productivo, `npm run audit:production:schema -- --env-file <production.env>` debe repetir la comparacion contra produccion. Una tabla o columna ausente rechaza la version.
3. El certificado masivo autenticado debe recorrer las familias `admin`, `inventory`, `purchases`, `sales`, `invoicing`, `accounts-receivable`, `accounting`, `projects`, `services`, `hr`, `transport` y `brain` con la empresa modelo Nyvora.
4. Las lecturas positivas deben responder correctamente con parametros validos. Los casos negativos solo aprueban cuando el codigo HTTP y el codigo funcional coinciden explicitamente con el contrato esperado.
5. El certificado debe desactivar su cuenta administrativa temporal incluso cuando una peticion falle.
6. El barrido visual debe recorrer todas las rutas habilitadas y comprobar que no existan cierres de sesion, pantallas vacias, errores recuperables ni desbordamientos bloqueantes.
7. Un fallback que presente datos vacios mientras la API primaria responde `4xx` o `5xx` se considera una falla bloqueante. La ausencia de alertas visibles no convierte el flujo en funcional.
8. Los monitores dinamicos deben reintentar fallos transitorios, conservar el ultimo estado valido y refrescar tanto la coleccion principal como sus contadores.
9. QA y produccion deben ejecutar el mismo catalogo versionado de endpoints. No se admite una lista reducida, una copia divergente ni un certificado que no compruebe el commit exacto desplegado.
10. El certificado masivo debe viajar dentro del artefacto de la API para ejecutarse con las variables del ambiente objetivo, guardar una salida JSON sanitizada y terminar con codigo distinto de cero ante una sola falla.

La migracion debe probarse primero sobre una base aislada o QA, registrar el nombre exacto aplicado y verificar nuevamente la alineacion. Queda prohibido ejecutar en bloque migraciones historicas pendientes para corregir una diferencia puntual.

## Compuerta obligatoria de alcance y preservacion

Antes de integrar una correccion se compara el estado actual del destino contra el candidato completo. No se aprueba una rama por el nombre de sus commits ni por haber aprobado pruebas en otra maquina: se aprueba exclusivamente su diferencia neta.

1. El manifiesto de alcance debe declarar el commit base exacto del destino, el commit funcional certificado, las rutas permitidas y todas las eliminaciones autorizadas.
2. `npm run qa:promotion:scope -- <manifiesto> <candidato> <destino>` debe terminar correctamente antes de cada promocion.
3. Un archivo fuera de `allowed_paths` bloquea la promocion aunque pertenezca a otro arreglo valido, haya sido creado por otra maquina o ya exista en una rama intermedia.
4. Ninguna correccion puntual puede promover migraciones, artefactos, modulos o refactorizaciones no indispensables para su objetivo.
5. Recuperar una funcion desde el historial se hace aplicando commits o hunks revisados sobre el `main` vigente. Copiar un arbol antiguo, reemplazar el branch completo o revertir un tren masivo sin inventario de capacidades queda prohibido.
6. El manifiesto debe enumerar capacidades protegidas y su evidencia. La funcion intervenida y las funciones previamente corregidas del mismo dominio se prueban juntas.
7. Toda eliminacion requiere una coincidencia exacta en `allowed_deletions`; los prefijos o comodines no autorizan borrados.
8. Si varias maquinas trabajan simultaneamente, cada entrega debe sincronizarse primero con el destino, recalcular el diff y repetir la compuerta. Una certificacion sobre un diff anterior queda invalidada.
9. Todo manifiesto nuevo usa `scope_schema_version: 2`, declara su intención y módulos, y enumera exactamente cada entrada `A`, `M` o `D` en `expected_changes`.
10. `allowed_paths` no autoriza cambios adicionales dentro de un directorio. Si el diff contiene una entrada que no aparece exactamente en `expected_changes`, la promoción queda bloqueada.
11. Si un mismo archivo contiene varias funciones, el certificado debe identificar y probar las capacidades vecinas; autorizar el archivo no autoriza reemplazar secciones ajenas al objetivo.
12. Un commit con cambios en módulos que no coinciden con su propósito declarado debe dividirse o reconstruirse mediante hunks puntuales sobre el destino remoto vigente.

La guia operativa completa se encuentra en `docs/releases/CONTROLLED_PROMOTION_SCOPE_POLICY.md`.

## Contenido minimo del manifiesto

```json
{
  "change_id": "identificador",
  "environment": "QA",
  "source_branch": "develop",
  "target_branch": "main",
  "commit": "sha-evaluado",
  "checks": {
    "functional": { "status": "passed", "evidence": ["functional.md"] },
    "error": { "status": "passed", "evidence": ["error.md"] },
    "support_scripts": { "status": "passed", "evidence": ["scripts.md"] },
    "regression": { "status": "passed", "evidence": ["regression.md"] }
  },
  "certification": {
    "status": "passed",
    "script": "../../../../scripts/certifications/example.js",
    "evidence": ["certification.json"]
  },
  "regression_certification": {
    "status": "passed",
    "script": "../../../../scripts/certifications/platform-regression-qa.js",
    "evidence": ["platform-regression.json"]
  },
  "model_company_certification": {
    "status": "passed",
    "company": "NYVORA",
    "environment": "QA",
    "script": "../../../../scripts/certifications/example-nyvora.js",
    "evidence": ["nyvora-certification.json"]
  },
  "rollback_plan": {
    "status": "ready",
    "strategy": "controlled_revert",
    "previous_main_commit": "sha-estable-en-main",
    "trigger": "cualquier falla funcional o regresion posterior al despliegue"
  },
  "approval": {
    "status": "approved",
    "approved_by": "responsable QA",
    "approved_at": "fecha ISO-8601"
  }
}
```
