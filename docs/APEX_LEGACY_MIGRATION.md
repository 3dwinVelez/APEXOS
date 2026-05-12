# Migracion APEX legacy hacia APEXOS

Fecha: 2026-05-12

## Alcance validado

Proyecto fuente: `C:\Users\mq1\Documents\Proyectos\APEX`

Modulos identificados:

- Horarios y marcaciones: se migra como submodulo de `Talento Humano`.
- Servicios: se migra como modulo nuevo `Servicios`.
- Vehiculos: se migra como maestro transversal dentro de `Transporte`.
- Referencias de servicio: se migran como submodulo de `Servicios`, no como productos de inventario.

## Mapeo funcional

### Horarios

APEX legacy:

- `horarios_contrato`
- `asistencia` / `marcaciones`
- `rutas`
- `vehiculos`
- usuarios/personas operativas
- `jornadas_procesadas`
- parametros de tiempo, festivos y conceptos de nomina

APEXOS:

- `WorkSchedule`
- `TimePunch`
- `TimeRoute`
- `ProcessedWorkday`
- `Vehicle` desde Transporte para placa, tipo, documentos y estado
- `Employee.metadata` para equivalencias legacy cuando aplique

Reglas migradas:

- Normalizacion de marcas: ingreso, almuerzo, retorno, cierre.
- Imputacion de almuerzo cuando falta una marca.
- Calculo de minutos ordinarios, nocturnos, dominicales/festivos y extras.
- Alertas operativas como `sin_salida` y `almuerzo_imputado`.
- GPS y vehiculo por marcacion.
- Ruta del dia con vehiculo y equipo asignado antes de operar.

### Servicios

APEX legacy:

- `ordenes_servicio`
- `fotos_servicio`
- `novedades_servicio`
- referencias/piezas para inspeccion
- tecnicos desde personal legacy

APEXOS:

- `ServiceOrder`
- `ServicePhoto`
- `ServiceIncident`
- `ServiceReference`
- `ServiceReferencePart`
- `Employee` como tecnico asignado cuando exista

Estados migrados:

- `pendiente`
- `en_curso`
- `inspeccion`
- `ejecucion`
- `cerrada`
- `no_ejecutada`
- `cancelada`

### Transporte

APEX legacy:

- `vehiculos`
- tipos por defecto: Camion, Camioneta, Furgon, Moto y Otro
- vencimientos documentales: SOAT, tecnico-mecanica y seguro

APEXOS:

- `Vehicle`
- Pagina `Transporte` como maestro transversal de placa, tipo, modelo, marca, capacidad, combustible, kilometraje, propietario y documentos.
- El vehiculo queda disponible para `Talento Humano`, rutas, marcaciones y futuros flujos logisticos.

### Referencias de servicio

Decision funcional:

- La referencia de servicio no se comporta como producto de inventario.
- Debe vivir en `Servicios`, porque define el trabajo tecnico, categoria, tiempo estimado, piezas esperadas e instrucciones de inspeccion.

APEXOS:

- `ServiceReference`
- `ServiceReferencePart`
- `ServiceOrder.reference_id`

Con esto, una orden de servicio exige una referencia antes de operar y puede asignar tecnico desde `Employee.position = tecnico`.

## Estrategia de datos

La migracion debe crear o reutilizar un tenant APEXOS para la empresa fuente. Todas las filas migradas deben incluir `tenant_id`.

Orden recomendado:

1. Crear tenant de empresa vinculada.
2. Migrar usuarios/personas a `User`, `Party` y/o `Employee`.
3. Migrar vehiculos a `Vehicle`.
4. Migrar horarios a `WorkSchedule`.
5. Migrar rutas a `TimeRoute`, vinculando `vehicle_plate` y empleados.
6. Migrar marcaciones a `TimePunch`.
7. Ejecutar reproceso de jornadas hacia `ProcessedWorkday`.
8. Migrar referencias de servicio a `ServiceReference`.
9. Migrar piezas de referencia a `ServiceReferencePart`.
10. Migrar ordenes a `ServiceOrder`, vinculando `reference_id` y tecnico cuando exista.
11. Migrar novedades a `ServiceIncident`.
12. Migrar fotos a `ServicePhoto`, preferiblemente preservando URL original o base64 solo si no hay storage.

## Riesgos

- APEX legacy usa nombres de usuario como identificador operativo; APEXOS debe resolver equivalencias por `legacy_user_id`, `username`, documento o nombre.
- Horarios no debe operar sin personas y vehiculos base; hay que importar esos maestros antes de rutas y marcaciones.
- Servicios no debe operar sin referencias y tecnicos; hay que importar esas entidades antes de ordenes.
- Algunas fotos pueden estar en Supabase Storage o base64. Conviene migrar URL primero y mover binarios despues.
- Festivos de Colombia deben convertirse luego a calendario LATAM configurable por pais.
- Si hay tablas legacy creadas parcialmente por patches, se debe correr una lectura de esquema antes del traspaso final.

## Decision

La migracion es viable y se recomienda hacerla como importador controlado por tenant, no como copia directa de tablas. APEXOS ya tiene los modelos destino para iniciar pruebas de carga con una empresa vinculada.
