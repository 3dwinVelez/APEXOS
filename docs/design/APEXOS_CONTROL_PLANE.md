# APEXOS Control Plane — Documento funcional de desarrollo

- **Versión**: 0.2
- **Fecha**: 2026-10-29
- **Rama**: `desarrollo`
- **Estado**: propuesta para revisión
- **Cambio respecto a 0.1**: se reordena el documento por dependencias reales y se sustituye el calendario por entregas articuladas ejecutadas en Qoder.

---

## 1. Resumen en una página

**Qué es.** Un plano de control que observa APEXOS de forma continua, traduce lo que ocurre a lenguaje funcional y prepara cambios con una compuerta de aprobación humana obligatoria.

**Qué resuelve.** Hoy el estado del proyecto está repartido entre consolas, logs y memoria. No hay una vista única, no hay aviso cuando algo cambia y no hay un registro de quién autorizó qué.

**Cómo se construye.** Todo el código lo produce Qoder de forma articulada: `apexos-brief` define el alcance, `equipo-apexos` despacha por disciplina, `apexos-qa` certifica y `apexos-git-guardian` custodia el alcance. Cada entrega termina en evidencia versionada; ninguna se promueve sin gate.

**Qué determina el avance.** No es el tiempo de escritura de código. Son la disponibilidad de accesos (sección 14) y las aprobaciones de cada entrega. Las seis decisiones de alcance quedaron cerradas el 2026-10-29 (sección 5).

**Orden de arranque.** Provisionar accesos → entregar E1 (ver el proyecto) → entregar E2 (bucle de tarea y aprobación) → el resto por demanda.

**Regla que no cambia.** Las pruebas en verde no autorizan nada. Aplicar un cambio requiere aprobación registrada; publicar y promover son un gate separado, siempre humano.

---

## 2. Problema y resultado esperado

### Problema

1. **Estado disperso**: salud, errores, colas, usuarios y avances de negocio viven en sistemas distintos y en lenguajes distintos.
2. **Sin señal proactiva**: nadie avisa cuando algo se degrada; se descubre por reporte de un usuario.
3. **Sin trazabilidad de decisiones**: no queda registro de qué se autorizó, quién y con qué evidencia.
4. **Preparación manual**: investigar, redactar alcance y ejecutar pruebas consume tiempo que no siempre está disponible.

### Resultado esperado

- Una sola pantalla que responde: *¿cómo está el proyecto, qué necesita atención y qué puedo hacer?*
- Un aviso accionable cuando algo cambia, con fuente y sugerencia.
- Un bucle repetible: tarea → brief → preparación → aprobación → aplicación interna → gate de publicación.
- Un libro de decisiones consultable.

---

## 3. Alcance

### Incluye

- Observación de proyecto, áreas e infraestructura.
- Avisos por consola y por Telegram.
- Bucle de tareas con brief y aprobación.
- Registro de decisiones y evidencia de cada cambio.
- Tres vistas de lectura: Dirección, Híbrida y Técnica.

### No incluye

- Modificación de código fuente sin aprobación.
- Push, merge, promoción o migración en nube.
- Recalcular indicadores de negocio: se consumen de sus módulos.
- Colector de marketing en la primera etapa.
- Sustituir a QA o a la política de aprobación vigente.

---

## 4. Principios

1. **Determinista antes que inteligente.** Las alertas salen de reglas con umbral. El modelo de lenguaje solo explica y propone sobre eventos de interés.
2. **La vista no cambia el permiso.** Dirección, Híbrida y Técnica muestran distinta densidad y autorizan lo mismo.
3. **Toda cifra tiene origen.** Sin fuente declarada, el dato se marca `sin datos`; no se estima.
4. **Git es la verdad.** La documentación y el código viven en el repositorio; la máquina del plano de control guarda cómputo y estado operativo.
5. **El aislamiento multi-tenant no se hereda.** Se lee por API o por vistas con tenant explícito, nunca con credenciales de servicio a pelo.
6. **Una entrega, una certificación.** No hay entrega "casi lista": o tiene evidencia y criterios cumplidos, o queda bloqueada y se declara.

---

## 5. Decisiones tomadas

Confirmadas el **2026-10-29**. E1 no tiene bloqueos de alcance.

