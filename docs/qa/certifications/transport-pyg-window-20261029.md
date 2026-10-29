# Certificación local: ventana ampliada del PYG por vehículo

Fecha: 29 de octubre de 2026, America/Bogota. Implementación en `desarrollo`, mediante Qoder; revisión y ejecución independiente de las pruebas mediante Codex.

## Cambio y cobertura

El enlace «Abrir en otra ventana» abre una pestaña nativa, sin menú lateral, conservando placa y período en una ruta interna. La vista comparte las tablas, indicadores y desglose de la página normal; consulta el mismo libro contable del mes solicitado. Ofrece selección de vehículo, cambio de mes, actualización, pantalla completa y regreso al PYG. Conserva autenticación y permisos de contabilidad.

El guion versionado `scripts/certifications/transport-pyg-ledger-only-browser-local.js` terminó **passed: 97 comprobaciones integrales**, con `browser_coverage_completed: true`, a las `2026-10-29T14:28:31.101Z`. Chrome headless real, API HTTP y PostgreSQL locales reales; documentos y empresas sintéticos. No se simulan las respuestas contables.

Se certificaron apertura con clic real, `target=_blank`, `noopener`, placa y período exactos, ausencia de menú lateral, ancho útil completo, igualdad de filas e importes con la vista normal y el libro, desglose concepto → cuenta → centro por nombre, cambio de placa sin consulta adicional, bloque sin vehículo, cambio de mes y persistencia tras recarga. Un período inválido no consulta la API y permite recuperarse al elegir un mes válido; una placa inválida no muestra otra placa.

La pantalla completa nativa entró y salió correctamente; se desplazó su propio contenedor de 0 a 967 píxeles. El regreso restauró el menú lateral sin alterar la selección de la pestaña original. El rol sin lectura contable recibió 403 y la vista no mostró tablas ni cifras. Se repitieron configuración, presupuesto, aislamiento entre empresas, respuestas tardías y actualización tras publicar un asiento nuevo.

## Validaciones complementarias

- 98 pruebas web aprobadas, sin fallos ni omisiones: ventana ampliada, Por CC, página por vehículo, configuración y PYG contable interactivo.
- 62 pruebas API aprobadas, sin fallos ni omisiones: reporte, rangos PUC y matriz por centro.
- Compilación de producción y TypeScript aprobados mediante `next build --webpack`, distribución local `.next-pyg-combined-20261029`. Los once archivos web modificados coinciden por SHA-256 con las fuentes compiladas.
- ESLint de los componentes, página y auxiliares del cambio: cero errores y advertencias.
- Revisión independiente de las correcciones de centros entre sucursales, porcentajes de ingreso propio y etiquetas de sucursal aprobada.

## Evidencia y límites

Artefacto local: `docs/qa/evidence/transport-pyg-window-20261028/browser-local.json`.

SHA-256 del artefacto: `89584da1b94727ca7ecbb4a68792dfc95b55612cab006b91a45b67bfe8f6b167`.

SHA-256 del guion: `69d6623bfdf73a350a361aba899b73c6120683edadb56115621f36ea34e5275f`.

Capturas locales de la corrida aprobada: `pyg-expanded-vehicle-c6a091e6f8.png`, `pyg-expanded-second-plate-c6a091e6f8.png` y `pyg-expanded-fullscreen-c6a091e6f8.png`. El artefacto registra cero errores de página. Los intentos anteriores fallidos se debieron a errores del guion de lectura/espera y a prerrequisitos o límites de registro locales; ninguno se usa como certificación aprobada.

API de prueba en `127.0.0.1:3000`, web en `127.0.0.1:3001`, PostgreSQL en `127.0.0.1:55432`. La corrida usó la web local de desarrollo con las fuentes actuales; adicionalmente se compiló la misma fuente para producción. Esta certificación no acredita una prueba funcional autenticada en QA. No se modificaron datos remotos, infraestructura, secretos, migraciones ni configuración de despliegue. JSON, capturas y registros quedan locales, fuera de los commits.

La publicación del conjunto ventana ampliada + Por CC requiere además la certificación actualizada de la matriz, los manifiestos pre-QA y de alcance exacto contra el destino vigente. Flujo obligatorio: `desarrollo -> develop -> main`; esta evidencia no autoriza producción.
