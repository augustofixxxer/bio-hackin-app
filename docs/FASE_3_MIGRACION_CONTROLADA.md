# Fase 3 — Migración controlada del motor nutricional

## Estado

Este documento define el gate de comparación legacy → motor nuevo. No activa el motor nuevo ni Capa 2.

## Contrato de migración

1. **Legacy permanece como fuente de verdad de producción** mientras la comparación no cierre.
2. El motor nuevo dispone de una **interfaz ejecutable identificable**: `api/motor-nutricional-shadow.js`, protegida por `MOTOR_NUTRICIONAL_SHADOW_TOKEN` y consumible sólo desde QA/server.
3. Cada fixture debe registrar entrada, decisión legacy, decisión nueva, divergencia, explicación y aceptación/rechazo.
4. Una divergencia no explicada es **FAIL**, no ajuste silencioso.
5. `estado_vector != completo` impide usar ese vector para una interacción.
6. `estado_qa = bloqueada` en una interacción impide su activación.
7. Free/Premium no se modifica durante esta etapa.
8. `inicio.html` queda fuera del alcance.
9. No se modifica `main` ni producción desde este gate.

## Fixtures

`tests/motor-nutricional-shadow.fixtures.js` contiene los 10 casos QA actuales: `pollo_papas`, `arroz_pollo`, `caballa_brocoli`, `brocoli_papa`, `guiso_lentejas`, `guiso_arroz`, `guiso_fideos`, `ravioles`, `empanadas`, `asado`.

La suite exige simultáneamente `MOTOR_NUTRICIONAL_ENGINE_URL`, `MOTOR_NUTRICIONAL_SHADOW_TOKEN` y `LEGACY_ENGINE_URL`. Si falta cualquiera, el test falla cerrado y no declara comparación PASS.

## Gate de salida

El Paso 3 sólo puede cerrarse cuando legacy y nuevo sean ejecutables, los fixtures produzcan resultados comparables y toda divergencia quede explicada/aceptada. Los vectores incompletos y las interacciones bloqueadas continúan impidiendo activación.

## Resultado actual

**INTERFAZ IMPLEMENTADA — COMPARACIÓN PENDIENTE DE EJECUCIÓN REAL.**

La interfaz nueva quedó instalada en la rama congelada. No se despliega a `main` ni modifica producción. La ejecución real de legacy ↔ nuevo requiere URLs/secretos de QA del entorno desplegado; la suite está diseñada para fallar cerrado si esos valores no existen.