| # | Decisión | Valor confirmado | Consecuencia |
|---|---|---|---|
| D1 | Ubicación del panel | Pantalla separada de dirección | No se modifica el dashboard de APEXOS en E1; el acceso reutiliza JWT y RBAC existentes |
| D2 | Vista por defecto según rol | Dirección → Híbrida; equipo → Técnica | La aceptación de E1 se prueba con ambos roles |
| D3 | Canal de aprobación | Consola autenticada primero; Telegram en E6 | E2 no depende de Bot API ni de webhook |
| D4 | Infraestructura | VM dedicada | Provisionar TLS, secretos y respaldos desde E0 |
| D5 | Almacenamiento de eventos | Esquema propio en la base actual | Migración local con aislamiento por tenant |
| D6 | Alcance de la primera entrega | E1 completo, los seis puntos | El brief de E1 cubre scrape, dashboards, presencia, crash handlers, canal vivo y pantalla |

Cambiar una de estas decisiones obliga a rehacer el brief de la entrega afectada. No se amplía ni se recorta el alcance en silencio.

---

## 6. Cómo se trabaja en Qoder

Cada entrega recorre el mismo bucle. No hay trabajo "fuera del bucle".

```
decisión aprobada
      │
      ▼
/apexos-brief ──────────────► docs/briefs/<fecha>-<slug>.md
      │                         (alcance A/M/D, criterios, evidencia)
      ▼
/equipo-apexos @brief ──────► despacho por disciplina
      │                         backend · db · frontend · seguridad · performance
      ▼
pruebas + certificación local ─► docs/qa/evidence/<entrega>/
      │
      ▼
TARJETA DE APROBACIÓN ───────► nunca se omite
      │
      ├── rechazo → no se aplica nada, brief conservado
      └── aprobación → aplicado en ambiente interno
                          │
                          ▼
                 gate de publicación (Nivel 2)
```

Reglas del bucle:

- Un brief por entrega. Si el alcance cambia, se reescribe el brief; no se amplía en silencio.
- El inventario `A/M/D` del brief es el mismo que alimenta el manifiesto de alcance.
- La certificación es local y versionada; las pruebas unitarias solas no cuentan.
- La aprobación es por cambio, con usuario, hora y huella del brief; caduca a las 72 horas.

**Sobre la duración.** No se expresa en semanas: el código lo produce Qoder. Se expresa en **tamaño relativo** (S/M/L) y en **dependencias**. Una entrega `S` ocupa una sesión de brief + ejecución + certificación; `M` puede requerir dos; `L`, tres. El calendario real lo consumen las decisiones, los accesos y las aprobaciones.

---

## 7. Experiencia y vistas

| Vista | Para quién | Qué muestra |
|---|---|---|
| Dirección | Edwin / dirección | Estado general, áreas, qué necesita atención, qué puede hacer |
| Híbrida (defecto) | Dirección con verificación | Lo anterior + fuente del dato en línea secundaria |
| Técnica | Equipo | Todo lo anterior + origen por evento, latencias, N0/N1/N2, inventario de archivos |

### Bloques

- **Estado general**: veredicto en una frase, hora y rama.
- **Servicios**: sistema, web, procesos en segundo plano, memoria rápida, base de datos, análisis.
- **Necesita tu atención**: máximo 5, por severidad, con *qué significa* y *qué puedes hacer*.
- **Áreas**: desarrollo, calidad, servidores, finanzas, transporte, talento humano, comercio, marketing (sin fuente).
- **Qué está pasando ahora**: flujo de eventos en lenguaje funcional.
- **Asistente**: conversación, enrutamiento y tarjetas de aprobación.
- **Cómo trabajo contigo**: N0/N1/N2 visibles de forma permanente.

---

## 8. Flujos funcionales

### 8.1 Observación → alerta

```
fuente → colector → estado del mundo → motor de reglas
                                          ├── sin hallazgo → se descarta
                                          └── hallazgo → evento de interés
                                                          ├── consola (SSE)
                                                          └── Telegram (si aplica)
```

Control de ruido: agrupación por área y ventana de 10 minutos; un incidente abierto actualiza su contador en lugar de generar avisos nuevos; silencio programable por área.

### 8.2 Tarea → brief → preparación → autorización

```
intake → clasificación de área
              ├── alcance ambiguo → brief con preguntas abiertas (no ejecuta)
              └── alcance claro    → brief → preparación → pruebas → certificación
                                              │
                                              ▼
                                    tarjeta de aprobación (siempre)
                                              ├── rechazo → nada se aplica
                                              └── aprobación → ambiente interno
                                                                    │
                                                                    ▼
                                                          gate de publicación
```

