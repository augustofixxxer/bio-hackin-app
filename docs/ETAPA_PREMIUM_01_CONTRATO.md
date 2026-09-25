# Contrato Premium v1 — Etapa 1

Fecha: 2026-09-25

## 1. Fuente efectiva de acceso

`public.usuarios.nivel_acceso` es la fuente efectiva de autorización Premium.

Valores actuales:
- `gratuito`
- `Premium`

El frontend no puede declarar ni elevar su propio nivel de acceso. Las APIs protegidas consultan el estado server-side.

## 2. Vencimiento

`public.usuarios.premium_until` controla el vencimiento cuando existe.

- Fecha futura: acceso Premium vigente.
- Fecha pasada: el acceso debe considerarse vencido por la lógica de acceso correspondiente.
- NULL: conserva el comportamiento histórico de cuentas Premium sin vencimiento definido.

## 3. Trazabilidad del origen

`public.premium_subscriptions` registra el origen de activación.

Métodos:
- `alias`: activación comercial existente.
- `mp`: activación comercial existente.
- `fundador`: activación exclusiva del modo prueba; monto 0 y no representa una compra.

La tabla es registro/auditoría del origen; la autorización efectiva continúa en `usuarios.nivel_acceso`.

## 4. Modo prueba fundador

Ruta backend:
`POST /api/premium?ruta=activar-fundador`

Condiciones:
- sesión válida mediante pase firmado;
- identidad igual a `ADMIN_USER_ID`;
- cuenta existente;
- cuenta no suspendida;
- Términos aceptados.

La ruta es idempotente para una activación de fundador ya existente.

Al activar:
1. registra `premium_subscriptions.metodo = fundador`;
2. registra `estado = aprobado`;
3. registra `monto = 0`;
4. establece `usuarios.nivel_acceso = Premium`;
5. establece `premium_until = NULL` para el entorno experimental.

No existe bypass de autenticación, RLS ni secretos desde el cliente.

## 5. Alcance

Este contrato habilita la siguiente etapa: construir la interfaz Premium y el recorrido de beneficios.

No implementa todavía:
- botones visibles de modo prueba;
- área Premium completa;
- flujo de experimentación;
- comparación;
- pagos nuevos.

Esos componentes pertenecen a los puntos 2–4 del roadmap.

## 6. Criterio de cierre

Etapa 1 cerrada cuando:
- el contrato está versionado;
- la base acepta el origen `fundador`;
- la activación está protegida server-side;
- el estado efectivo sigue siendo único;
- no se modifica la superficie pública de datos;
- no se relaja RLS.
