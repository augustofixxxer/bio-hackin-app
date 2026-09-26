# ETAPA PREMIUM 04 — Beneficios funcionales

## Alcance cerrado
Se convirtió el beneficio Premium principal en un circuito ejecutable de experimentación personal:

1. Crear una prueba con una variable y dos alternativas.
2. Registrar la experiencia de A.
3. Registrar la experiencia de B.
4. Cerrar la prueba solo cuando ambas experiencias existen.
5. Conservar la comparación cerrada en el historial Premium.

## Persistencia
Nueva tabla: `public.premium_experimentos`.

Campos principales:
- usuario_id
- origen
- titulo
- variable
- opcion_a / opcion_b
- registro_a / registro_b
- estado
- created_at / updated_at

La tabla tiene RLS habilitado y no se agregan políticas públicas. Las operaciones pasan por el backend autorizado.

## Seguridad
Cada operación exige:
- sesión válida;
- Premium vigente;
- términos aceptados;
- cuenta no suspendida;
- ownership por `usuario_id` en lectura/modificación.

No se expone información de otros usuarios.

## Producto
El circuito no intenta diagnosticar ni determinar causalidad médica. La comparación queda expresada como experiencia personal del usuario.

## Estado
Este bloque habilita el primer beneficio funcional Premium. No modifica Capa 2 ni activa interacciones científicas bloqueadas.
