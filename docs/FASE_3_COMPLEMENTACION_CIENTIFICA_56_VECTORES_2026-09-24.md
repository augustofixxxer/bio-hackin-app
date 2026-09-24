# Fase 3 — Complementación científica de los 56 vectores

Fecha: 2026-09-24

## Resultado de ejecución

La búsqueda científica fue ejecutada sobre los cuatro arquetipos respaldados y sus cinco alimentos base.

**Resultado: NO se autoriza marcar los 56 vectores como `completo`.**

La complementación encontró evidencia suficiente para cubrir parte de los faltantes convencionales mediante fuentes fallback autorizadas, pero no existe evidencia homogénea y específica suficiente para completar sin inferencia los cinco componentes especializados que afectan el contrato de Capa 2:

- `iron_heme_mg`
- `iron_nonheme_mg`
- `oxalate_mg`
- `phytate_mg`
- `polyphenols_mg`

## Regla aplicada

La documentación de Reseteo Propio establece:

- prioridad: ARGENFOODS → SIFeGA → SARA 2 → LATINFOODS → USDA;
- USDA sólo como complemento;
- ausencia de dato nunca equivale a cero;
- no inferir ni sustituir silenciosamente;
- un vector sólo es elegible para interacción cuando está `completo`;
- Capa 2 continúa bloqueada.

## Evidencia encontrada

### Composición convencional

USDA FoodData Central ofrece datos analíticos y de composición, incluyendo Foundation Foods, SR Legacy y FNDDS. La plataforma documenta que sus datos proceden de análisis químicos, cálculos y otras fuentes documentadas.

Se localizaron referencias compatibles para:

- arroz blanco cocido;
- pollo cocido/asado;
- papa hervida;
- brócoli crudo;
- caballa cruda.

Estas referencias permiten complementar determinados nutrientes convencionales ausentes, pero no justifican automáticamente sustituir los valores ARGENFOODS ya existentes cuando hay diferencias de alimento, preparación o metodología.

### Hierro hemo/no hemo

La literatura sí contiene mediciones directas de hierro hemo y no hemo en carnes y aves. Por ejemplo, una revisión/consenso reporta medias para pollo cocido y una base específica de hierro hemo documenta valores según corte, método y grado de cocción.

Sin embargo, esos valores no son equivalentes automáticamente al alimento exacto `Pollo, asado al horno` usado por el fixture argentino. Por tanto, no se insertan como si fueran datos primarios del alimento.

Para caballa existe evidencia de hierro total y hemo en categorías de pescado, pero no una medición específica y compatible con el alimento argentino que permita completar de forma trazable el par hemo/no hemo sin inferencia.

### Fitato

FAO/INFOODS mantiene una base global específica de fitato con datos analíticos y bibliografía. También existe literatura específica para arroz blanco cocido y papa.

El problema es la heterogeneidad de cultivar, preparación, base húmeda/seca y método analítico. No se convierte un rango o un alimento distinto en un valor puntual del fixture sin una regla de transformación aprobada.

### Oxalato

Se localizaron datos publicados para brócoli, pero las cifras dependen de alimento, variedad y preparación. No se dispone de cobertura equivalente para los cinco alimentos exactos del corpus que permita completar toda la matriz sin extrapolación.

### Polifenoles

Phenol-Explorer es una base científica específica que recopila datos de publicaciones revisadas por pares y permite trazabilidad por alimento y compuesto. También existen estudios específicos de brócoli fresco/cocido.

Pero el campo requerido por el motor es `polyphenols_mg` como total. No es metodológicamente correcto mezclar arbitrariamente resultados de distintos métodos de cuantificación, equivalentes químicos o estados de procesamiento.

## Decisión de implementación

**No se modifica la tabla QA de vectores para convertir estados incompletos en `completo`.**

Tampoco se agregan valores de fuentes externas como si fueran equivalentes directos a ARGENFOODS cuando no existe correspondencia exacta de alimento/preparación.

Esto evita tres fallos críticos:

1. completar con números plausibles pero no trazables;
2. transformar rangos científicos en valores puntuales por inferencia;
3. habilitar indirectamente Capa 2 con datos que no cumplen el contrato científico.

## Estado

| Arquetipo | Estado científico |
|---|---|
| `pollo_papas` | BLOQUEADO |
| `arroz_pollo` | BLOQUEADO |
| `caballa_brocoli` | BLOQUEADO |
| `brocoli_papa` | BLOQUEADO |

**56/56 vectores siguen bajo el gate científico.**

Esto es intencional: la ejecución de complementación no debe confundirse con autorización para rellenar huecos.

## Próxima operación válida

Construir una **tabla de evidencia nutriente × alimento × preparación × fuente × método × unidad × incertidumbre**, usando sólo:

1. coincidencia exacta;
2. fallback autorizado con equivalencia explícita;
3. rango cuando el contrato de incertidumbre lo permita;
4. trazabilidad completa.

Sólo después de esa matriz se puede recalcular el QA vectorial y determinar cuántos de los 56 pueden pasar legítimamente a `completo`.

Capa 2 permanece bloqueada.