### 8.3 Incidencia → diagnóstico

Regla dispara incidente con evidencia; el asistente responde **qué pasó, a quién afectó, causa probable y propuesta**, citando la fuente. Sin cita, no hay hallazgo. El diagnóstico no toca código.

### 8.4 Aprobación

Se registra: quién, cuándo, brief y versión, inventario `A/M/D`, resultado de pruebas en ese momento. Una aprobación previa no autoriza el siguiente cambio.

---

## 9. Áreas y fuentes

| Área | Fuente real | Estado | Qué falta |
|---|---|---|---|
| Desarrollo | `git` | Existe | Consumo automatizado |
| Calidad | `scripts/certifications/`, `docs/qa/evidence/` | Existe | Índice por área |
| Servidores | `GET /health`, `GET /metrics`, healthchecks | Parcial | Prometheus scrapea `/health` |
| Finanzas | `apex-heart` sobre Prisma | Existe, batch | Frecuencia en vivo |
| Transporte | `transport` · monitoreo | Existe, 15 s | Consolidación |
| Talento Humano | `hr` | Existe | Métricas agregadas |
| Comercio | `comercio`, `sales`, `inventory` | Existe | Estado de publicación |
| Marketing | — | No existe | Colector propio |

Un área sin fuente se muestra como `sin datos`. Nunca con cifras estimadas.

---

## 10. Integraciones

| Sistema | Para qué | Mecanismo | Estado | Requisito |
|---|---|---|---|---|
| **Qoder** | Ejecutar entregas y redactar briefs | Skills + archivos de brief | Existe | Definir disparo por artefacto y sesión supervisada |
| **Telegram** | Avisos y aprobaciones remotas | Bot API + webhook HTTPS | **No existe** | Bot, token, chat autorizado, dominio con TLS |
| **Git local** | Estado, commits, worktrees | Comandos `git` | Existe | Respetar `AGENTS.md` |
| **GitHub** | Push y PR (con autorización) | `gh` / API | Existe (remote) | Token de permisos mínimos |
| **Railway** | Salud y despliegues | API / CLI | Parcial | Token de lectura |
| **Supabase / PostgreSQL** | Datos de negocio | Prisma / API | Existe | Rol con tenant explícito |
| **Redis** | Bus de eventos y colas | Streams + BullMQ | Existe | Retención definida |
| **Prometheus / Grafana** | Métricas y dashboards | Stack en `infra/` | Existe, sin dashboards | Corregir scrape |
| **Docker** | Salud de contenedores | Healthchecks | Existe local | Decidir socket (riesgo) |
| **Correo (IMAP)** | Canal alterno | Ya usado en ingesta | Existe | Bandeja de avisos |
| **WhatsApp** | Opcional | Proveedor externo | No existe | Evaluación posterior |

**Límite conocido de Qoder**: no hay API de ejecución headless documentada para este repositorio. La integración es por artefactos —brief, registro de tarea y evidencia— con ejecución en sesión supervisada. Automatizar la ejecución es una evaluación posterior, no un supuesto de este diseño.

---

## 11. Autonomía, seguridad y datos

### 11.1 Niveles

| Nivel | Puede | No puede | Registro |
|---|---|---|---|
| **N0** | Observar, agrupar, alertar, diagnosticar, escribir briefs | Modificar archivos | Evento y decisión |
| **N1** | Preparar en worktree, probar, certificar, presentar tarjeta | Aplicar sin aprobación | Aprobación con usuario y hora |
| **N2** | Nada automático | Push, merge, promoción, migración, secretos, infraestructura | Autorización separada |

Reglas: una aprobación N1 no habilita N2; caduca a las 72 horas; el agente no se aprueba a sí mismo; todo queda en el libro de decisiones.

### 11.2 Seguridad

- Secretos fuera del repositorio; nunca en briefs, logs ni Telegram.
- Lecturas por API o vistas con `tenant_id` explícito.
- Telegram: un solo chat autorizado y usuario mapeado; el bot rechaza el resto.
- Consola: reutiliza JWT y RBAC; el panel de dirección exige rol administrativo.
- Docker socket, si se monta, en un colector aislado del proceso que aprueba.

### 11.3 Datos

