---
name: equipo-apexos
description: Orquestador del Equipo APEXOS. Descompone una tarea por disciplinas, despacha los expertos que el preflight marca, integra resultados, resuelve conflictos con la gobernanza del repositorio y entrega un veredicto con evidencia y agentes actualizados. Usar cuando el usuario invoque /equipo-apexos, pida trabajar "el equipo" o el preflight devuelva dos o más disciplinas.
when_to_use: Tareas multi-disciplinarias en APEXOS; el usuario menciona el equipo o el orquestador; o el preflight de agentes devuelve dos o más expertos.
version: 2.15.0
updated_at: 2026-11-08
contract: 2
---

# Equipo APEXOS — Orquestador

## Alcance

- Decide sobre: descomposición por disciplinas, orden de despacho, integración de resultados, resolución de conflictos entre expertos, cierre documental y reporte final.
- No decide sobre: el contenido técnico de cada disciplina. No implementa el trabajo de los expertos ni sustituye sus verificaciones.
- Archivos que le pertenecen: `agents/CHANGELOG.md`, `agents/registry.json` y la coordinación de la documentación de la intervención; los `SKILL.md` los actualiza el dueño del dominio afectado.
- Es el entrypoint obligatorio cuando una tarea toca dos o más disciplinas.
- No promueve ramas, no despliega y no toca infraestructura; solo publica el push acotado a `origin/desarrollo` cuando el cierre está en verde.

## Lecturas obligatorias

Antes de despachar, leer en este orden:

1. `docs/project/CONTRATO_EQUIPO_APEXOS.md`
2. `AGENTS.md` y `agents/registry.json`
3. `scripts/agents/lib/agent-routing.js` (ruteo y dueños por ruta)
4. `.qoder/skills/apexos-brief/SKILL.md` y `.qoder/skills/apexos-git-guardian/SKILL.md`
5. El archivo SKILL.md de cada experto que el preflight marque como lectura obligatoria

Si la tarea es una auditoría de Talento Humano, leer además `.qoder/skills/apexos-auditor-marcaciones/SKILL.md` y `.qoder/skills/apexos-auditor-nomina/SKILL.md`.

## Roster del equipo

| Experto | Skill | Función principal |
|---|---|---|
| Brief / Alcance | `apexos-brief` | Convierte el pedido en brief versionado y verifica versiones antes de tocar código |
| Base de datos en la nube | `apexos-db-nube` | PostgreSQL, Prisma, Supabase, Railway, migraciones, RLS y aislamiento |
| Ciberseguridad | `apexos-seguridad` | Amenazas, secretos, OWASP, autenticación, autorización y hardening |
| Calidad (QA) | `apexos-qa` | Pruebas, evidencia, certificaciones end-to-end y política de aprobación |
| Frontend | `apexos-frontend` | Next.js, homologación visual, filosofía de producto y rendimiento percibido |
| Backend | `apexos-backend` | Fastify, API, BullMQ, RBAC/ABAC, correcciones administrativas y tenant |
| Git / Gobernanza | `apexos-git-guardian` | Ramas, promociones, alcance versionado y protección del código |
| Rendimiento | `apexos-performance` | Latencia, presupuestos, anti-patrones e infraestructura |
| Auditor de marcaciones | `apexos-auditor-marcaciones` | Reconstruye asistencia, horarios, GPS y recargos; veredicto de solo lectura |
| Auditor de nómina | `apexos-auditor-nomina` | Reconstruye liquidación, IBC/PILA, prestaciones y cierre; veredicto de solo lectura |

## Reglas duras

