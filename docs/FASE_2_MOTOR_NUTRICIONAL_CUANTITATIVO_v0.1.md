# Fase 2 — Motor Nutricional Cuantitativo
## Contrato técnico v0.1 — construcción controlada

**Estado:** Implementado en rama de trabajo; no conectado al motor productivo.  
**Rama:** `fase-2-motor-cuantitativo`  
**Baseline:** `4963e7691a3ae93a361eaaae3425235b9f09092c`

## 1. Objetivo

Construir el fundamento cuantitativo del nuevo motor sin modificar el flujo productivo existente.

Principio rector:

> La presencia textual identifica candidatos; la composición cuantitativa decide si existe una interacción relevante.

Las keywords, categorías y sinónimos no pueden ser autoridad nutricional.

## 2. Fuentes de composición

### Fuente primaria de implementación inicial

**USDA FoodData Central / FNDDS 2021–2023**

FNDDS proporciona perfiles de nutrientes, porciones y pesos de porción para alimentos y preparaciones consumidas en el sistema WWEIA/NHANES. USDA documenta que FNDDS contiene valores de nutrientes y pesos de porción, y que sus datos permiten convertir cantidades consumidas a gramos y determinar valores de nutrientes.

### Fuente complementaria

**USDA FoodData Central Foundation Foods**

Foundation Foods aporta composición analítica de alimentos individuales y valores por 100 g de porción comestible. Los pesos de porción permiten convertir los valores por 100 g a cantidades consumidas.

### Regla de procedencia

Cada valor cuantitativo debe conservar:

- fuente;
- identificador del alimento en la fuente;
- versión/fecha de la fuente;
- unidad;
- base de cálculo;
- método de transformación;
- estado de validación.

No se introducen valores nutricionales manuales sin procedencia.

## 3. Vector nutricional

El vector se expresa sobre la **cantidad realmente consumida**, no sobre una categoría.

Ejemplo conceptual:

```
mealVector = {
  energy_kcal,
  protein_g,
  carbohydrate_g,
  fat_g,
  fiber_g,
  iron_total_mg,
  iron_heme_mg,
  iron_nonheme_mg,
  calcium_mg,
  vitamin_c_mg,
  phytate_mg,
  polyphenols_mg,
  oxalate_mg,
  sodium_mg,
  ...
}
```

Importante:

- no todos los nutrientes estarán disponibles para todos los alimentos;
- ausencia de dato ≠ cero;
- dato estimado ≠ dato analítico;
- valores desconocidos deben conservar estado de incertidumbre.

## 4. Identidad y cantidad

La composición se construye por componentes:

```
comida
 ├─ componente
 │   ├─ alimento fuente
 │   ├─ cantidad consumida
 │   ├─ unidad original
 │   ├─ gramos normalizados
 │   └─ preparación
 └─ ...
```

La suma nutricional se realiza sobre gramos normalizados.

No se permite:

```
"pollo" → inferencia
```

Sí se permite:

```
"pollo"
→ alimento normalizado
→ 150 g consumidos
→ vector nutricional
→ evaluación de interacciones
```

## 5. Capa 2 — interacción

Una interacción candidata contiene:

- nutriente objetivo;
- factor modificador;
- dirección;
- mecanismo;
- umbral mínimo;
- unidad del umbral;
- peso relativo;
- grupo de dominancia;
- nivel de evidencia;
- fuente.

### Estado de umbrales

Los umbrales clínico/nutricionales **no se inventan durante la construcción**.

Cada interacción puede estar:

- `pending_validation`
- `validated`
- `disabled`

El motor nuevo solo podrá activar inferencias con interacciones `validated`.

Esto evita convertir evidencia de estudios de comidas aisladas en reglas universales. La literatura sobre absorción de hierro muestra precisamente que el efecto de componentes aislados puede ser más fuerte en estudios de una sola comida que en dietas completas, y que la composición conjunta importa.

## 6. Dominancia

La suma de efectos no será:

```
efecto A + efecto B + efecto C = tres alertas
```

La capa de inferencia debe:

1. filtrar por umbral;
2. agrupar interacciones compatibles;
3. calcular relevancia relativa;
4. seleccionar el factor dominante;
5. suprimir secundarios que no aporten información adicional;
6. devolver como máximo el fenómeno permitido por el contrato de producto.

## 7. Ejemplo inicial de dominio: hierro no hemo

La primera familia de interacción que se modelará será la disponibilidad del hierro no hemo porque el corpus existente ya contiene conocimiento relacionado con:

- hierro;
- vitamina C/ascorbato;
- fitatos;
- polifenoles;
- calcio;
- té/café.

La literatura humana documenta efectos de estos factores, pero también muestra que el efecto depende de cantidades, matriz alimentaria y contexto. Por eso el esquema permite representar umbrales y dominancia sin convertir una asociación textual en una advertencia automática.

No se activa ninguna regla clínica a partir de esta documentación hasta que el umbral concreto y su evidencia sean validados.

## 8. Capa 3

La salida del motor no contiene copy final.

Contrato conceptual:

```json
{
  "engine_version": "quant-v0.1",
  "status": "candidate",
  "phenomenon_key": "iron_nonheme_bioavailability_context",
  "target_nutrient": "iron_nonheme_mg",
  "dominant_factor": {
    "nutrient": "phytate_mg",
    "direction": "inhibitory",
    "relevance": 0
  },
  "secondary_factors_suppressed": [],
  "evidence_level": "medium",
  "source_trace": []
}
```

El contenido editorial se resuelve después mediante `phenomenon_key` y metadata aprobada.

## 9. Legal / producto

Este motor no podrá:

- diagnosticar;
- tratar;
- prescribir;
- afirmar enfermedad;
- inferir estado clínico individual;
- convertir un patrón nutricional en diagnóstico;
- generar copy médico.

El motor describe fenómenos nutricionales documentados y habilita observación/comparación personal.

## 10. Compatibilidad

Durante Fase 2:

- `registrar-comida.js` permanece sin importar el nuevo motor;
- `inicio.html` no se modifica;
- `api/pildora.js` no se modifica;
- Free/Premium no cambia;
- el corpus actual permanece intacto;
- el motor cuantitativo opera como componente aislado de validación.

## 11. Gate de promoción

El motor no podrá asumir autoridad productiva hasta demostrar:

1. composición reproducible;
2. unidades consistentes;
3. procedencia completa;
4. umbrales validados;
5. dominancia reproducible;
6. casos negativos sin activación;
7. casos positivos con activación;
8. regresiones históricas cubiertas;
9. salida compatible con la capa editorial;
10. ausencia de regresión en el contrato Free/Premium.

## 12. Fuentes técnicas

- USDA FoodData Central — documentación de tipos de datos.
- USDA FNDDS 2021–2023 — documentación y bases descargables.
- Estudios humanos sobre factores que modifican la absorción de hierro no hemo; usados aquí como soporte para diseñar el esquema, no como autorización automática de umbrales.


## 13. Restricción de despliegue Vercel

El proyecto debe tratar el límite de archivos/artefactos del plan Vercel vigente como una restricción de diseño. No se crearán archivos individuales por alimento, interacción o fixture nutricional si pueden agruparse en tablas/JSON/fixtures compactos. El nuevo motor debe minimizar el número de archivos de funciones serverless y evitar generar un archivo por entidad. La migración cuantitativa se mantiene en Supabase y en módulos compactos dentro del repositorio.

Antes de cualquier despliegue se debe verificar el límite vigente del plan gratuito de Vercel y contar los archivos desplegables reales del proyecto; no se asumirá que el límite histórico sigue siendo idéntico.
## 14. Política de artefactos

- Datos nutricionales masivos: Supabase, no archivos individuales.
- Interacciones: tabla Supabase, no un archivo por regla.
- Tests: suite agrupada, no un archivo por caso.
- Módulos serverless: mantener cantidad mínima y reutilizar módulos internos.
- No generar archivos de importación temporales dentro del árbol desplegable.
- Cualquier nueva función Vercel requiere justificar su necesidad frente al límite de archivos y al presupuesto de funciones del plan.
