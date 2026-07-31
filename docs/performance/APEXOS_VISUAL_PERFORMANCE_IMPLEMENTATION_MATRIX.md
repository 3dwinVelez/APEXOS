# APEXOS Visual Performance Implementation Matrix

Base local: `26b1331 merge: promote desarrollo into develop`

| Pantalla | Tipo | Estado inicial | Decoradores eliminados | DOM antes | DOM despues | JS antes | JS despues | Requests antes | Requests despues | Estado |
| -------- | ---- | -------------- | ---------------------: | --------: | ----------: | -------: | ---------: | -------------: | ---------------: | ------ |
| `/dashboard` | Desktop/Mobile compartida | Dashboard cliente con `recharts`, hero decorativo, tarjetas con sombras y modulos destacados con animacion hover | 3 graficos Recharts, gradiente hero, sombra principal, fondo oscuro ornamental, sombras de links | No medido en navegador | Reducido por reemplazo de SVG/chart wrappers por barras HTML | 264 kB First Load JS | 158 kB First Load JS | 5 consultas condicionales | 5 consultas condicionales | Validada |
| Shell dashboard | Compartida | Sidebar, mobile nav y header tecnico con sombras/blur/transiciones decorativas | `shadow-sm`, `shadow-lg`, `backdrop-blur`, transicion 200 ms | No medido en navegador | Menos clases de composicion visual e igual estructura funcional | Compartido sin aumento | Compartido sin aumento | N/A | N/A | Validada |
| `/dashboard/administracion` | Desktop | Tabla usuarios de 5 columnas, accesos como cards y roles con sombras repetidas | cards de acceso, columna organizacion redundante, sombras de roles/permisos | No medido en navegador | Reducido por tabla de 4 columnas y toolbar compacta | 181 kB | 181 kB | Pendiente | Pendiente | Migracion parcial |
| `/dashboard/servicios` | Desktop/Mobile | Hero decorativo, filtros extensos y acciones con sombras/blur | hero, `Sparkles`, guia de pasos, sombras de botones, blur mobile | No medido en navegador | Reducido por header operativo y acciones compactas | 157 kB | 156 kB | Pendiente | Pendiente | Migracion parcial |
| `/dashboard/servicios/[id]` | Mobile/Desktop tecnico | Detalle con tarjetas equivalentes, sombras y barra mobile con blur | sombras de secciones y acciones, blur mobile | No medido en navegador | Reducido por secciones sin sombras y contenedor tecnico mas ancho | 165 kB | 165 kB | Pendiente | Pendiente | Migracion parcial |
| `/login` | Publica | Pantalla critica, no migrada en esta fase | 0 | Pendiente | Pendiente | 117 kB | 117 kB | Pendiente | Pendiente | Pendiente |
| Resto de 58 pantallas `page.tsx` | Mixta | Inventariadas por fuente, pendientes de fase posterior | 0 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

Estados permitidos usados: `Validada`, `Migracion parcial`, `Pendiente`.