- **Evento canónico**: id, hora, área, severidad, tipo, mensaje funcional, mensaje técnico, fuente, evidencia, tenant, incidente.
- **Estado del mundo**: snapshot por área, con `sin_datos` explícito.
- **Libro de decisiones**: append-only con quién, cuándo, qué, brief, inventario, pruebas y commit local.

---

## 12. Arquitectura

```
┌──────────────────────────── VM / contenedores ────────────────────────────┐
│  colectores ──► bus de eventos ──► estado del mundo ──► motor de reglas   │
│        │                                │                     │          │
│        │                                ▼                     ▼          │
│        │                          notificador ─────────► fábrica         │
│        └──────────────► consola (SSE) ◄───────────────────────┘          │
│                              │                                            │
│                     libro de decisiones (append-only)                     │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────┬─────────────┐
        ▼                      ▼                  ▼             ▼
     Railway               Supabase            GitHub       Telegram
```

Separación: producción sigue en Railway/Supabase; el plano de control observa y prepara, nunca es ruta crítica de negocio.

---

## 13. Entregas

### 13.1 Mapa y dependencias

| Entrega | Objetivo | Depende de | Tamaño | Ejecuta |
|---|---|---|---|---|
| **E0** | Accesos y línea base | — | S | humano + `apexos-git-guardian` |
| **E1** | Ver el proyecto | E0 | M | `equipo-apexos` |
| **E2** | Bucle de tarea y aprobación | E0, E1 | M | `equipo-apexos` |
| **E3** | Avisos con criterio | E1 | M | `equipo-apexos` |
| **E4** | Áreas reales y estado del mundo | E1, E3 | L | `equipo-apexos` |
| **E5** | Asistencia sobre eventos de interés | E2, E3, E4 | M | `equipo-apexos` |
| **E6** | Aprobación remota y autonomía N1 medida | E2, E3 | S | `equipo-apexos` |

```
E0 ──► E1 ──┬──► E2 ──┬──► E6
            │          │
            └──► E3 ───┴──► E5
                  │
                  └──► E4 ──► E5
```

E2 y E3 son paralelizables después de E1. E5 requiere E2, E3 y E4. E6 puede diferirse sin bloquear nada.

### 13.2 E0 — Accesos y línea base

**Objetivo**: dejar el terreno listo sin escribir código.

D1–D6 quedaron cerradas el **2026-10-29** (sección 5). Pasos restantes: provisionar la VM con TLS, secretos y respaldos; crear el bot de Telegram y el chat autorizado; definir dueños de área y aprobadores; registrar la línea base (latencia, errores, usuarios) durante una semana; emitir tokens de Railway, GitHub y base de datos con permisos mínimos.

**Criterio de cierre**: accesos probados con una consulta real y línea base registrada.

**Evidencia**: `docs/design/` actualizado y registro de accesos en el gestor de secretos (sin valores en el repo).

### 13.3 E1 — Ver el proyecto

**Objetivo**: que el estado del proyecto sea visible y confiable.

Alcance mínimo:

1. Corregir `metrics_path: /metrics` en `infra/prometheus/prometheus.yml`.
2. Dashboards mínimos: salud, latencia, errores, colas.
3. Persistir presencia: actualizar `last_seen_at` y exponer sesiones activas.
4. Registrar `unhandledRejection` y `uncaughtException`.
5. Consumir `/brain/live` o exponer un canal SSE `/control/live`.
6. Primera pantalla con las tres vistas y datos de solo lectura.

**Criterios de aceptación**

- Un 500 aparece en la consola en menos de 10 s.
- Prometheus recolecta métricas reales; Grafana muestra latencia y errores.
- El número de usuarios activos coincide con las sesiones vigentes.
- Un proceso caído genera un evento visible sin intervención manual.
- Cada cifra muestra su fuente; lo no instrumentado aparece como `sin datos`.

**Evidencia**: certificación local + captura de dashboards + prueba de caída controlada.

### 13.4 E2 — Bucle de tarea y aprobación

**Objetivo**: probar el corazón del sistema: ninguna modificación sin autorización.

Alcance: intake por consola; conexión con `apexos-brief`; cola y máquina de estados `nueva → clasificada → preparada → pendiente_aprobacion → aprobada/rechazada → aplicada → pendiente_publicacion`; tarjeta de aprobación con las cuatro preguntas funcionales; registro con usuario, hora y huella del brief; caducidad de 72 horas.

