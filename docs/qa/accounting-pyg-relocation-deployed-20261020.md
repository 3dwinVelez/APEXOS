# Cierre: PYG vehicular trasladado a Contabilidad

Fecha: 2026-10-20. PR https://github.com/3dwinVelez/APEXOS/pull/63 integrado mediante merge desde desarrollo hacia develop, commit `947f508b358c0a2c4f2c62d5d9867930cf1a6169`.

La ruta principal es `/dashboard/contabilidad/pyg`, accesible desde portada, navegacion y centro de comandos de Contabilidad. Transporte ya no ofrece la tarjeta. La URL anterior responde HTTP 307 hacia la nueva. Lectura y escritura se autorizan con accounting:read y accounting:write; se conservan fuentes y calculos existentes.

## Evidencia de promocion

- Candidato puntual `7191bde289812553cb2558127803c565e0d5a84d`, baseline `74440d976fc07754dc96e70c5e473f2a70c17606`.
- Gates qa:preqa:evidence y qa:promotion:scope aprobados; inventario exacto de 15 rutas cotejado tambien con el PR.
- Once controles GitHub aprobados: gobierno Git, seguridad, API, web, lint y tipos, incluyendo ejecuciones de push y PR.
- Certificacion versionada: 29 verificaciones reales API/PostgreSQL; nueve pruebas del motor. Interfaz local de produccion: portada, detalle, configuracion, redireccion con usuario exclusivamente contable y centro de comandos bajo Contabilidad.
- Compilacion de produccion y TypeScript aprobados. Lint afectado sin errores; advertencia img preexistente. La prueba global de cobertura del buscador conserva un fallo preexistente por dos rutas ajenas, reproducido en el target; los otros 12 casos de navegacion/permisos aprobaron. Detalle en `certifications/accounting-pyg-relocation-20261020.md`.

## Despliegue y smoke remoto

Proyecto Railway APEXOS QA `33726923-021d-47a7-a263-b8b287f164f1`, ambiente denominado production dentro de ese proyecto QA. Ambos servicios SUCCESS sobre el mismo commit integrado:

- API: `9a260b4d-cff6-4df4-a431-369436168cc3`.
- Web: `2bf34425-7f52-4621-947c-5dab9c1dd22c`.
- API /health HTTP 200, status OK, commit `947f508b358c`, 18 modulos.
- Catalogo /api/v1/transport-pyg/source-concepts sin autenticacion: HTTP 401.
- Web /dashboard/transporte/pyg: HTTP 307, Location /dashboard/contabilidad/pyg.
- Web /dashboard/contabilidad/pyg: HTTP 200.

La comprobacion funcional autenticada y la captura corresponden a la compilacion local de produccion. El smoke remoto confirma despliegue exacto, rutas y proteccion anonima; no declara aprobacion funcional humana de QA ni validacion movil.

## Integridad y limites

No se crearon ramas, no se uso force push ni push directo a develop o main. Se publico un avance normal de la rama desarrollo existente y se integro mediante PR. Quince archivos pendientes ajenos permanecen intactos localmente, verificados por blob, con bundle de respaldo fuera de Git y excluidos del diff promovido. El arbol integrado coincide con el candidato puntual.

No hubo migraciones, modificaciones remotas de datos, permisos reales, infraestructura, secretos o produccion. Los servidores temporales de certificacion local se detuvieron. Salidas crudas y PNG se conservan fuera de Git en `.tmp/accounting-pyg-*`. Este informe se conserva localmente en desarrollo, sin otra promocion.
