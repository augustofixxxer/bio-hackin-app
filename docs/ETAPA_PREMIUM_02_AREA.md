# Etapa Premium 02 — Área Premium

## Objetivo

Convertir la pestaña Premium existente en el espacio contextual del usuario, sin reconstruir `inicio.html`.

## Implementado

- Consulta server-side del estado Premium mediante `GET /api/premium?ruta=estado`.
- El frontend nunca declara por sí mismo que el usuario es Premium.
- La interfaz distingue acceso activo de acceso no activo.
- Si el origen aprobado es `fundador`, la interfaz lo identifica como modo de prueba experimental.
- El hallazgo de origen continúa acompañando al usuario mediante `premiumContexto`.
- Se eliminó la duplicación del bloque contextual cuando ya existe un punto de partida.
- Se mantiene el mapa conceptual:
  1. Tu próximo paso
  2. Experimentación personal
  3. Historial y patrones
- El área no afirma todavía que esos beneficios sean funcionalmente ejecutables: la ejecución pertenece al punto 4 del roadmap.

## Seguridad

- La consulta exige sesión válida.
- La autorización Premium continúa siendo server-side.
- No se exponen secretos.
- No se modifica RLS.
- No se crea una segunda fuente de verdad de acceso.

## Fuera de alcance

- Activación automática de fundador.
- Cobro real.
- Implementación completa de experimentos.
- Persistencia de comparación.
- Nuevas métricas de usuario.

## Criterio de cierre

El usuario debe poder entrar a Premium, saber si su acceso está activo, reconocer desde qué hallazgo llegó y comprender visualmente qué herramientas componen su espacio Premium, sin prometer capacidades todavía no implementadas.
