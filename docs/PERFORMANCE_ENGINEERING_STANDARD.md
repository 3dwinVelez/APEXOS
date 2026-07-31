# Performance Engineering Standard

Fecha: 2026-07-23

## Principios

- Medir antes y despues cuando exista ambiente representativo.
- Optimizar rendimiento real y rendimiento percibido.
- Evitar invalidaciones globales cuando exista una entidad afectada clara.
- Mantener presupuestos por accion, no solo por pagina.
- Bloquear releases con regresiones criticas de latencia, duplicados o payload.

## Operaciones Moviles Y Evidencias

Esta seccion es obligatoria para modulos usados en campo: Servicios, Transporte, Talento Humano y cualquier flujo con fotos, firmas o geolocalizacion.

### Reglas

- La UI debe responder en menos de 100 ms al toque.
- Las fotos deben tener preview local inmediata.
- Las imagenes deben comprimirse/redimensionarse antes de subir.
- Cada evidencia debe tener estado independiente: pendiente, cargando, cargada, fallida.
- Una subida no debe congelar la pantalla ni bloquear pasos no relacionados.
- Toda evidencia debe llevar identificador idempotente.
- La aplicacion debe conservar datos capturados ante error de red.
- Los reintentos no deben crear duplicados.
- Las acciones deben invalidar cache por entidad afectada.
- Los endpoints operativos deben retornar solo lo necesario.

### Pruebas Minimas

- Escritorio y viewport movil.
- Wi-Fi estable.
- Red movil lenta o simulada.
- Carga fria y repetida.
- Multiples archivos.
- Error de red y reintento.
- Validacion multiempresa/RLS cuando aplique.

### Criterio De Bloqueo

El release se bloquea si:

- se recarga toda una entidad grande despues de una accion pequena;
- se pierde una foto capturada por error de red;
- se permite doble envio normal;
- una accion comun mantiene la UI congelada durante segundos;
- aumentan de forma no justificada consultas, payload o p95.
