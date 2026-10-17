# Sprint: catálogo nutricional de 75 alimentos — inventario inicial

Fecha de auditoría: 2026-10-16  
Rama: `feat/catalogo-75-alimentos`  
Proyecto Supabase: `qfdsfzsuzxobghyoxqtu`

## Estado de base auditado

- `motor_nutricional_alimentos`: 46 registros.
- `motor_nutricional_composicion`: 229 registros.
- Cada alimento requiere `fuente_id`, `source_food_id`, `descripcion_fuente` y `tipo_fuente`.
- Cada composición requiere `alimento_id`, `nutriente_id`, `valor_por_100g`, `unidad`, `calidad_dato`, `fuente_id`. Por lo tanto, no se pueden guardar valores desconocidos como cero ni dejar una composición parcial con valor nulo.
- Unicidad vigente: `(fuente_id, source_food_id)` en alimentos y `(alimento_id, nutriente_id)` en composición.
- Fuentes registradas relevantes: ARGENFOODS/UNLu (preferencia nacional), USDA FoodData Central FNDDS y USDA Foundation Foods. La tabla también contiene SARA 2, que no se usará como sustituto silencioso de ARGENFOODS/USDA para esta solicitud.

## Inventario de incorporación priorizada

Estado inicial significa **pendiente de emparejamiento exacto con un registro de fuente primaria**, no que el alimento no exista en ninguna fuente. No insertar IDs aproximados, códigos inventados ni valores nutricionales reconstruidos de memoria.

| # | Alimento solicitado | Estado tras comparar con los 46 registros actuales | Próximo criterio de selección |
|---:|---|---|---|
| 1 | Atún al natural, escurrido | Nuevo candidato; no hay coincidencia exacta | USDA: especie/tipo, en agua, drenado; excluir variantes con aceite |
| 2 | Merluza | Nuevo candidato | Priorizar registro de especie/preparación compatible; documentar si USDA es el único match |
| 3 | Huevo entero hervido | Parcial: existe huevo entero crudo (ARGENFOODS 344), no hervido | Crear registro distinto solo con ID de fuente que represente huevo cocido/hervido |
| 4 | Pavo | Nuevo candidato | Definir corte y preparación antes de elegir fuente (pechuga/carne sola, cocida o cruda) |
| 5 | Cerdo magro | Parcial: existen chorizo y panceta, no corte magro | Seleccionar corte identificable y preparación equivalente; no reutilizar chorizo/panceta |
| 6 | Ricota | Nuevo candidato | Fuente con ricotta/ricotta cheese; confirmar contenido graso si está especificado |
| 7 | Queso untable descremado | Parcial: existe queso crema entero untable (ARGENFOODS 308) | Producto reducido en grasa debe tener registro separado; no extrapolar desde queso entero |
| 8 | Yogur natural | Nuevo candidato | Sin azúcar añadida; definir grasa (entero/descremado) según registro fuente |
| 9 | Avena arrollada | Nuevo candidato | USDA: rolled/old-fashioned oats; confirmar registro y tipo de dato |
| 10 | Batata hervida | Nuevo candidato | USDA: cooked, boiled; con/sin piel según registro |
| 11 | Lenteja hervida | Parcial: existe lenteja seca cruda (ARGENFOODS 80) | Crear entrada distinta para cocida/hervida, con ID específico |
| 12 | Arroz integral | Parcial: existe arroz blanco hervido (ARGENFOODS 2) | Seleccionar integral y declarar estado crudo/cocido sin mezclar bases |
| 13 | Pan integral | Parcial: existen pan francés y pan de Viena; no integral | Seleccionar pan 100% integral o equivalente explícito |
| 14 | Galletas de arroz | Nuevo candidato | Elegir producto simple y especificar si es sin sal o con sal |
| 15 | Quinoa | Nuevo candidato | Especificar cruda o cocida; evitar mezclar valores entre estados |
| 16 | Banana | Nuevo candidato | USDA/ARGENFOODS: parte comestible, cruda |
| 17 | Manzana | Nuevo candidato | Definir con/sin piel solo si la fuente lo diferencia |
| 18 | Naranja | Nuevo candidato | Parte comestible; no sustituir por jugo |
| 19 | Kiwi | Nuevo candidato | USDA Foundation: kiwi verde pelado crudo, si coincide con el alcance |
| 20 | Palta | Nuevo candidato | USDA Foundation: Hass pelada cruda, o ARGENFOODS si existe match trazable |
| 21 | Nueces | Nuevo candidato | Definir variedad/estado (p. ej., walnut/English, cruda) |
| 22 | Almendras | Nuevo candidato | USDA: almendra cruda; no usar tostada/salada como equivalente |
| 23 | Maní | Nuevo candidato | Definir crudo vs tostado; evitar mantequilla de maní como sustituto |
| 24 | Aceite de oliva | Nuevo candidato | Especificar tipo comercial/virgen si la fuente lo distingue |

## Regla de inserción

1. Confirmar el registro concreto en ARGENFOODS o USDA y guardar el ID exacto que devuelve la fuente.
2. Asociar `fuente_id` a la fila correcta de `motor_nutricional_fuentes`; no confundir el ID del alimento con el ID de la fuente.
3. Insertar alimento con estado `candidato` mientras se revisa equivalencia, base comestible y preparación.
4. Insertar solo nutrientes presentes explícitamente en la fuente, usando el `nutriente_id` y unidad canónica existentes. Los nutrientes ausentes no se convierten en cero ni se crean filas ficticias.
5. En cada fila de composición, completar `trazabilidad` con el identificador y la denominación de la fuente; mantener `calidad_dato='fuente'` cuando se transcribe un valor fuente.
6. Validar conteos, duplicados, FK y coherencia de preparación después de cada lote.
7. No modificar ni eliminar registros existentes ni relaciones con reglas/soluciones.

## Límite del primer corte

Este commit registra el inventario y los criterios de alta; **no carga IDs ni composiciones sin verificar**. El siguiente lote de datos debe acompañarse de evidencia de fuente por alimento. La lista contiene 24 objetivos nuevos o de variante/preparación pendiente; el objetivo nominal de 75 alimentos no debe alcanzarse con duplicados semánticos.
