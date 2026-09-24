# Fase 3 — Auditoría operativa del bloqueo de vectores

Fecha: 2026-09-24

## Objetivo

Ejecutar la recomendación operativa de cierre del paso 3 sin modificar `main`, producción ni activar Capa 2.

## Resultado

**Paso 3 sigue BLOQUEADO CONTROLADAMENTE.**

El bloqueo no está en la interfaz del motor nuevo ni en el acceso de las tablas. Está en la cobertura cuantitativa de los vectores QA de los cuatro arquetipos respaldados.

### Snapshot de los 4 arquetipos respaldados

| Fixture | Vectores completos | Vectores no completos | Estado |
|---|---:|---:|---|
| pollo_papas | 5/14 | 9/14 | BLOQUEADO |
| arroz_pollo | 6/14 | 8/14 | BLOQUEADO |
| caballa_brocoli | 4/14 | 10/14 | BLOQUEADO |
| brocoli_papa | 4/14 | 10/14 | BLOQUEADO |

En los cuatro fixtures aparecen estados `parcial` y/o `ausente`. No se interpretan como cero.

## Hallazgo técnico principal

La auditoría de composición muestra que la fuente primaria actualmente cargada (ARGENFOODS / Universidad Nacional de Luján) aporta datos para un subconjunto de los 14 nutrientes canónicos, pero no existe cobertura cargada suficiente para completar los vectores.

Entre los datos ausentes están, según fixture y componente, nutrientes necesarios para el contrato del motor y especialmente para Capa 2:

- hierro no hemo;
- oxalato;
- fitato;
- polifenoles totales;
- además de nutrientes convencionales faltantes en determinados alimentos/componentes.

No se deben fabricar valores, convertir ausencia en cero ni completar por inferencia.

## Evidencia de trazabilidad disponible

Los registros de composición existentes están asociados a fuente y trazabilidad. La fuente primaria nacional está activa y se encuentran además registradas fuentes fallback/contextuales:

1. ARGENFOODS / Universidad Nacional de Luján — primaria nacional.
2. SIFeGA / ANMAT — composición declarada de producto.
3. SARA 2 / ENNyS 2 — primaria nacional contextual.
4. LATINFOODS / FAO-INFOODS — fallback regional.
5. USDA FoodData Central FNDDS — fallback internacional.
6. USDA FoodData Central Foundation Foods — complementaria internacional.

La existencia de estas fuentes en el catálogo **no demuestra que los valores faltantes ya estén cargados ni autoriza a incorporarlos sin validación y trazabilidad**.

## Gate de regresión

El test `tests/motor-nutricional-shadow.test.js` está diseñado para fallar cerrado cuando:

- no existe una URL ejecutable verificable del motor nuevo;
- Capa 2 deja de estar bloqueada;
- existe cualquier vector no completo.

La base actual satisface el segundo punto, pero no el tercero. La ejecución completa contra secretos de runtime no se puede certificar desde este entorno sin inventar credenciales o exponer secretos.

## Decisión operativa

No se modifica `main` ni producción.

No se activa ninguna interacción de Capa 2.

No se amplía el corpus con los seis fixtures secundarios.

El siguiente trabajo válido es **cerrar la brecha de datos científicos de los cuatro arquetipos respaldados**, con fuente, unidad, trazabilidad y QA por nutriente. Una vez que los 56 vectores (4 × 14) estén en estado `completo`, se debe:

1. ejecutar la suite de regresión con runtime autorizado;
2. comparar legacy ↔ nuevo fixture por fixture;
3. clasificar cada divergencia como explicada/aceptada o FAIL;
4. verificar que Free/Premium conserve el contrato vigente;
5. repetir el shadow completo de los 10 fixtures;
6. recién entonces evaluar el gate de cierre del paso 3.

## Criterio de cierre del bloqueo

No es suficiente aumentar el número de filas. El gate exige que cada vector requerido por los cuatro arquetipos esté respaldado por datos válidos y trazables, sin convertir ausencia en cero y sin activar Capa 2 mientras sus cinco interacciones continúen `bloqueadas`.
