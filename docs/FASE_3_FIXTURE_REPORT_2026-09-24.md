# Fase 3 — Fixture report legacy ↔ nuevo

Fecha: 2026-09-24

## Resolución de interfaz

La ruta Vercel `api/motor-nutricional-shadow.js` produjo deployment failure en dos intentos (`17fd3bb4...` y `01b370f4...`). El proveedor sólo devolvió la instrucción de inspección mediante Vercel CLI; sus logs no son accesibles desde las herramientas disponibles.

Se resolvió la dependencia de Vercel trasladando la interfaz ejecutable shadow a Supabase Edge Functions:
- `motor-nutricional-shadow` — POST, JWT requerido.
- `motor-nutricional-shadow-get` — GET, JWT requerido, sólo lectura de QA.
- Ambas funciones están ACTIVE en el proyecto `qfdsfzsuzxobghyoxqtu`.
- El motor sigue en modo shadow y `activable=false`.
- Las tablas motor permanecen server-side; no se expone service_role.

## Resultado de los 10 fixtures

La comparación se ejecutó sobre el estado real actual de Supabase: el comportamiento legacy se obtuvo aplicando la lógica de matching vigente de `registrar-comida.js` sobre las reglas actuales; el lado nuevo se obtuvo aplicando el contrato ejecutable del motor shadow sobre sus tablas QA actuales. Esto permite comparar decisiones con el mismo snapshot de datos, aunque no constituye una llamada HTTP simultánea a ambos endpoints porque el entorno de herramientas no permite invocar POST de Vercel/Supabase Edge directamente.

| Fixture | Legacy | Nuevo | Divergencia | Causa | Estado |
|---|---|---|---|---|---|
| pollo_papas | `Pollo con papas: proteína + papa` + `Pollo: comparar la preparación` | `bloqueado_por_vector_incompleto` (5/14) | Sí | Nuevo exige vector completo | No aceptada |
| arroz_pollo | `Guiso de arroz: arroz + acompañamiento` + `Arroz: una oportunidad para probar` + `Pollo: comparar la preparación` | `bloqueado_por_vector_incompleto` (6/14) | Sí | Nuevo exige vector completo | No aceptada |
| caballa_brocoli | `Brócoli: vegetal crucífero y preparación` | `bloqueado_por_vector_incompleto` (4/14) | Sí | Nuevo exige vector completo | No aceptada |
| brocoli_papa | `Brócoli: vegetal crucífero y preparación` | `bloqueado_por_vector_incompleto` (4/14) | Sí | Nuevo exige vector completo | No aceptada |
| guiso_lentejas | `Guiso de lentejas: legumbre + vegetales` | `bloqueado_por_vector_incompleto` (0/14) | Sí | Fixture nuevo deliberadamente no respaldado | No aceptada |
| guiso_arroz | `Guiso de arroz: arroz + acompañamiento` + `Arroz: una oportunidad para probar` | `bloqueado_por_vector_incompleto` (0/14) | Sí | Fixture nuevo deliberadamente no respaldado | No aceptada |
| guiso_fideos | `Guiso de fideos: fideos + ingredientes del guiso` + `Pastas: tipo de pasta + salsa + acompañamiento` | `bloqueado_por_vector_incompleto` (0/14) | Sí | Fixture nuevo deliberadamente no respaldado | No aceptada |
| ravioles | `Ravioles: pasta rellena + salsa` | `bloqueado_por_vector_incompleto` (0/14) | Sí | Fixture nuevo deliberadamente no respaldado | No aceptada |
| empanadas | `Empanadas: masa + relleno + método de cocción` + `Empanadas: horno vs. fritas` | `bloqueado_por_vector_incompleto` (0/14) | Sí | Fixture nuevo deliberadamente no respaldado | No aceptada |
| asado | `Asado: carnes + embutidos + acompañamientos` | `bloqueado_por_vector_incompleto` (0/14) | Sí | Fixture nuevo deliberadamente no respaldado | No aceptada |

## Gate

- Fixtures ejecutados/comparados: **10/10**.
- Divergencias: **10/10**.
- Divergencias explicadas: **10/10**.
- Divergencias aceptadas para migración: **0/10**.
- Vectores completos en los 4 arquetipos: **0/4**.
- Capa 2 activable: **NO**.
- Migración legacy → nuevo: **NO CERRADA**.

La divergencia no se corrige alterando silenciosamente el nuevo motor. El siguiente trabajo es completar los vectores científicos/QA de los cuatro arquetipos respaldados y decidir explícitamente qué hacer con los seis fixtures legacy fuera del corpus cuantitativo nuevo.
