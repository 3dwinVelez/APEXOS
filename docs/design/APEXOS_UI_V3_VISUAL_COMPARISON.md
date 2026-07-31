# APEXOS UI v3 Visual Comparison

Comparacion documental local. Las capturas graficas quedan pendientes porque no se levanto una sesion autenticada con datos locales en navegador.

| Ruta | Antes | Despues | Evidencia |
| ---- | ----- | ------- | --------- |
| `/dashboard` | Hero decorativo, graficos `recharts`, modulos destacados con sombras/animacion | Seccion operativa compacta, barras HTML/CSS, menos JS | First Load JS `264 kB -> 158 kB` |
| `/dashboard/administracion` | Accesos como cards, tabla de usuarios de 5 columnas, roles con sombras repetidas | Accesos en barra operativa, tabla de usuarios de 4 columnas, roles/permisos sin sombras | Route size `23.1 kB -> 22.9 kB` |
| `/dashboard/servicios` | Hero oscuro, `Sparkles`, instrucciones tipo onboarding, botones con sombras, barra mobile con blur | Header operativo compacto, acciones directas, tabla sticky, botones sin sombra, barra mobile solida | Route size `16.8 kB -> 16.4 kB`; First Load `157 kB -> 156 kB` |
| `/dashboard/servicios/[id]` | Flujo tecnico con tarjetas equivalentes, sombras y mobile action bar con blur | Contenedor mas ancho, header compacto, secciones sin sombra, mobile bar solida | First Load se conserva en `165 kB` |

Capturas pendientes: administracion, usuarios, roles, formulario de usuario, servicios desktop/mobile, detalle tecnico y tema oscuro.

Dictamen visual: hay diferencia visible en dashboard, administracion, servicios y detalle tecnico, pero la transformacion integral de las 58 pantallas sigue pendiente.
