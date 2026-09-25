-- Contrato Premium v1 — modo prueba fundador
-- Mantiene usuarios.nivel_acceso como fuente efectiva de acceso.
-- premium_subscriptions conserva la trazabilidad del origen de la activación.

ALTER TABLE public.premium_subscriptions
  DROP CONSTRAINT IF EXISTS premium_subscriptions_metodo_check;

ALTER TABLE public.premium_subscriptions
  ADD CONSTRAINT premium_subscriptions_metodo_check
  CHECK (metodo = ANY (ARRAY['alias'::text, 'mp'::text, 'fundador'::text]));

COMMENT ON COLUMN public.premium_subscriptions.metodo IS
  'Origen de la activación Premium: alias, mp o fundador. fundador es exclusivo del modo prueba y no representa una compra.';

COMMENT ON COLUMN public.usuarios.nivel_acceso IS
  'Fuente efectiva de autorización Premium. El backend decide el acceso; el frontend nunca lo declara por sí mismo.';

COMMENT ON COLUMN public.usuarios.premium_until IS
  'Vencimiento de Premium cuando corresponde. NULL mantiene el comportamiento histórico de Premium sin vencimiento definido.';
