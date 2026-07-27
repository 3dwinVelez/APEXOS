# Plan de remediación de dependencias

## Cambios aplicados

- Eliminar `adm-zip`, porque no tenía consumidores.
- Actualizar Fastify dentro de 5.x y sus transitivas `find-my-way`/`fast-uri`.
- Actualizar Next y su configuración ESLint dentro de 15.5.x.
- Actualizar Nodemailer a 9.0.3; la API utilizada (`createTransport`/`sendMail`) permanece compatible.
- Actualizar PostCSS directo y añadir Sharp 0.35.0.
- Actualizar `concurrently`, Nodemon, `js-yaml` y versiones vulnerables de `brace-expansion`.

## Overrides controlados

| Paquete | Versión | Motivo | Compatibilidad | Revisión | Retirar cuando |
| --- | --- | --- | --- | --- | --- |
| `brace-expansion@1.1.14` | 1.1.16 | corregir DoS sin cambiar la línea 1.x esperada por minimatch 3 | parche de la misma línea | 2026-10-26 | todos los padres declaren 1.1.16+ |
| `brace-expansion@5.0.6` | 5.0.8 | corregir DoS sin cambiar la línea 5.x | parche de la misma línea | 2026-10-26 | todos los padres declaren 5.0.8+ |
| `postcss` | 8.5.23 | fijar versión corregida para consumidores deduplicables | misma API 8.x | 2026-10-26 | Next deje de fijar 8.4.31 |
| `sharp` | 0.35.0 | disponer de libvips corregido para resolución directa | API usada indirectamente por Next | 2026-10-26 | Next declare Sharp 0.35+ |

## Pendientes y decisión

No se fuerza Next 14 (downgrade funcional) ni Next 16 (migración mayor) únicamente para satisfacer la agregación de `npm audit`. Incluso Next 16.2.12 declara `sharp ^0.34.5` y PostCSS 8.4.31 a la fecha de revisión. Hasta que Next publique dependencias compatibles:

- no aceptar CSS, source maps o configuración PostCSS desde usuarios;
- mantener bloqueados SVG y formatos no permitidos en cargas;
- conservar límites de tamaño, firma y dimensiones;
- revisar el uso efectivo de la optimización de imágenes antes de desplegar;
- repetir `npm audit` en cada release.

## Rollback

Revertir el commit de dependencias restaura los tres manifiestos y `package-lock.json`. Ejecutar luego `npm ci`. No hay migraciones de datos ni cambios de esquema.
