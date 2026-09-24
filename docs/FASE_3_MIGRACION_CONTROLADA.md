# Fase 3 — Migración controlada del motor nutricional

## Estado

Este documento define el gate de comparación legacy → motor nuevo. No activa el motor nuevo ni Capa 2.

## Criterio rector de suficiencia científica — versión operativa

**Objetivo:** construir un motor técnicamente coherente, trazable y defendible para una app de consumo; no construir un sistema de laboratorio ni prometer exactitud matemática que el dominio no permite.

### Qué se exige

1. **Trazabilidad suficiente:** cuando un dato alimenta una regla o una devolución relevante, debe existir una fuente identificable y una justificación de uso.
2. **Coherencia funcional:** unidades, identidad del alimento, preparación y dirección de la regla deben ser compatibles.
3. **No inventar:** ausencia de dato no equivale a cero; tampoco se rellenan valores por intuición para fabricar una falsa precisión.
4. **Proporcionalidad:** la profundidad de validación debe corresponder al riesgo de la función. Una observación general no necesita el mismo nivel de evidencia que una interacción cuantitativa.
5. **Lenguaje de producto:** la salida para el usuario será simple, humana y didáctica. La complejidad técnica queda detrás del motor.
6. **Blindaje operativo:** el sistema debe evitar presentar como certeza una inferencia que no puede sostener. Esto es un criterio técnico de producto y no constituye asesoramiento jurídico.

### Qué NO se exige

- No se exige exactitud de laboratorio.
- No se exige que las 14 variables estén completas para que una comida pueda producir una observación general.
- No se bloquea todo el motor por la ausencia de un nutriente que no participa en la regla que se quiere ejecutar.
- No se busca una falsa precisión decimal.
- No se transforma la app en una herramienta para científicos.

### Regla de bloqueo proporcional

**Se bloquea únicamente la función que carece del dato/evidencia necesaria para ejecutarse con coherencia.**

Por tanto:

- **Motor base / observación general:** puede operar con cobertura convencional suficiente para la observación concreta.
- **Interacción específica:** sólo se activa si están disponibles los campos que esa interacción necesita y su QA está habilitado.
- **Interacciones no validadas:** permanecen bloqueadas sin impedir el resto del motor.
- **Dato especializado faltante:** se declara como cobertura pendiente; no paraliza funciones que no dependan de ese dato.

Esto reemplaza la idea de “vector completo = todo o nada” por una arquitectura de **suficiencia por función**.

## Contrato de migración

1. **Legacy permanece como fuente de verdad de producción** mientras la comparación no cierre.
2. El motor nuevo dispone de una **interfaz ejecutable identificable** (api/motor-nutricional-shadow.js), protegida por MOTOR_NUTRICIONAL_SHADOW_TOKEN y consumible sólo desde QA/server.
3. Cada fixture debe registrar entrada, decisión legacy, decisión nueva, divergencia, explicación y aceptación/rechazo.
4. Una divergencia no explicada es **FAIL**, no ajuste silencioso.
5. estado_vector != completo impide usar ese vector para una **interacción que requiera ese vector completo**; no implica bloquear automáticamente observaciones generales.
6. estado_qa = bloqueada en una interacción impide su activación.
7. Free/Premium no se modifica durante esta etapa.
8. inicio.html queda fuera del alcance.
9. No se modifica main ni producción desde este gate.
10. La comparación debe separar **paridad de comportamiento** de **cobertura científica**. Una falta de cobertura no se contabiliza como defecto de paridad si no cambia una decisión que el motor pretende ejecutar.
11. Ninguna diferencia se “corrige” para hacer coincidir legacy y nuevo: primero se explica qué sistema está haciendo qué y por qué.

## Fixtures

tests/motor-nutricional-shadow.fixtures.js contiene los 10 casos QA actuales: pollo_papas, arroz_pollo, caballa_brocoli, brocoli_papa, guiso_lentejas, guiso_arroz, guiso_fideos, ravioles, empanadas, asado.

La suite exige simultáneamente MOTOR_NUTRICIONAL_ENGINE_URL, MOTOR_NUTRICIONAL_SHADOW_TOKEN y LEGACY_ENGINE_URL. Si falta cualquiera, el test falla cerrado y no declara comparación PASS.

## Gate de salida

El Paso 3 sólo puede cerrarse cuando legacy y nuevo sean ejecutables, los fixtures produzcan resultados comparables y toda divergencia quede explicada/aceptada.

**No es requisito para cerrar la migración que el catálogo nutricional alcance perfección científica.** Sí es requisito que cada función que se habilite tenga la cobertura mínima necesaria para ejecutarse de forma coherente y que las funciones que no la tengan permanezcan bloqueadas.

Los vectores incompletos y las interacciones bloqueadas continúan impidiendo únicamente las activaciones que dependan de ellos.

## Resultado actual

**INTERFAZ IMPLEMENTADA — COMPARACIÓN PENDIENTE DE EJECUCIÓN REAL.**

La interfaz nueva quedó instalada en la rama congelada. No se despliega a main ni modifica producción. La ejecución real de legacy ↔ nuevo requiere URLs/secretos de QA del entorno desplegado; la suite está diseñada para fallar cerrado si esos valores no existen.

## Decisión de esta iteración

La profundidad científica queda fijada como **proporcional al uso**. El proyecto no perseguirá “perfección de laboratorio” como condición de avance. El próximo gate debe concentrarse en demostrar comportamiento legacy ↔ nuevo y en identificar qué funciones concretas necesitan cobertura adicional, evitando bloquear funciones que no dependan de ella.
