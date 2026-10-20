# APEXOS — Cierre local de cálculo de tarifas, 2026-10-17

OBJETIVO: completar la pantalla del paso 4 conforme a la referencia y verificar sus funciones reales.
RAMA: desarrollo.
COMMIT INICIAL / FINAL: 7cb5abea015579e3a8dcd04b038ac7ac119dfe3c; implementación en working tree, sin commit.
ESPECIALIDADES: engineering-orchestrator, frontend-expert, backend-expert, qa-testing-expert y ciberseguridad (REVIEW).

## Cambios entregados

- Presentación clara del modal, tres columnas en escritorio, tarifa principal, adicionales, simulador, consumo y resumen; pie fijo con acciones. Adaptación de tablet y móvil sin imponer cambios al tema del resto de APEXOS.
- Métodos fijo, por kilómetro, por kilogramo y por volumen operativos; cambiar método elimina coeficientes ocultos del anterior.
- Paradas incluidas/extras, peajes, espera, cargue/descargue y otros costos calculan realmente. Los interruptores conservan su estado incluso cuando están activados con importe cero.
- Origen por dirección o sede; búsqueda externa e interna; agregar, quitar y reordenar paradas; capas mapa y satélite; detalles, recálculo, ida y regreso y limpieza.
- Una dirección editada pierde sus coordenadas previas; una parada no resuelta bloquea el guardado sin generar un cobro ficticio. Se descartan respuestas asíncronas obsoletas y se respeta la distancia manual.
- Combustible referencial por rendimiento, precio y ajuste; solo se suma mediante la acción explícita. Evita doble cobro porcentual y permite volver al recargo porcentual.
- Configuración de consumo, procedencia del recorrido, distancia calculada/manual y origen de sede preservados en metadata aditiva.
- Guardado con estado pendiente, protección contra doble envío y errores dentro del modal.

## Rutas reales sin clave Google en desarrollo local

El usuario confirmó que no dispone de clave. Se incorporaron Photon para geocodificación y OSRM para recorrido vial, con geometría real. Solo se habilitan con NODE_ENV=development, base de datos de host local y sin entorno Railway; no alteran el proveedor de QA/producción.

No ofrecen tráfico en vivo. La UI muestra proveedor y procedencia; si los proveedores fallan, la aproximación final continúa claramente identificada. Las distancias y tiempos pueden diferir de la imagen de referencia. No se presenta como Google un mapa de otro proveedor.

Los servidores públicos son adecuados para pruebas locales moderadas; no constituyen una decisión de proveedor productivo. Referencias primarias: [Photon](https://github.com/komoot/photon/blob/master/README.md), [API Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md), [OSRM](https://project-osrm.org/docs/v5.22.0/api/).

## QA ejecutado

- **104 pruebas aprobadas, 0 fallos**: proveedores abiertos, costos web/API, callbacks del componente, round-trip de payload, estados de interruptores, RBAC de tarifas, motor de liquidación, inteligencia de rutas y regresión UI TMS/maestros.
- **TypeScript aprobado**: npm --workspace apps/web run typecheck.
- **ESLint aprobado, sin advertencias** en los dos archivos TSX modificados.
- **HTTP real aprobado**: scripts/certifications/transport-rate-cost-local.js. Autenticación, búsqueda, recorrido OSRM con geometría, creación, edición, reapertura y nueva versión. Datos sintéticos 39/40, código QA-COST-FLOW-1792282834483.
- **Certificación de navegador real aprobada**: scripts/certifications/transport-rate-cost-browser.mjs, ejecutado por etapas con cua_repl sobre la sesión local. Verifica identidad de la fixture antes de editar, navegación, recorrido, orden, capas, detalles, parada incompleta, métodos, adicionales, combustible, guardado y reapertura. El cierre rechaza checks fallidos o ausentes y requiere revisión visual explícita.
- **Escritorio 1536x1024 y móvil 390x844 inspeccionados visualmente**. En móvil se revisaron también el resumen inferior y las acciones al desplazarse. Se conservaron las capturas como evidencia externa al repositorio.
- Caso funcional: 85.000 base + (3 entregas - 1 incluida) * 12.000 = **109.000 COP**, persistido al reabrir.
- Métodos/adicionales: 230.500 por km; 134.000 por kg; 109.200 por m³; 119.000 con peajes; 124.000 con espera; 124.000 con cargue; 114.000 con otros.
- Combustible: 48,6 / 8 * 1,10 * 11.000 = **73.508 COP redondeados**; aplicarlo suma una sola vez y lleva 109.000 a 182.508. La imagen muestra 73.480, cuyo error aritmético no se reprodujo.

### Evidencia y repetibilidad

Archivos locales bajo C:/Users/mq1/AppData/Local/Temp:

- apexos-rate-cost-road-local-20261017.json — ejecución HTTP real.
- apexos-rate-cost-final-native-20261017/browser.json — certificación final de navegador, status passed.
- apexos-rate-cost-final-native-20261017/desktop.jpg y mobile.jpg — evidencia visual.
- apexos-rate-cost-certified-worktree-20261017.json — hashes del código certificado y base Git.

El navegador se controló y verificó finalmente por su árbol de accesibilidad. Durante la preparación hubo intentos interrumpidos por reinicio automático de la API, snapshots DOM obsoletos, tiempos de espera del controlador y selección ambigua de una fila a partir del mensaje de éxito. Se corrigió el harness para usar la identidad exacta de la fixture, controles AX y fases acotadas. Los intentos se conservaron en archivos browser-harness-attempt*.json; no se interpretan como aprobaciones. La ejecución final contiene únicamente comprobaciones efectivamente aprobadas. No se guardaron cambios sobre el tarifario 001.

## Security review

Superficie: llamadas servidor a servidor y respuesta de candidatos/ruta. Destinos HTTPS fijos, redirecciones rechazadas, timeouts, caché pública acotada a 100 entradas y deduplicación de solicitudes. No se transmiten IDs de empresa, sede, credenciales ni etiquetas privadas al router. Geocodificación transmite el término buscado, como exige la función. Coordenadas nulas/fuera de rango se rechazan antes de consultar OSRM. La habilitación local valida el hostname real de la URL, no una coincidencia de texto en credenciales.

Pruebas: proveedores desactivados en producción/QA remoto, host remoto que incluye localhost en credenciales, entradas inválidas, errores upstream sin éxito ficticio, ruta de retorno vial, caché y llamada anónima rechazada (401). Se preservaron los middleware de permisos y el acceso tenant-scoped existentes; no se modificaron roles ni autorización. No se identificaron vulnerabilidades explotables dentro de esta superficie revisada. No representa una nueva auditoría integral multiempresa.

DATABASE: sin cambios de esquema ni migraciones.
PERFORMANCE: sin nuevas dependencias; búsqueda con debounce y caché acotada; sin benchmark general solicitado.
RIESGO RESIDUAL: disponibilidad y límites de servidores públicos locales, sin tráfico en vivo. Google productivo sigue requiriendo su configuración autorizada.
GIT STATUS: cambios locales sin commit; sin push, merge, promoción, despliegue, migración, cambio de infraestructura o secretos.

DICTAMEN: APTO CON OBSERVACIONES para el alcance local con proveedor abierto documentado.
ESTADO DE PROMOCIÓN: NO SOLICITADA. No se ha generado ni aprobado manifiesto pre-QA ni de promoción; no autoriza publicación.
SIGUIENTE ACCIÓN: revisión funcional del usuario en local. Una futura promoción debe respetar desarrollo -> develop -> main y todos los gates del repositorio.
