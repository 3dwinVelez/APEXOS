# Gates de calidad

## Clasificación de riesgo

| Riesgo | Ejemplos | Gates mínimos |
| --- | --- | --- |
| Bajo | Documentación, plantillas, scripts sin lógica ERP. | Estado Git, validación específica y revisión de diff. |
| Medio | UI, rutas de lectura, validaciones no financieras. | Runtime, Prisma, lint, typecheck, unidad aplicable y build web. |
| Alto | Escrituras, tenancy, autenticación, RBAC, colas o integraciones. | Gates medios, pruebas del módulo, revisión técnica y validación local aislada. |
| Crítico | Contabilidad, impuestos, inventario, costos, nómina o migraciones. | Autorización funcional, pruebas de regresión específicas, revisión funcional y técnica independiente. |

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
