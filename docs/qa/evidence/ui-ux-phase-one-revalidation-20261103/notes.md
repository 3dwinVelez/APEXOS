# Revalidación UI/UX fase uno — 2026-11-03

- Rama: `desarrollo`
- Commit base: `48e3d8f7`
- Entorno: LOCAL, web en `http://127.0.0.1:3001` con datos demo (`demo@apex.local`)
- Veredicto: **passed** — 13/13 comprobaciones

## Comandos

```bash
node apps/web/test/certify-ui-ux-phase-one-local.mjs \
  --output=docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/browser-certification.json

cd apps/web && node --test test/certify-ui-ux-phase-one-local.mjs
```

## Diagnóstico

1. `product_step_navigation` fallaba con la etiqueta `Existencias y dimensiones`, retirada en `378115ef` al simplificar la creación de productos. En navegador se comprobó que el paso avanza a `Clasificación` (`aria-current="step"`) y renderiza el panel `Clasificación y organización`. El producto no tenía regresión: la expectativa del arnés estaba desactualizada.
2. `purchases_controls_named` contaba un `select` auxiliar del dropdown propio con `aria-hidden="true"` y `tabindex="-1"`, que no es un control accesible del formulario. Se excluyen controles `aria-hidden` y `type="hidden"` del conteo.

No se modificó ninguna pantalla ni componente del producto.

## Resultado

- `browser-certification.json`: `status: "passed"`, 13 checks.
- `web-phase-one-suite.txt`: `fail 0`, `pass 1` (la certificación como archivo de prueba), 28.9 s.
