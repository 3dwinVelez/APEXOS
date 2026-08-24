# Validación de seguridad de dependencias

Fecha: 2026-08-24

Rama: `desarrollo`

Commit certificado: `6e0c394b4d8ca55bc0e00decfa239502393842c7`

## Resultado

La auditoría inicial reportó 11 paquetes vulnerables con severidad alta y cero vulnerabilidades críticas. Las cadenas afectadas eran:

- `next -> postcss/sharp`.
- `puppeteer-core -> @puppeteer/browsers -> extract-zip`.
- Herramientas y validadores transitivos: `brace-expansion`, `fast-uri`, `ip-address`, `js-yaml` y `nanoid`.

Se actualizaron las líneas sin parche disponible a `next 16.3.2`, `puppeteer-core 25.8.0` y `sharp 0.35.3`. Los transitivos quedaron en versiones corregidas y `extract-zip` dejó de formar parte del árbol.

`npm ci` reprodujo correctamente el lockfile y `npm audit --audit-level=low` terminó con cero vulnerabilidades en todas las severidades.

## Compatibilidad

- Suite completa API/web: 252/252 pruebas aprobadas.
- Pruebas específicas del rol de marcaciones: incluidas y aprobadas.
- TypeScript: aprobado.
- ESLint: cero errores y seis advertencias históricas de navegación interna.
- Build Next.js 16.3.2: aprobado, 63 páginas generadas.
- `sharp`: operación binaria PNG aprobada.
- `puppeteer-core`: API de lanzamiento disponible.

La configuración ESLint migró del adaptador legacy a la configuración plana nativa de Next 16. Tres reglas nuevas de React se mantuvieron desactivadas para no modificar 62 patrones históricos en módulos ajenos al cambio; las reglas de Next, TypeScript y seguridad permanecen activas.

## Evidencia reproducible

Ejecutar:

```text
npm ci
npm run certify:dependency-security -- --output docs/qa/evidence/dependency-security-20260824/certification.json
npm run lint
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```
