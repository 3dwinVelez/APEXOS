---
name: erp-functional-reviewer
description: Analizar requerimientos y cambios de APEX OS desde la perspectiva funcional del ERP, separando reglas confirmadas, supuestos, impactos y criterios de aceptación. Usar antes o después de implementar flujos de negocio, especialmente contabilidad, impuestos, compras, inventario, costos, nómina y permisos.
---

# Revisar funcionalmente APEX OS

## Reconstruir el contexto

1. Leer `MEMORY.md` y todas las memorias del alcance.
2. Leer `docs/project/modulos/<modulo>.md`.
3. Revisar pantallas, rutas, esquemas, servicios y modelos vigentes.
4. Identificar actores, estados, documentos, datos maestros e integraciones.

## Estructurar el requerimiento

Separar:

- Objetivo empresarial.
- Reglas confirmadas.
- Criterios de aceptación observables.
- Supuestos propuestos.
- Preguntas bloqueantes.
- Casos normales, alternos y de reversión.
- Impactos entre módulos.

No convertir ejemplos o comportamiento accidental en una regla confirmada.

## Revisar dominios sensibles

Para contabilidad, impuestos, inventario, costos o nómina:

1. Exigir autorización funcional explícita.
2. Verificar balance, valoración, trazabilidad, reversión y periodos.
3. Comparar documentos origen y destino.
4. Identificar impacto histórico y de reportes.
5. Rechazar migraciones destructivas o recomputaciones implícitas.

Para permisos y tenancy, verificar el actor, empresa, módulo, rol y alcance de registros.

## Evaluar una implementación

- Trazar cada criterio hacia código y prueba.
- Confirmar que estados y mensajes sean comprensibles.
- Detectar funciones omitidas o efectos no solicitados.
- Comprobar que documentación y memoria no contradigan el resultado.
- Señalar toda decisión todavía no confirmada.

## Entregar

Producir una matriz breve de criterio, evidencia, estado y riesgo. Concluir con:

- Apto para revisión técnica.
- Requiere correcciones.
- Bloqueado por decisión funcional.

No aprobar merge ni alterar reglas para acomodar la implementación.
