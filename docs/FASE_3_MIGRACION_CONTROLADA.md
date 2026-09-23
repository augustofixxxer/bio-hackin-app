# Fase 3 — Migración controlada del motor nutricional

## Estado

Este documento define el gate de comparación legacy → motor nuevo. No activa el motor nuevo ni Capa 2.

## Contrato de migración

1. **Legacy permanece como fuente de verdad de producción** mientras la comparación no cierre.
2. El motor nuevo debe disponer de una **interfaz ejecutable identificable** (`MOTOR_NUTRICIONAL_ENGINE_URL` en QA) antes de poder comparar resultados.
3. Cada fixture debe registrar:
   - entrada normalizada;
   - decisión legacy;
   - decisión nueva;
   - divergencia;
   - explicación de la divergencia;
   - decisión de aceptación/rechazo.
4. Una divergencia no explicada es un **FAIL**, no un ajuste silencioso.
5. `estado_vector != completo` impide usar ese vector para una interacción.
6. `estado_qa = bloqueada` en una interacción impide su activación.
7. Free/Premium no se modifica durante esta etapa.
8. `inicio.html` queda fuera del alcance de esta migración.
9. No se modifica `main` ni producción desde este gate.

## Gate de salida

El Paso 3 solo puede cerrarse cuando:

- existe una interfaz ejecutable del motor nuevo;
- los fixtures de los cuatro arquetipos base pueden ejecutarse;
- legacy y nuevo producen resultados comparables;
- toda divergencia queda explicada y aceptada;
- no aparecen regresiones en Free/Premium;
- la suite shadow deja de fallar por ausencia de interfaz o datos incompletos;
- Capa 2 continúa bloqueada hasta disponer de umbrales y evidencia científica ejecutables.

## Resultado actual

**BLOQUEADO CONTROLADAMENTE.**

La infraestructura de comparación ya quedó instalada en la rama de baseline congelado, pero el sistema todavía no posee una interfaz ejecutable del motor nuevo y existen vectores incompletos. Por diseño, el gate falla cerrado en lugar de declarar una migración inexistente como PASS.