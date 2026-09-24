# Fase 3 — Gate de suficiencia científica proporcional — 2026-09-24

## Decisión

Se fija formalmente que Reseteo Propio no perseguirá exactitud de laboratorio como condición de avance.

El estándar es **suficiencia funcional + trazabilidad + coherencia + bloqueo proporcional**.

## Aplicación al motor actual

Las 5 interacciones existentes dependen de hierro no hemo como nutriente objetivo y de un modificador específico:

| Interacción | Objetivo | Modificador | Estado actual |
|---|---|---|---|
| iron_nonheme__calcium | iron_nonheme_mg | calcium_mg | bloqueada |
| iron_nonheme__oxalate | iron_nonheme_mg | oxalate_mg | bloqueada |
| iron_nonheme__phytate | iron_nonheme_mg | phytate_mg | bloqueada |
| iron_nonheme__polyphenols | iron_nonheme_mg | polyphenols_mg | bloqueada |
| iron_nonheme__vitamin_c | iron_nonheme_mg | vitamin_c_mg | bloqueada |

El bloqueo es correcto para esas interacciones porque actualmente faltan elementos del contrato cuantitativo/QA de las reglas. No implica que toda observación general de una comida deba quedar bloqueada.

## Regla operativa resultante

- **Base:** usar la cobertura convencional disponible cuando sea suficiente para la observación concreta.
- **Especializado:** no inventar ni completar por ausencia.
- **Interacción:** exigir sólo los datos y QA que esa interacción necesita.
- **Salida de usuario:** traducir el resultado a lenguaje simple, sin exponer la complejidad técnica.
- **Legal/seguridad:** evitar afirmaciones de certeza que el motor no pueda sostener; este criterio no sustituye asesoramiento jurídico.

## Consecuencia para el Gate 3

La comparación Legacy ↔ Nuevo debe responder dos preguntas distintas:

1. **Paridad:** ¿ambos motores se comportan de forma explicable frente al mismo caso?
2. **Cobertura:** ¿qué funciones del motor nuevo tienen datos suficientes para ejecutarse?

Una falta de cobertura no será tratada automáticamente como una regresión de paridad.

## Verificación ejecutada

- El criterio quedó incorporado al contrato de migración en la rama congelada.
- No se modificó main.
- No se modificó producción.
- No se modificaron valores científicos de la base.
- Las 5 interacciones continúan bloqueadas.
- La invocación HTTP real del comparador sigue sin poder ejecutarse desde este entorno porque no hay salida de red disponible para realizar la llamada autenticada. No se declara PASS de paridad por este motivo.

## Próximo movimiento

Retomar el Gate 3 desde la ejecución real Legacy ↔ Nuevo cuando exista un canal de invocación QA. La ejecución deberá comparar los 10 fixtures y separar explícitamente divergencia de comportamiento de simple falta de cobertura.