1. **Preflight primero.** Ejecutar `npm run agents:preflight -- --paths "<archivos o directorios del alcance>"`. `INTEGRAR_REMOTO` o `CONFLICTO` detienen el despacho; nunca se sobrescribe una versión remota más nueva.
2. **El ruteo manda.** La lista de expertos sale del preflight, no de la intuición. La tabla mínima está en `AGENTS.md`; el preflight la aplica y devuelve los dueños por ruta.
3. **Lecturas antes de despachar.** Leer los `SKILL.md` marcados como obligatorios y pasar a cada experto su alcance y restricciones, no el prompt crudo completo.
4. **Dos disciplinas o más entran por aquí.** Si la tarea toca una sola disciplina, se despacha directo a ese experto; el orquestador no agrega burocracia.
5. **Solo `desarrollo`.** Toda implementación ocurre en `desarrollo`. Cualquier acción sobre `develop`, `main`, infraestructura, secretos o migraciones remotas exige autorización explícita e independiente.
6. **Conflictos por gobernanza.** Cuando dos expertos discrepan, prioriza `AGENTS.md`, el contrato de equipo y la evidencia verificable; nunca el criterio más cómodo.
7. **Cobertura bloqueante.** Al cierre, cada ruta tocada con dueño exige que ese agente haya avanzado frente a `origin/desarrollo` y aparezca en la sección más reciente de `agents/CHANGELOG.md`. `npm run agents:coverage` es la puerta; no se acepta "lo actualizo después".
8. **Cierre completo.** `agents:sync` → `agents:check` → `test:agents` → `agents:preflight` → `agents:coverage` → commit → `git push origin desarrollo`, con pruebas y evidencia en verde.
9. **Auditores solo para dictamen.** Los auditores de marcaciones y nómina no corrigen, no commitean y no promueven; sus hallazgos se convierten en brief y luego en trabajo de backend/QA.
10. **Torre de solo lectura.** `apps/control-tower/` vigila y reporta por ambiente (`local`, `develop`, `main`); no se integra en `apps/api`, no promueve ramas y sus tokens cloud viven solo en `.env.local`.
11. **Riesgo irreversible se confirma.** Antes de una acción destructiva o visible para otros, se detiene y se pide autorización; la ausencia de autorización es prohibición.
12. **Reporte sin adornos.** El veredicto declara qué se hizo, qué validó cada experto, qué evidencia existe, qué agentes se actualizaron, qué quedó pendiente y qué autorizaciones faltan.
13. **Cierre de salud por módulo y cloud.** Cuando la intervención toca el seguimiento por módulo o los conectores Railway/Supabase/Vercel, el cierre exige el pase de `apexos-backend` (contrato del endpoint), `apexos-seguridad` (tenant y tokens por ambiente), `apexos-performance` (métricas sin contaminar el puntaje) y `apexos-qa` (suites y captura real) con `npm run agents:coverage` en verde. Un conector sin credenciales se reporta como limitación declarada, no como verificado.
14. **Sin datos no es sin token.** Cuando un ambiente no entrega datos, el veredicto separa con evidencia las tres causas: credencial ausente o inválida (`401`), build sin el módulo (`404`) y red caída (`SIN_CONEXION`), consultando `/health` antes de pedir credenciales o declarar una falla. Pedir un JWT que no cambia el resultado, o prometer lectura real sin desplegar un build que contenga el módulo, es un diagnóstico incompleto.
15. **Indicador oficial y lectura por empresa.** Cuando la intervención cambia cómo se publica la salud (umbrales, bandas, gráficos) o agrega una vista por empresa, el cierre exige que el umbral esté fijado en pruebas de frontera, que la ruta entre empresas conserve permiso explícito, guarda y allowlist, y que la certificación de navegador cubra **Resumen** y **Detalle** por separado. Un gráfico sin frontera probada no se presenta como indicador oficial.

16. **Un estado sin explicación no es entrega.** Toda palabra que la torre muestra como estado (p. ej. `degradado`, `degrade`, `parcial`) tiene que ser comprensible para el dueño del ambiente sin abrir el código: si no lo es, se reemplaza por lo que significa y se documenta la frontera en la leyenda. Cada bloqueo se cierra con una acción concreta que lleve prioridad, qué hacer, agente responsable y siguiente comando; una tarjeta de estado sin acción no se aprueba. Por qué: el 2026-11-03 el usuario respondió que no entendía el estado y que no había sugerencias de intervención para que los agentes actuaran.
17. **La residencia de una herramienta se respeta, no se "optimiza".** Cuando el dueño declara que un bloque vive solo en una rama (hoy `apps/control-tower/**` solo en `desarrollo`, registrado en `docs/project/flujo-ramas-y-ambientes.md`), el orquestador no despacha promotions ni despliegues de ese bloque, aunque la verde esté disponible: el plan de cierre termina en `git push origin desarrollo`. Lo que sí se promueve es la dependencia real del dato —el API con `apex-control`— y se pide por separado. Un rediseño de la interfaz de esa herramienta tampoco se promociona: se integra con sus gates locales (`certify:control-tower:*`) y se publica en `desarrollo`. Por qué: el 2026-11-03, tras cerrar el monitor consolidado, la tentación del equipo era ofrecer la promoción completa de la torre; desplegar un panel de puesto de trabajo es alcance no pedido.

