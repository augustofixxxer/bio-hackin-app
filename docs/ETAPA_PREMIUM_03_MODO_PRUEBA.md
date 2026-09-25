# ETAPA PREMIUM 03 — Modo prueba fundador

## Objetivo
Habilitar un recorrido Premium real para validación end-to-end del fundador sin convertir el modo experimental en una vía pública de compra.

## Implementación
- La activación usa `POST /api/premium?ruta=activar-fundador`.
- El servidor exige sesión válida.
- El servidor exige que el usuario autenticado coincida con `ADMIN_USER_ID`.
- La cuenta no puede estar suspendida.
- Los términos deben estar aceptados.
- La suscripción experimental se registra con `metodo=foundador`? No: el valor canónico es `metodo=fundador`.
- La autorización efectiva sigue siendo `usuarios.nivel_acceso=Premium`.
- La interfaz consulta luego `GET /api/premium?ruta=estado` para reflejar el estado real del servidor.
- La activación es idempotente: si ya existe una suscripción aprobada de fundador y Premium está activo, no crea otra.

## UX
El control aparece dentro del Área Premium cuando el servidor informa que Premium no está activo. El lenguaje identifica explícitamente que se trata de una activación experimental y no de una compra.

## Seguridad
No se exponen secretos, no se modifica RLS y no se crea una ruta pública alternativa. La autorización permanece server-side.

## Alcance cerrado
Este paso habilita el acceso experimental. No implementa todavía la funcionalidad completa de experimentación, comparación o historial Premium; eso corresponde al paso 4.
