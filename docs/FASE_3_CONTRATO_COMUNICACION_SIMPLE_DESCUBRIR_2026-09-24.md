# FASE 3 — CONTRATO DE COMUNICACIÓN SIMPLE: DESCUBRIR + ANTES DE COMER

Fecha: 2026-09-24
Estado: DISEÑADO → AUDITADO DOCUMENTALMENTE
Ámbito: comunicación de usuario
Restricción: no modifica motor científico, Capa 2, API ni producción

## 1. PRINCIPIO

La complejidad científica pertenece al sistema interno.
La superficie de usuario debe comunicar:

- qué está viendo;
- por qué puede ser interesante;
- qué puede observar;
- qué puede probar, cuando exista una acción real;
- cuál es el siguiente paso.

Nunca trasladar al usuario estados técnicos como vector, umbral, interacción, arquetipo, QA, fuente, score o cobertura.

## 2. DESCUBRIR

Propósito:
ENCONTRAR ALGO INTERESANTE PARA EXPLORAR.

Modelo mental:
explorar → entender → probar/observar → seguir descubriendo.

La pantalla no debe sentirse como catálogo nutricional.
Debe partir de situaciones humanas reconocibles.

Entrada principal:
“Entendé mejor lo que comés y cómo te sentís.”

Entrada contextual:
“Antes de comer” funciona como puerta de exploración inmediata, no como diagnóstico ni advertencia sanitaria.

## 3. ANTES DE COMER

Objetivo UX:
cerrar rápidamente la comprensión de que el usuario está entrando en un espacio de exploración antes de tomar una decisión cotidiana.

Secuencia visible:

1. ESCRIBÍ
   La comida que estás por comer.

2. MIRÁ
   Qué observación concreta aparece sobre esa combinación, si existe.

3. ENTENDÉ
   Por qué puede ser interesante observarla.

4. PROBÁ / OBSERVÁ
   Sólo cuando exista contenido real respaldado.

5. SEGUÍ
   Con otra exploración o con una profundización Premium contextual.

Regla:
si no existe un hallazgo concreto, comunicarlo como ausencia de observación disponible; nunca convertir ausencia de dato en señal negativa.

## 4. MICROCOPY OBJETIVO

Hero:
“Entendé mejor lo que comés y cómo te sentís.”

Apoyo:
“Explorá una situación concreta o mirá una comida antes de comerla. Acá empieza la exploración.”

Bloque:
“ANTES DE COMER”

Título:
“¿Estás por comer algo y querés saber qué observar?”

Descripción:
“Escribí la comida que estás pensando comer. Te mostramos una observación simple sobre esa combinación para que sepas qué mirar en tu experiencia.”

Input:
“Ej.: milanesa con papas fritas”

CTA:
“Ver qué observar”

Resultado:
“Observación antes de comer”

Subsección:
“Qué observar en tu experiencia”

Fallback:
“No encontramos una observación específica para esta combinación. Eso no significa que haya algo negativo: simplemente no tenemos un hallazgo concreto que señalar en esta consulta.”

## 5. REGLAS DE LENGUAJE

Usar:
- “puede ser interesante observar”
- “qué encontramos”
- “qué podés probar”
- “qué observar”
- “comparar”
- “tu experiencia”
- “esta combinación”
- “una oportunidad para explorar”

Evitar:
- “esto te causa”
- “esto te va a pasar”
- “corrige”
- “previene”
- “trata”
- “necesitás”
- “deberías” cuando implique prescripción
- lenguaje diagnóstico
- certeza individual no sustentada

## 6. PREMIUM

Premium no aparece como “más información”.

La secuencia debe ser:

hallazgo concreto
→ oportunidad concreta
→ posibilidad de experimentar
→ continuidad Premium.

CTA contextual:
“Explorar otra forma de probarlo →”

No utilizar CTA genérico cuando existe una solución concreta.

## 7. MARCOS CONDUCTUALES

B=MAP:
la interfaz reduce Ability al mínimo: una situación, una entrada, una respuesta.

JTBD:
“Quiero saber qué puedo observar antes de comer esto.”

Hook:
trigger contextual → consulta → hallazgo → observación/acción → nuevo descubrimiento.

Prospect Theory:
no usar miedo a consecuencias sanitarias; primero entregar valor observable.

Cognitive Ease:
frases cortas, verbos cotidianos, una idea por bloque.

## 8. BLINDAJE

La comunicación no debe prometer más de lo que el sistema puede demostrar.

La complejidad interna queda fuera de la interfaz.
La incertidumbre se expresa con lenguaje claro.
La ausencia de datos no se presenta como ausencia de salud ni como riesgo.

## 9. KPI

Primarios:
- activación de Descubrir;
- porcentaje de usuarios que ejecutan “Antes de comer”;
- consulta → devolución visible;
- retorno a Descubrir;
- D1/D7.

Secundarios:
- interacción con CTA contextual Premium;
- Free-to-Paid contextual;
- repetición de consultas “Antes de comer”.

## 10. GATE

Este contrato autoriza la siguiente implementación de contenido/UX sin reabrir la arquitectura científica.

No autoriza activar Capa 2 ni reemplazar el motor Legacy.

Producción permanece sin cambios.
