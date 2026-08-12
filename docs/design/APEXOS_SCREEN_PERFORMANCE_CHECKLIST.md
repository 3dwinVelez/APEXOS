# APEXOS Screen Performance Checklist

Versión: 1.0

Estado: normativa propuesta desde remediación controlada

## Regla obligatoria

Ninguna pantalla se aprueba únicamente por cumplir la apariencia del Design System. Debe demostrar equivalencia funcional, rendimiento controlado y productividad medible.

## Revisión funcional

- [ ] Acción principal definida.
- [ ] Información necesaria identificada.
- [ ] Estados de carga, vacío, error, éxito y permiso insuficiente.
- [ ] Roles y permisos verificados.
- [ ] Errores recuperables y accionables.
- [ ] Offline verificado cuando aplique.
- [ ] Flujo anterior retirado después de comprobar equivalencia.
- [ ] Sin lógica funcional duplicada.

## Revisión técnica

- [ ] Commit base y candidato registrados.
- [ ] Tamaño JavaScript de ruta registrado.
- [ ] JavaScript compartido registrado.
- [ ] CSS registrado.
- [ ] Componentes cliente justificados.
- [ ] Requests iniciales contados.
- [ ] Consultas duplicadas descartadas.
- [ ] Renders perfilados.
- [ ] Nodos DOM contados.
- [ ] Modales y drawers no montados antes de abrir.
- [ ] Gráficos cargados solo cuando son visibles.
- [ ] Tablas paginadas o virtualizadas según volumen.
- [ ] Dependencias e iconos importados de forma granular.
- [ ] Estados Mobile y Desktop medidos por separado.
- [ ] Accesibilidad, foco y objetivos táctiles validados.

## Presupuestos iniciales

Estos límites son puertas de revisión, no metas estéticas.

| Presupuesto | Límite |
| --- | ---: |
| JavaScript compartido | No superar 103 kB |
| JavaScript de ruta | No superar `main` para la misma ruta sin justificación aprobada |
| Objetivo de reducción en ruta intervenida | 10 % |
| CSS estático | No superar 85.318 bytes como objetivo de retorno a `main` |
| Requests duplicados | 0 |
| Incremento de requests iniciales | 0 |
| Respuesta visual tras acción | Menos de 100 ms |
| Incremento de nodos DOM | 0 sin justificación |
| Objetivo DOM cuando existe sobrecarga | -10 % |
| Objetivo de renders innecesarios | -15 % |
| Imágenes iniciales fuera del viewport | 0 |
| Modales ocultos montados | 0 |
| Gráficos no visibles cargados | 0 |

## Reglas por componente

### Componentes cliente

- Mantener `"use client"` en el límite más pequeño posible.
- No convertir layouts o páginas completas en cliente por una interacción secundaria.
- Evitar estados globales para controles locales.

### Modales y drawers

- Renderizar únicamente cuando estén abiertos.
- Cargar contenido pesado de forma diferida.
- No usar blur.
- Mantener cierre por teclado y foco accesible.

### Tablas

- Header sticky solo cuando el volumen lo justifique.
- Paginación para volumen medio.
- Virtualización solo con evidencia de congelamiento o DOM excesivo.
- No renderizar una tabla Desktop oculta junto a una lista Mobile equivalente.

### Gráficos

- No cargar Recharts en rutas que no muestran un gráfico inicialmente.
- Usar importación diferida para paneles secundarios.
- El gráfico debe apoyar una decisión operativa.

### Fuentes e iconos

- Una sola familia tipográfica.
- Imports granulares de Lucide.
- No duplicar iconos con SVG local equivalente.

### Imágenes y evidencia

- Lazy loading fuera del viewport.
- Miniaturas antes del archivo completo.
- No precargar evidencia no visible.
- Respetar Offline First y almacenamiento autorizado.

## Medición

1. Calentamiento excluido.
2. Cinco repeticiones.
3. Mediana como valor principal.
4. Mismo equipo, navegador, backend, datos, usuario y permisos.
5. Misma versión de Node, framework y configuración.
6. Registrar resultados brutos.
7. Revertir si el piloto no mejora ni ofrece equivalencia técnica justificada.