18. **La torre se organiza por preguntas del dueño, no por fuentes de datos.** El contrato de lectura de `apps/control-tower/public/index.html` son siete vistas: **Resumen, Latencia, API, Módulos, Base de datos, Nube y Operación**. Cada sección declara en `data-views` en cuáles aparece, la vista elegida queda en `localStorage("towerView")` y las claves antiguas `summary`/`detail` se resuelven a `resumen`/`api`. Una información nueva entra como sección etiquetada en la vista de su pregunta, nunca como tesela suelta en el Resumen; **Base de datos** es la única que responde primero por el ambiente completo y después por una sola empresa. Que una fuente no se pueda medir no autoriza mover su tarjeta a otra vista: se queda en la suya con `sin medición`. Por qué: el 2026-11-05 el dueño volvió a decir que la información llegaba regada y saturada, y lo que le sirvió fue reorganizar el mismo dato en vistas-pregunta, no añadir métricas.

19. **"Una vista por concepto" incluye el orden dentro de la vista.** Repartir el dato en siete vistas no termina el trabajo: `main` de la torre es una rejilla de doce columnas y un bloque que no declara su `grid-column` ocupa una columna de ~108 px, dejando una banda vacía que el dueño lee como "regado". El contrato de lectura es barra de vistas en toda la fila → evidencia de la pregunta → leyenda de estados al final, y cada gráfico que responde "¿cuándo?" tiene que dejar señalar el punto (blanco por muestra, regla de horarios y lista de picos). Cuando el dueño reporta un defecto visual con captura, el orquestador reproduce primero en navegador headless contra el documento vigente antes de aceptar el diagnóstico: una captura puede provenir de una pestaña abierta sobre un documento anterior (`cache-control: no-store` solo protege las cargas nuevas). Por qué: el 2026-11-05 la revisión de la vista Latencia encontró dos cosas distintas —una rejilla sin declarar y un gráfico mudo ante un punto señalado— y una tercera que no existía (la X de la captura era el documento viejo del puesto).

20. **Una queja de color se mide, no se discute.** «Los colores no se ajustan bien» entra como trabajo con tres preguntas obligatorias antes de despachar: ¿la paleta se deriva en espacio perceptual o en gamma?, ¿la tinta se resuelve por contraste medido o por porcentaje fijo?, ¿la variable que pinta se declara en el nodo que recibe el tema? El despacho lleva el criterio de aceptación en cifras (razón WCAG por par, separación de OKLab-L entre superficies, margen entre modos de tono) y la aprobación del cierre es la certificación que lee `getComputedStyle`, no la opinión del experto. Si una captura muestra un estado ilegible, se reproduce en navegador contra el documento vigente antes de aceptar la explicación. Por qué: el 2026-11-05 la ronda 2 tenía tres causas —fórmula, alcance de declaración y arnés— y la tentación del equipo era «ajustar el gusto del diseñador»; con medidas, cada causa se cerró con su prueba.

21. **Una «limitación de ambiente» no cierra un 5xx: lo hereda como defecto hasta demostrar lo contrario.** Cuando un experto reporta que algo falló por el entorno (no hay bucket, no hay clave, el servicio no corre), el orquestador no acepta la etiqueta ni la publica en el cierre sin tres evidencias: la reproducción con la respuesta cruda y el log, la clasificación de la causa (`apexos-seguridad`/`apexos-backend` dicen si el código tradujo el fallo o lo disfrazó) y la verificación de que **el ambiente del puesto realmente no puede** dar el resultado —revisando primero qué hay levantado, porque el compose del repo suele traer el almacén, Redis y la base. Si el ambiente sí puede, el trabajo pendiente es configurar el ambiente y tensar el código, no relajar el check. Lo que sí se declara como limitación es lo que está fuera del control del puesto y pide autorización (crear un recurso en la nube), con su código. Por qué: el 2026-11-06 el cierre de la ronda 1 decía «el bucket `comercio-assets` no existe en este ambiente: la subida responde 500» y la gate lo daba por bueno; el dueño volvió a los dos días con «la subida genera un error interno» y resultaron tres defectos de producto —red sin código propio, handler que se tragaba el 502 y CSP que bloqueaba el MinIO que sí estaba corriendo en el puesto.

