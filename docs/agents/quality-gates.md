# Gates de calidad

## Clasificación de riesgo

| Riesgo | Ejemplos | Gates mínimos |
| --- | --- | --- |
| Bajo | Documentación, plantillas, scripts sin lógica ERP. | Estado Git, validación específica y revisión de diff. |
| Medio | UI, rutas de lectura, validaciones no financieras. | Runtime, Prisma, lint, typecheck, unidad aplicable y build web. |
| Alto | Escrituras, tenancy, autenticación, RBAC, colas o integraciones. | Gates medios, pruebas del módulo, revisión técnica y validación local aislada. |
| Crítico | Contabilidad, impuestos, inventario, costos, nómina o migraciones. | Autorización funcional, pruebas de regresión específicas, revisión funcional y técnica independiente. |

## Certificación navegador / plataforma en vivo (obligatoria)

Ningún cambio funcional se considera corregido o completo solo porque sus pruebas automatizadas pasen o el API responda `2xx`. Toda corrección o funcionalidad debe validarse además ejecutando el flujo real desde el navegador sobre la plataforma en el ambiente objetivo (QA), con el commit exacto evaluado:

1. Reproducir la novedad reportada desde la interfaz real antes de cerrar el caso.
2. Ejecutar el flujo completo de la funcionalidad afectada (abrir, editar, guardar, reabrir) tal como lo haría el usuario.
3. Comprobar persistencia tras recarga de la pantalla o sesión.
4. Ejecutar los escenarios negativos visibles: permisos insuficientes, datos faltantes y aislamiento entre empresas.
5. Guardar evidencia fechada de la sesión navegador (captura o resultado estructurado) en el manifiesto de QA.

Un error posterior a la certificación (por ejemplo, un `404` que aparece al usar la función en el ambiente objetivo) indica que la certificación previa no ejecutó la plataforma en vivo y obliga a repetir el ciclo completo antes de cualquier promoción.

## Perfil seguro

El comando estándar es:

```powershell
npm run agent:test -- --profile safe
```

Debe ejecutar:

1. `npm run doctor:node`
2. `npm run prisma:validate`
3. `npm run lint`
4. `npm --workspace apps/web run typecheck`
5. `npm run test:inventory:unit`
6. `npm --workspace apps/web run build`

## Suites con datos

Estos comandos no son gates seguros por defecto:

- `npm run qa:purchases:tax-reversal`
- `npm run qa:inventory:transit`
- `npm run qa:deterministic-validation`
- `npm run qa:full-validation`
- Seeds, migraciones, `db:push` y scripts de producción.

Antes de ejecutarlos:

1. Validar que `DATABASE_URL` use `localhost`, `127.0.0.1`, `postgres` dentro del Compose local o un host local aprobado.
2. Confirmar que la base sea desechable.
3. Bloquear referencias a producción, `config/production.env` y `supabase/production`.
4. Documentar cualquier escritura o limpieza.

## Reglas de aceptación

- Un comando fallido permanece fallido en el informe.
- No se permiten `|| true`, exclusiones nuevas ni reducción de cobertura para obtener verde.
- Una prueba no ejecutada se reporta como omitida con motivo, nunca como aprobada.
- El build no sustituye typecheck, lint o pruebas.
- Un agente no puede certificar una regla funcional que no fue confirmada.

## Alcance de promocion

Antes de promover se ejecuta:

```powershell
npm run qa:promotion:scope -- <manifiesto-alcance.json> <candidato> <destino>
```

La compuerta compara el diff neto, no solo el ultimo commit. Rechaza rutas inesperadas, eliminaciones no autorizadas, un destino que ya no coincide con el commit base y capacidades protegidas sin evidencia aprobada. Después de cualquier sincronización o aporte desde otra máquina debe recalcularse y ejecutarse nuevamente.

Los manifiestos nuevos usan `scope_schema_version: 2`. Además de `allowed_paths`, deben declarar `change_intent` y el inventario exacto `expected_changes`. Esto bloquea un archivo lateral aunque esté incluido accidentalmente por un prefijo amplio. Antes de aceptar un aporte de otra máquina se ejecuta la compuerta contra el destino remoto vigente y se revisa que el propósito del commit coincida con sus módulos reales.
