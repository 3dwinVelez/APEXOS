# Almacenamiento local offline

Estado: diseno e implementacion aislada de Fase 2.

## Dependencias

- `dexie` 4.4.4, fijado en `apps/web`.
- `fake-indexeddb` 6.2.5, dependencia de desarrollo exclusiva para pruebas Node.

Dexie 4 incluye tipos TypeScript, no agrega dependencias transitivas y soporta
IndexedDB en navegadores modernos. Se selecciona por transacciones, migraciones,
manejo consistente de errores y una API que puede permanecer detras de los
repositorios. No se usa `dexie-react-hooks`.

Alternativas descartadas:

- IndexedDB directo: aumenta codigo de transacciones, cursores y migraciones.
- `idb`: es mas pequeno, pero Dexie ofrece una capa de esquema y repositorios
  mas adecuada para las migraciones previstas.
- Cache API o `localStorage`: no son una base operacional ni ofrecen las
  transacciones requeridas.

## Compatibilidad registrada

- Node de desarrollo: 22.23.1.
- Next declarado/instalado tras alinear lock: 15.5.22.
- React declarado `^19.0.0`; instalado 19.2.6.
- TypeScript declarado/instalado: 5.8.2.
- Navegadores objetivo provisionales: versiones mantenidas de Chrome, Edge,
  Firefox y Safari 14 o posterior, incluidos motores Safari modernos en iOS.

El repositorio no tenia una matriz formal de navegadores ni una politica movil
certificada. Esta lista es una condicion tecnica provisional, no una
certificacion. Safari/iOS y navegacion privada requieren pruebas de campo.

## Particion

Se usa una base independiente por:

```text
environmentId + companyId + userId
```

Cada segmento se transforma con SHA-256 y se trunca para formar un nombre sin
identificadores legibles:

```text
apexos-offline-v2-<environmentHash>-<companyHash>-<userHash>
```

Esta opcion usa mas bases que una tabla global, pero reduce la posibilidad de
consultas cruzadas y permite eliminar un contexto completo. Los registros
conservan los tres IDs y cada repositorio los revalida como defensa adicional.

Riesgos:

- Un atacante con control del perfil del navegador puede enumerar bases y
  manipularlas.
- La truncacion del hash no es una frontera criptografica.
- Limpiar una empresa o ambiente requiere enumerar nombres IndexedDB.

La autorizacion sigue en backend; el almacenamiento nunca concede permisos.

## Carga diferida y aislamiento

`access.ts` es la unica fabrica publica. Comprueba una capacidad recibida del
servidor antes de ejecutar un `import()` dinamico del adaptador. Con capacidad
apagada devuelve modo conectado sin importar Dexie, abrir base, registrar
listeners o realizar llamadas de red.

El modulo no esta importado por layouts, providers, React ni Servicios en Fase
2. Por ello no hay chunk offline en el grafo productivo actual. La integracion
posterior debera importar solo la fabrica ligera y conservar el adaptador en un
chunk diferido.

## Sustitucion futura por SQLite

Los casos de uso dependen de `OfflineReadStorageAdapter`, no de tablas Dexie.
Una aplicacion Capacitor podra implementar el mismo puerto con SQLite. El nombre
de base, indices y migraciones Dexie son detalles del adaptador y no aparecen
en snapshots ni servicios de aplicacion.

## Degradacion

Errores de cuota, IndexedDB no disponible, apertura, bloqueo, transaccion,
esquema o corrupcion se convierten en errores tecnicos estables. La fabrica
captura fallos de inicializacion y devuelve modo conectado. No toca login,
navegacion, API, Supabase ni Servicios.

