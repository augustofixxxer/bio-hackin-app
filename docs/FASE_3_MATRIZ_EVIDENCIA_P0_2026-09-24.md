# FASE 3 — Matriz de evidencia científica P0
Fecha: 2026-09-24
Rama: fase-3-baseline-congelado-4963e769
Estado: trabajo científico en rama congelada; sin cambios de producción.

## 1. Objetivo
Resolver las 56 celdas vectoriales de los 4 arquetipos base (4 x 14 nutrientes) mediante evidencia trazable. Esta matriz NO autoriza activar Capa 2 ni reemplazar Legacy.

Regla operativa: ausencia de dato != cero. Un valor solo puede pasar a composición/vector si existe correspondencia suficiente de alimento + preparación + unidad + fuente y el dato es reproducible/trazable. Los nutrientes especializados no se completan por inferencia.

## 2. Universo canónico
Nutrientes:
calcium_mg, carbohydrate_g, energy_kcal, fat_g, fiber_g, iron_heme_mg,
iron_nonheme_mg, iron_total_mg, oxalate_mg, phytate_mg, polyphenols_mg,
protein_g, sodium_mg, vitamin_c_mg.

Arquetipos y preparación:
- pollo_papas: pollo 225 g asado al horno + papa 225 g hervida.
- arroz_pollo: arroz blanco 300 g hervido + pollo 150 g asado al horno.
- caballa_brocoli: caballa 245.4545 g fresca cruda + brócoli 204.5455 g fresco crudo.
- brocoli_papa: papa 270 g hervida + brócoli 180 g fresco crudo.

## 3. Matriz de las 56 celdas
Leyenda: C=completo actual; P=parcial; A=ausente. "Objetivo" indica qué debe aportar la evidencia para convertir la celda en C.

| Arquetipo | Ca | Carb | Energía | Grasa | Fibra | Fe-hemo | Fe-no-hemo | Fe-total | Oxalato | Fitato | Polifenoles | Proteína | Sodio | Vit C |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pollo_papas | C | P | C | P | A | A | A | C | A | A | A | C | C | P |
| arroz_pollo | C | P | C | C | P | A | A | C | A | A | A | C | C | A |
| caballa_brocoli | A | C | C | C | A | A | A | A | A | A | A | C | A | P |
| brocoli_papa | P | C | C | P | A | A | A | P | A | A | A | C | P | C |

## 4. Lectura científica de la matriz
### Datos convencionales ya respaldados en la base
- ARGENFOODS / Universidad Nacional de Luján es la fuente primaria nacional actualmente usada para los valores cargados.
- Las preparaciones almacenadas son específicas y deben conservarse: hervido, asado al horno, fresca cruda/fresco crudo.
- No se debe sustituir una preparación por otra solo porque el alimento coincida.

### Gaps prioritarios
1. Hierro hemo y no hemo: requiere fuente que reporte fraccionamiento hemo/no-hemo para el alimento/preparación correspondiente. El hierro total existente no permite descomponerlo algebraicamente.
2. Oxalato: requiere dato analítico compatible con alimento y estado/preparación. No usar valores genéricos ni convertir ausencia en cero.
3. Fitato: priorizar FAO/INFOODS PhyFoodComp y literatura analítica; registrar método y condición de muestra.
4. Polifenoles: requiere una definición operacional homogénea del campo y fuente compatible; Phenol-Explorer sirve para trazabilidad de compuestos/datos, pero no autoriza sumar o convertir automáticamente perfiles heterogéneos a un único mg/100 g total.
5. Fibra/carbohidrato/calcio/sodio/vitamina C/etc.: completar únicamente donde la fuente coincida con el alimento/preparación. No reemplazar silenciosamente ARGENFOODS por USDA.

## 5. Jerarquía de evidencia propuesta
P0-A: fuente primaria nacional exacta (ARGENFOODS/UNLu) con alimento + preparación coincidentes.
P0-B: base internacional oficial exacta (USDA FoodData Central/Foundation/SR Legacy) cuando la correspondencia de alimento + preparación sea explícita.
P0-C: base especializada analítica (FAO/INFOODS PhyFoodComp para fitato; Phenol-Explorer para polifenoles) cuando el campo tenga definición y unidad compatibles.
P0-D: artículo primario/revisión solo si documenta claramente alimento, preparación, método, unidad y población/muestra; requiere trazabilidad explícita.
NO AUTORIZADO: interpolación, promedio entre fuentes incompatibles, conversión de total a hemo/no-hemo, valor de otro estado de preparación sin regla formal, o cero por ausencia.

## 6. Registro mínimo por evidencia
Cada incorporación debe conservar:
- alimento_id
- nutriente
- preparación
- valor_por_100g
- unidad
- valor_min / valor_max si la fuente informa rango
- calidad_dato
- fuente_id
- trazabilidad (identificador de alimento/tabla/artículo)
- método analítico cuando exista
- condición de muestra
- incertidumbre/limitación
- decisión QA

## 7. Criterio de cierre de esta matriz
Una celda pasa de P/A a C solo cuando todos los componentes del arquetipo tienen dato compatible. El vector pasa a estado completo únicamente cuando las 14 celdas cumplen ese criterio.

Capa 2 continúa bloqueada mientras cualquiera de sus cinco interacciones permanezca en estado_qa=bloqueada.

## 8. Fuentes externas consultadas
- ARGENFOODS / Universidad Nacional de Luján: tablas por grupos y datos de composición.
- USDA FoodData Central: base oficial de composición; Foundation Foods y SR Legacy.
- FAO/INFOODS PhyFoodComp: repositorio analítico específico de fitato.
- Phenol-Explorer: base de datos de composición de polifenoles.

## 9. Decisión P0
NO se modifican filas de composición ni vectores en producción en esta acción. Esta entrega fija el contrato de evidencia y la ruta de complementación. La siguiente operación válida es incorporar únicamente valores con evidencia P0-A/P0-B/P0-C/P0-D compatible, recalcular QA en rama controlada y comparar Legacy ↔ Nuevo.
