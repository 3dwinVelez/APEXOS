# Brief — <título corto>

- **ID**: `<YYYY-MM-DD>-<slug>`
- **Fecha**: `<YYYY-MM-DD>`
- **Rama activa**: `<salida de git branch --show-current>`
- **Prompt crudo**: "<texto original del usuario, sin reescribir>"

## 1. Objetivo

<Qué resultado de negocio o técnico se busca, en 2-3 líneas. Verificable, no aspiracional.>

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A`/`M`/`D` | `<ruta verificada>` | <cambio concreto> |

### Módulos (`change_intent.modules`)

- `<modulo-en-kebab-case>`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- <Lo que no se toca y por qué. Refactors, módulos adyacentes, migraciones remotas.>

## 4. Restricciones

- Rama: solo `desarrollo`. Prohibido push, merge, deploy, migración remota, cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos.
- Sin secretos ni credenciales en el brief ni en el diff.

## 5. Criterios de aceptación

1. `<comando>` → <resultado esperado observable>
2. <Comportamiento funcional en UI/API, con el caso borde incluido.>

## 6. Evidencia y certificación exigida

- Pruebas: <suite o archivo de test concreto>
- Certificación: `<script de certificación>` con evidencia en `docs/qa/evidence/<cambio>/`
- `certification_status` esperado: `<local_passed_qa_pending | qa_approved>`

## 7. Capacidades protegidas

- `<capacidad>` — <cómo se certifica>

## 8. Riesgos y rollback

- Riesgo: <...> → Mitigación: <...> → Rollback: <revert del commit, no reset>

## 9. Supuestos y preguntas abiertas

- Supuesto: <...>
- Pregunta: <...> (solo si altera el alcance)

## 10. Autorizaciones requeridas

- [ ] <Autorización explícita pendiente, si aplica>