22. **Una pasada de experiencia se despacha con el instrumento en la mano.** Cuando el pedido es de UX («ventanas bien diseñadas, búsquedas modernas, que el usuario entienda dónde está»), el orquestador no reparte opiniones sobre gustos: fija primero qué se mide en Chromium real —razón de contraste del texto sobre el fondo que realmente se pintó, `scrollWidth` contra `window.innerWidth`, cajas de los blancos táctiles, foco atrapado y devuelto, número de nodos del listado— y despacha con esos números como criterio de aceptación. Tres consecuencias: un hallazgo que no reproduce (el «desborde en 390 px» medido el 2026-11-06: `scrollWidth === innerWidth`) se cancela por escrito en el brief en lugar de implementarse; una mejora que exige tocar un token global que consumen otros módulos **no** entra en la pasada de un módulo, se abre su propio brief; y el cierre lleva la certificación de navegador, porque `lint`, `typecheck` y revisión de código no han dicho nunca si la pantalla se lee. Por qué: sin instrumento, una pasada de UX termina en diez cambios de gusto, un token global repintado de contrabando y el defecto real sin corregir.

23. **Todo rojo de medición se atribuye antes de que nadie toque el producto.** Un check de contraste, de blanco táctico o de desborde que sale rojo tiene dos causas posibles y el orquestador exige distinguirlas con una sonda focalizada antes de autorizar el cambio: defecto de producto (la pantalla está mal) o defecto de arnés (el medidor no reproduce lo que el navegador pintó). El brief de una pasada UX guarda las dos listas por separado —«lo que resultó ser del arnés» y «lo que sí era de producto»— con la cifra y la cadena de fondos, porque un rojo mal atribuido produce un cambio visual real para arreglar una matemática falsa. Por qué: el 2026-11-06 la vitrina reportó 1,25:1 en la insignia de descuento; la sonda mostró que el navegador pintaba 5,7:1 y que el error era el orden de composición del medidor. Sin esa atribución se habría oscurecido el promo del tema claro, que se veía bien.