**Criterios de aceptación**

- Toda tarea que toque código termina en tarjeta de aprobación, sin excepción.
- Un rechazo no modifica ningún archivo.
- La aprobación es auditable y no reutilizable.
- Una tarea ambigua produce brief con preguntas y no ejecuta.

**Evidencia**: certificación del flujo completo con un cambio real de bajo riesgo y su registro de decisión.

### 13.5 E3 — Avisos con criterio

**Objetivo**: que lo importante llegue sin ruido.

Alcance: tabla de eventos; bus sobre Redis Streams; motor de reglas con umbral y ventana por área; notificador Telegram con severidad mínima y silenciamiento; registro de avisos e incidentes.

**Criterios de aceptación**

- Severidad alta llega a Telegram en menos de 30 s.
- Un incidente repetido no genera más de un aviso nuevo por ventana.
- Silenciar un área no detiene la recolección.
- Cada aviso incluye fuente y acción sugerida.

**Evidencia**: simulación de incidente con captura del aviso y del registro.

### 13.6 E4 — Áreas reales y estado del mundo

**Objetivo**: que cada área tenga señal propia y verificable.

Alcance: colectores de finanzas (Apex Heart), transporte, talento humano y comercio; snapshot por área; estado de publicación de comercio; marca `sin_datos` donde falte fuente. Marketing queda fuera hasta tener colector.

**Criterios de aceptación**: cada área muestra dato con fuente y hora; ninguna área inventa cifras; el panel refleja el estado real de al menos tres áreas.

### 13.7 E5 — Asistencia sobre eventos de interés

**Objetivo**: explicar y proponer sin inventar.

Alcance: resúmenes por área; diagnóstico con evidencia citada; límite de afirmaciones sin fuente; presupuesto de uso por área y por día.

**Criterios de aceptación**: toda afirmación cita consulta o archivo; el costo se mantiene en presupuesto; el resumen diario se genera sin intervención.

### 13.8 E6 — Aprobación remota y autonomía N1 medida

**Objetivo**: aprobar desde Telegram y medir la autonomía real.

Alcance: aprobación desde Telegram con identidad verificada; métricas de avisos por día, tiempo evento→aviso, aprobaciones, rechazos y tareas completadas.

**Criterios de aceptación**: una aprobación remota queda registrada igual que una de consola; el panel muestra las métricas de autonomía; ninguna aprobación remota habilita N2.

---

## 14. Qué necesitamos

### Infraestructura
VM Linux LTS (4 vCPU, 8–16 GB RAM, 80 GB SSD) o el compose existente en equipo dedicado; Docker; HTTPS con dominio para el webhook; respaldo del libro de decisiones y de la tabla de eventos.

### Accesos
Bot de Telegram y chat autorizado; token Railway de lectura; token GitHub de permisos mínimos; credencial de base de datos con tenant explícito; `METRICS_AUTH_TOKEN` ya existente.

### Personas
Dueño por área; aprobador principal y suplente; responsable de guardia.

### Artefactos
Reglas por área con umbral y ventana; runbook por incidente conocido; matriz de permisos del agente; plantilla de brief (ya creada).

---

## 15. Riesgos

| Riesgo | Mitigación |
|---|---|
| Panel verde con sistema caído | `sin_datos` explícito y alerta si una fuente deja de reportar |
| Diagnóstico inventado | Cita obligatoria; sin cita no hay hallazgo |
| Fatiga de alertas | Agrupación, severidad mínima y silenciamiento |
| Fuga entre tenants | Lectura por API o vistas con tenant explícito |
| Autonomía excesiva | N0/N1/N2 y caducidad de aprobaciones |
| Dependencia del plano de control | No está en la ruta crítica de negocio |
| Costo de modelo | Reglas primero; presupuesto por área |

---

## 16. Definición de terminado

Una entrega está terminada cuando:

- cumple sus criterios de aceptación;
- tiene brief versionado en `docs/briefs/`;
- tiene pruebas y evidencia en `docs/qa/evidence/`;
- pasó la certificación local correspondiente;
- tiene manifiesto de alcance si aspira a promoción;
- registra en este documento cualquier cambio de alcance aprobado.

Ninguna entrega autoriza por sí misma el paso a `develop` o `main`: eso sigue el flujo `desarrollo → develop → main` con sus gates.
