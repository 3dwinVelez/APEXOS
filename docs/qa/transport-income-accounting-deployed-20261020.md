# Entrega a develop: centros vehiculares e ingresos de liquidaciones

Fecha: 2026-10-20. Este cierre actualiza el estado previo de promocion preparada.

## Integracion y alcance

- PR integrado: https://github.com/3dwinVelez/APEXOS/pull/62, `desarrollo -> develop`.
- Commit integrado: `74440d976fc07754dc96e70c5e473f2a70c17606`.
- Candidato publicado por avance normal de la rama existente desarrollo: `7ba9dcaae1cf06e6522182f5d23a02fe96f0e386`.
- Inventario exacto de 16 archivos aprobado contra develop `b9b977716bc4d442e1bc0cde59b5ae78ffb2d531`; gates `qa:promotion:scope` y `qa:preqa:evidence` aprobados antes de publicar.
- Once controles GitHub concluyeron correctamente. Integracion mediante merge, sin squash, force push, push directo a develop ni ramas adicionales.
- Los 14 archivos pendientes ajenos al alcance permanecen conservados localmente en desarrollo, con hashes comprobados y respaldo fuera de Git. No se publicaron dentro del candidato.

## Despliegue verificado

Proyecto Railway APEXOS QA `33726923-021d-47a7-a263-b8b287f164f1`, ambiente denominado production dentro de ese proyecto QA:

- API: despliegue `07928167-c9c0-44b1-94f0-bee8002abfa5`, SUCCESS, commit integrado completo.
- Web: despliegue `d899d5c8-0a14-4ec0-9329-aef80f2225d2`, SUCCESS, mismo commit integrado.
- API `/health`: HTTP 200, status OK, 18 modulos, commit `74440d976fc0`.
- Ruta nueva `/api/v1/transport/vehicle-accounting-structure`: HTTP 401 sin autenticacion, acceso protegido.
- Web QA: HTTP 200.

No fue necesario modificar infraestructura, variables o secretos ni repetir la correccion de datos SCJ.

## Certificacion y datos

La certificacion versionada ejecuto 46 verificaciones reales API/PostgreSQL sobre el codigo certificado; 92 pruebas de regresion aprobaron, junto con compilacion, lint y TypeScript. La interfaz local completo contabilizacion y liquidacion; siete comprobaciones de persistencia verificaron LT, mayor, cartera, saldos y centro vehicular. Consultar `docs/qa/certifications/transport-income-accounting-20261020.md` para detalle y limites.

SCJ conserva la correccion previamente verificada: 17 vehiculos vinculados a centros de costo en SUCURSAL PRINCIPAL (200720), tres centros manuales preservados y sedes operativas intactas. Ingresos y contrapartida se seleccionan al contabilizar; los documentos LT y su numeracion afectan mayor y cartera de forma transaccional e idempotente.

## Limites del cierre

La sesion disponible del navegador remoto muestra Acceso no autorizado al abrir Contabilidad. No se modificaron permisos ni se crearon documentos financieros reales para el smoke remoto. La certificacion funcional completa corresponde al entorno local; el smoke remoto confirma despliegue, salud y proteccion de ruta. La captura PNG del conector no estuvo disponible en la certificacion previa. No se declara aprobacion funcional humana de QA ni autorizacion para main. Produccion no fue modificada.

Las salidas crudas de CI, gates, despliegues y comprobaciones se conservan fuera de Git en `.tmp`. Este informe de cierre se conserva en desarrollo y no genera otra promocion.