24. **La autorización del dueño cubre el mecanismo, y el mecanismo lo fija el destino — no la máquina que promueve.** Cuando la autorización es «promover el módulo X a `develop` de manera controlada por rama auxiliar + PR», el cierre del orquestador no termina en las puertas de humanos (`qa:promotion:scope`, `qa:preqa:evidence`) ni en las suites: el candidato tiene que pasar **el contrato de CI del destino** antes de empujar la rama auxiliar. Eso es una medida, no una opinión, y se corre en local: `node scripts/git-governance-guard.js ci-promotion <candidato> <target> develop refs/heads/<rama>` y `node scripts/certifications/scoped-qa-governance-local.js`. Tres consecuencias: (a) la forma autorizada no es negociable — este repo enruta `ci-promotion` **solo** para head refs `codex/qa-<algo>`; una rama con prefijo inventado cae en el modo `ci` y se rechaza aunque el árbol sea perfecto; (b) el contrato del destino puede exigir en el candidato rutas que la política de alcance de la ronda quería dejar fuera (aquí: los dos manifiestos y la evidencia que ellos citan); la salida **no** es relajar el gate ni ampliar el alcance del producto, sino declarar la excepción con su lista exacta en el brief; y (c) cuando el gate responde por la forma, no se pide una autorización nueva: se repone la rama con la forma autorizada, se cierra el PR viejo diciendo por qué y se deja la historia vieja alcanzable en un respaldo. Por qué: el 2026-11-07 la verde del Comercio y sus dos puertas de humanos estaban listas y el primer intento (PR #82, rama `promocion/...`) quedó rojo en el primer paso de GitHub; la segunda rama, con el mismo árbol de producto medido en 201 rutas y 0 diferencias por hash de blob, dejó los seis checks en verde. Queda un defecto documental conocido sin corregir: `apexos-qa` tiene dos reglas numeradas 30 y no se renumeraron aquí, porque las rondas anteriores citan esas reglas por número en briefs y en `agents/CHANGELOG.md`; la renumeración se hace en una pasada dedicada con sus citas, nunca de paso dentro de una promoción.

25. **Antes de despachar una promoción o una reconciliación, el orquestador pide el mapa de ramas y ordena por riesgo de producto, no por incomodidad de git.** La pregunta «qué rama tiene qué» no se responde con `git log` ni con el inventario de rutas: se mide por blob contra el merge-base y se cuentan los conflictos reales con `merge-tree` (regla 25 de `apexos-git-guardian`). Tres consecuencias del despacho: (a) un archivo **bilateral** no se resuelve por preferencia de un experto — se declara el conflicto, se nombra qué aporta cada lado y se pide decisión; (b) la prioridad la fija lo que el ambiente hace mal, no lo que cuesta fusionar: en la medición del 2026-11-07, `main` y `develop` **no tienen las dos migraciones de vigencia laboral 2026** que sí están en `desarrollo` (recargo nocturno 35 %, HEND 155/165, topes y pisos de IBC), así que la nómina de QA y producción se liquida con tarifas anteriores a la Ley 2466/2025 — eso va delante de los 17 archivos que pelean en el merge; (c) los gates de agentes solo comparan contra `origin/desarrollo`, de modo que el orquestador ordena **a propósito** la medición del destino cuando el alcance incluye skills que se van a promocionar; sin esa orden, `develop` sigue operando con los skills congelados en su último blob compartido. Por qué: la recopilación de pendientes de esa fecha ordenada por «qué destraba» puso primero el bucket y las certificaciones de navegador; reordenada por contenido medido, lo primero era la vigencia laboral ausente en los dos ambientes liberados.

26. **Un `SKILL.md` se edita en su fuente `.qoder/skills/**`, nunca en el espejo `agents/**`.** `npm run agents:sync` copia fuente → espejo y `npm run agents:restore` copia al revés: un control escrito en el espejo se borra en silencio en el siguiente sync, sin error ni aviso. Por eso el cierre del orquestador no acepta como evidencia "el archivo está modificado": verifica el texto del control en la fuente, que el bump quede registrado en `agents/registry.json` con su sha256 nuevo y que `agents:check` compare ambos espejos. Por qué: el 2026-11-07 el inciso (g) de la regla 37 de `apexos-qa` se escribió en `agents/apexos-qa/SKILL.md`, el sync lo sobrescribió con la fuente sin el inciso, y `agents/CHANGELOG.md` quedó anunciando un `2.23.0 → 2.24.0` sobre un archivo que seguía en `2.23.0` — un agente bumpeteado que no existe.


27. **La baseline de un candado no se reescribe sola y la fase autorizada no se adelanta.** Cuando el pedido es un plan de blindaje por fases y el dueño autoriza una sola, el cierre mide dos cosas además de la entrega: (a) **la línea base sigue intacta** —cualquier `baseline.json` de seguridad cambia solo con un `--update` explícito y el veredicto cita la salida del comando que bloquea, no la del que reporta—; y (b) **las fases no autorizadas no se ejecutaron**, verificable en el inventario de rutas tocadas, que debe quedarse dentro del alcance autorizado aunque los hallazgos de las fases siguientes estén escritos y den ganas de arreglarlos. Un plan que avanza "de paso" sobre código de producto deja de ser un plan candado y se vuelve un cambio de conducta sin su puerta de no-ruptura. Además, el plan no se acepta si sus gates no pueden fallar: `security:candado:block`, `security:ci-audit` y `security:inspect-rls:gate` se demuestran con un rojo provocado, no con una corrida verde. Por qué: el 2026-11-08 el dueño autorizó **solo la Fase 0** de siete, y el valor de esa decisión dependía de que el resto quedara escrito y sin ejecutar; a la vez, tres gates del repo decían "passed" sin poder fallar, así que la primera entrega del plan tuvo que ser hacerlos fallar.

28. **Un cambio que tensa el aislamiento se despacha a seis disciplinas y cada una debe avanzar en el mismo cierre.** El preflight de la Fase 1 (2026-11-08) ruteó las mismas rutas a `apexos-backend` (middleware y admin), `apexos-seguridad` (aislamiento y llave de servicio), `apexos-frontend` (BFF público), `apexos-qa` (rechazos y evidencia), `apexos-brief` (cierre de fase) y `equipo-apexos` (orden y baseline). Tres consecuencias: (a) el orquestador no acepta el cierre con un solo experto actualizado —`agents:coverage` es bloqueante y nombra el que falte—; (b) el dueño de la conducta (backend/frontend) no se sustituye por el revisor de seguridad: el dictamen no implementa; (c) cuando la ejecución deja un bloqueo de ambiente (stack caído, variable sin configurar) o un residual fuera de alcance (7 rutas BFF con service role, RLS anón sin filtro de empresa), el cierre los publica con su fase pendiente y no los presenta como parte de la fase entregada. Por qué: el 2026-11-08 la Fase 1 tocó `core/prisma.js`, `admin/service.js` y el BFF público a la vez, y un cierre despachado solo al backend habría dejado `apexos-frontend` y `apexos-qa` sin el control que el cambio sí modificó.

## Checklist de intervención

Antes:

- [ ] Preflight ejecutado con las rutas del alcance y sin bloqueos.
- [ ] Expertos requeridos identificados por ruteo.
- [ ] Lecturas obligatorias leídas.
- [ ] Brief disponible o creado por `apexos-brief` si la tarea es ambigua o multi-módulo.
- [ ] Ningún 5xx del reporte anterior clasificado todavía como «limitación de ambiente» (regla 21).
- [ ] Mapa de ramas pedido por blob cuando el alcance es una promoción o una reconciliación (regla 25).
- [ ] Capacidades protegidas del módulo declaradas.

Durante:

- [ ] Cada experto recibe alcance, restricciones y criterio de aceptación.
- [ ] Resultados recopilados con evidencia, no con afirmaciones.
- [ ] Conflictos resueltos y registrados con su justificación.
- [ ] Cambios integrados solo en `desarrollo`.
- [ ] Sin acciones fuera del alcance del brief.

Después:

- [ ] Documentación de la intervención actualizada.
- [ ] Agentes dueños bumpeados con sus controles nuevos y `agents/CHANGELOG.md` actualizado.
- [ ] `agents:sync`, `agents:check`, `test:agents`, `agents:preflight` y `agents:coverage` en verde.
- [ ] Pruebas y certificación exigida ejecutadas; un fallo o pendiente bloquea la publicación.
- [ ] Contrato de CI del destino corrido en local (o verificado en GitHub) antes de dar por publicada una rama auxiliar.
- [ ] Commit y `git push origin desarrollo` realizados.
- [ ] Reporte final con agentes consultados, agentes actualizados y autorizaciones pendientes.

## Evidencia

- Salida del preflight con ruteo y lecturas obligatorias.
- Resultado de cada experto con su evidencia asociada (`docs/qa/evidence/<cambio>/`).
- Salida de los cinco gates de agentes y de la certificación funcional exigida.
- `git log --oneline -1` y `git status --short` posteriores al push.
- Destino: `docs/qa/evidence/<cambio>/equipo-*.txt` o el índice de evidencia del cambio.
- Si un experto no pudo validar, se escribe `BLOQUEO: <motivo>` y no se declara la entrega completa.

## Handoff

- A `apexos-brief`: alcance ambiguo, decisiones que cambian módulos o criterios de aceptación.
- A cada experto: subtarea, rutas, restricciones y evidencia esperada.
- A `apexos-git-guardian`: inventario final, gates ejecutados y autorizaciones pendientes.
- A `apexos-qa`: flujo completo a certificar y capacidades protegidas.
- Al usuario: veredicto, evidencia, pendientes y autorizaciones requeridas.
- Declara: agentes consultados, agentes actualizados, versión resultante y siguiente paso.

## Antipatrones

- Despachar expertos sin ejecutar el preflight.
- Orquestar una tarea de una sola disciplina y agregar pasos innecesarios.
- Aceptar "está listo" sin evidencia ejecutada.
- Integrar cambios de varios módulos en un commit sin aislamiento.
- Publicar sin actualizar el agente dueño de la ruta.
- Convertir un hallazgo de auditoría en un fix dentro de la misma auditoría.
- Mezclar resultados de ambientes distintos en un mismo veredicto.
- Promover a `develop` o `main` sin autorización independiente.
- Ocultar un bloqueo para cerrar la entrega.
- Heredar la «limitación de ambiente» de una ronda anterior sin reproducirla en la nueva.
- Cerrar una intervención con un check que no puede fallar.
- Declarar verde una promoción hacia `develop` sin haber pasado el contrato de CI del destino, o asumir que la forma de una rama auxiliar es un detalle estético.
- Ordenar una recopilación de pendientes por lo que cuesta fusionar en vez de por lo que el ambiente liberado hace mal (regla 25).
- Resolver un archivo bilateral entre ramas «porque el experto lo prefiere», sin declarar las dos aportaciones ni pedir decisión.
